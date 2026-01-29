import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupAuth } from "./auth";
import { csrfProtection, setupCsrfRoutes, shouldEnableCsrf } from "./csrf";
import { logEnvironmentStatus, isProduction, getPort, getHost } from "./env";
import { setupHealthRoutes } from "./health";
import { requestIdMiddleware } from "./middleware/requestId";
import { sanitizeInput } from "./middleware/sanitize";
import { initializeWebSocket } from "./websocket";
import { setupOpenApiRoutes } from "./openapi";
import { performanceMiddleware, performanceMonitor } from "./performance";

// Validate environment at startup
const envValid = logEnvironmentStatus(log);
if (!envValid && isProduction()) {
  console.error('Environment validation failed. Exiting.');
  process.exit(1);
}

const app = express();

// Security headers (Helmet - should be first)
// Configures various HTTP headers for security:
// - X-Content-Type-Options: nosniff
// - X-Frame-Options: DENY (prevents clickjacking)
// - X-XSS-Protection: 0 (disabled, CSP is more effective)
// - Strict-Transport-Security: enforces HTTPS
// - Content-Security-Policy: restricts resource loading
app.use(helmet({
  contentSecurityPolicy: isProduction() ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Needed for Vite in dev
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "wss:", "https://api.openai.com", "https://api.anthropic.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  } : false, // Disable CSP in development for easier debugging
  crossOriginEmbedderPolicy: false, // Needed for WebGazer
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
}));

// Request ID tracking (before other middleware)
app.use(requestIdMiddleware);

// Performance monitoring
app.use(performanceMiddleware);

// Health check routes (before rate limiting)
setupHealthRoutes(app);

// OpenAPI documentation routes
setupOpenApiRoutes(app);

// Performance stats endpoint
app.get('/api/performance/stats', (_req, res) => {
  const stats = performanceMonitor.getStats();
  res.json(stats);
});

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: process.env.NODE_ENV === "production"
    ? process.env.ALLOWED_ORIGINS?.split(",") || false
    : true, // Allow all origins in development
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token", "x-request-id"],
};
app.use(cors(corsOptions));

// Rate limiting configuration
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use("/api/", apiLimiter);

// Stricter rate limiting for LLM-powered endpoints (more expensive operations)
const llmLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per minute for LLM endpoints
  message: { error: "Rate limit exceeded for AI features. Please wait before trying again." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/orchestration/", llmLimiter);

// Authentication rate limiting to protect against brute force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login/register attempts per 15 minutes
  message: { error: "Too many authentication attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins toward the limit
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Input sanitization (after body parsing)
app.use(sanitizeInput);

// Setup authentication (session + passport)
setupAuth(app);

// Setup CSRF protection (after auth/session setup)
const csrfEnabled = shouldEnableCsrf();
if (csrfEnabled) {
  setupCsrfRoutes(app);
  app.use('/api/', csrfProtection({
    excludePaths: [
      '/api/csrf-token', // Token endpoint itself
      '/api/auth/login', // Initial login doesn't have token yet
      '/api/auth/register', // Initial registration doesn't have token yet
    ],
    enabled: csrfEnabled,
  }));
  log('CSRF protection enabled');
} else {
  log('CSRF protection disabled (development mode)');
}

// Response logging type
interface JsonResponseBody {
  [key: string]: unknown;
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: JsonResponseBody | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  interface HttpError extends Error {
    status?: number;
    statusCode?: number;
  }

  app.use((err: HttpError, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Initialize WebSocket server (attached to HTTP server on /ws path)
  initializeWebSocket(server);

  // Server configuration
  // Default PORT: 5174 (avoids macOS AirPlay Receiver conflict on port 5000)
  // Default HOST: 127.0.0.1 (localhost only; use 0.0.0.0 for external access)
  // Override with PORT and HOST environment variables
  const port = getPort();
  const host = getHost();
  server.listen(port, host, () => {
    log(`Server listening on http://${host}:${port}`);
    log(`WebSocket attached at ws://${host}:${port}/ws`);
    log(`API documentation: http://${host}:${port}/api/docs`);
  });
})();
