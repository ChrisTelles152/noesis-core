import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { createError, ErrorCodes } from "./errors";

// Extend express-session types
declare module "express-session" {
  interface SessionData {
    passport?: {
      user?: number;
    };
  }
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
      password: string;
    }
  }
}

// Configure Passport Local Strategy
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await storage.verifyPassword(username, password);
      if (!user) {
        return done(null, false, { message: "Invalid username or password" });
      }
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  })
);

// Serialize user to session
passport.serializeUser((user: Express.User, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await storage.getUser(id);
    if (!user) {
      return done(null, false);
    }
    done(null, user);
  } catch (error) {
    done(error);
  }
});

// Setup session and passport middleware
export function setupAuth(app: Express): void {
  // Session configuration
  const MemoryStore = createMemoryStore(session);

  // SECURITY: Validate session secret in production
  const isProduction = process.env.NODE_ENV === "production";
  const defaultSecret = "noesis-development-secret-change-in-production";
  const sessionSecret = process.env.SESSION_SECRET || defaultSecret;

  if (isProduction && sessionSecret === defaultSecret) {
    console.error("╔════════════════════════════════════════════════════════════════╗");
    console.error("║  CRITICAL SECURITY ERROR: Default session secret in production ║");
    console.error("║  Set SESSION_SECRET environment variable to a secure value     ║");
    console.error("║  Generate one with: openssl rand -base64 32                    ║");
    console.error("╚════════════════════════════════════════════════════════════════╝");
    process.exit(1);
  }

  if (!process.env.SESSION_SECRET) {
    console.warn("[AUTH] Warning: Using default session secret. Set SESSION_SECRET in production.");
  }

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore({
      checkPeriod: 86400000, // Prune expired entries every 24h
    }),
    cookie: {
      secure: isProduction,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: "lax",
    },
  };

  // Trust proxy in production (for secure cookies behind reverse proxy)
  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Register auth routes
  registerAuthRoutes(app);
}

// Auth middleware to protect routes
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json(createError("Authentication required", ErrorCodes.AUTH_REQUIRED));
}

// Optional auth - attaches user if authenticated but doesn't block
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  // User is already attached by passport if authenticated
  next();
}

// Get current user ID (returns null if not authenticated)
export function getCurrentUserId(req: Request): number | null {
  // Check if passport is initialized (isAuthenticated exists) and user is authenticated
  if (typeof req.isAuthenticated === "function" && req.isAuthenticated() && req.user) {
    return req.user.id;
  }
  return null;
}

// Register authentication routes
function registerAuthRoutes(app: Express): void {
  // Register a new user
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      // Validate username
      if (!username || typeof username !== "string" || username.length < 3) {
        return res.status(400).json(createError(
          "Username must be at least 3 characters",
          ErrorCodes.VALIDATION_USERNAME_INVALID,
          { field: "username", minLength: 3 }
        ));
      }
      if (username.length > 50) {
        return res.status(400).json(createError(
          "Username must be at most 50 characters",
          ErrorCodes.VALIDATION_USERNAME_INVALID,
          { field: "username", maxLength: 50 }
        ));
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return res.status(400).json(createError(
          "Username can only contain letters, numbers, underscores, and hyphens",
          ErrorCodes.VALIDATION_USERNAME_INVALID,
          { field: "username", allowedChars: "a-zA-Z0-9_-" }
        ));
      }

      // Validate password with complexity requirements
      if (!password || typeof password !== "string") {
        return res.status(400).json(createError(
          "Password is required",
          ErrorCodes.VALIDATION_MISSING_FIELD,
          { field: "password" }
        ));
      }
      if (password.length < 8) {
        return res.status(400).json(createError(
          "Password must be at least 8 characters",
          ErrorCodes.VALIDATION_PASSWORD_WEAK,
          { field: "password", minLength: 8 }
        ));
      }
      if (password.length > 128) {
        return res.status(400).json(createError(
          "Password must be at most 128 characters",
          ErrorCodes.VALIDATION_PASSWORD_WEAK,
          { field: "password", maxLength: 128 }
        ));
      }
      // SECURITY: Require password complexity
      // At least one uppercase, one lowercase, one digit, and one special character
      const hasUppercase = /[A-Z]/.test(password);
      const hasLowercase = /[a-z]/.test(password);
      const hasDigit = /[0-9]/.test(password);
      const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

      if (!hasUppercase || !hasLowercase || !hasDigit || !hasSpecial) {
        return res.status(400).json(createError(
          "Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character",
          ErrorCodes.VALIDATION_PASSWORD_WEAK,
          {
            field: "password",
            requirements: { uppercase: true, lowercase: true, digit: true, special: true },
            missing: {
              uppercase: !hasUppercase,
              lowercase: !hasLowercase,
              digit: !hasDigit,
              special: !hasSpecial,
            }
          }
        ));
      }

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json(createError(
          "Username already exists",
          ErrorCodes.RESOURCE_ALREADY_EXISTS,
          { field: "username" }
        ));
      }

      // Create the user
      const user = await storage.createUser({ username, password });

      // Log the user in after registration
      req.login(user, (err) => {
        if (err) {
          console.error("Login after registration failed:", err);
          return res.status(500).json({ error: "Registration successful but login failed" });
        }
        // Return user info (without password)
        res.status(201).json({
          id: user.id,
          username: user.username,
        });
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // Login
  app.post("/api/auth/login", (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", (err: Error | null, user: User | false, info: { message: string } | undefined) => {
      if (err) {
        console.error("Login error:", err);
        return res.status(500).json(createError("Login failed", ErrorCodes.INTERNAL_ERROR));
      }
      if (!user) {
        return res.status(401).json(createError(
          info?.message || "Invalid credentials",
          ErrorCodes.AUTH_INVALID_CREDENTIALS
        ));
      }
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error("Session login error:", loginErr);
          return res.status(500).json({ error: "Login failed" });
        }
        res.json({
          id: user.id,
          username: user.username,
        });
      });
    })(req, res, next);
  });

  // Logout
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ error: "Logout failed" });
      }
      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          console.error("Session destroy error:", destroyErr);
        }
        res.clearCookie("connect.sid");
        res.json({ message: "Logged out successfully" });
      });
    });
  });

  // Get current user
  app.get("/api/auth/me", (req: Request, res: Response) => {
    if (req.isAuthenticated() && req.user) {
      res.json({
        id: req.user.id,
        username: req.user.username,
      });
    } else {
      res.status(401).json({ error: "Not authenticated" });
    }
  });

  // Check if username is available
  app.get("/api/auth/check-username/:username", async (req: Request, res: Response) => {
    try {
      const { username } = req.params;
      const existingUser = await storage.getUserByUsername(username);
      res.json({ available: !existingUser });
    } catch (error) {
      console.error("Username check error:", error);
      res.status(500).json({ error: "Failed to check username" });
    }
  });
}
