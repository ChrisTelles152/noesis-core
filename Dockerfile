# syntax=docker/dockerfile:1

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Copy package files with structure preserved
COPY packages/adapters-attention-web/package*.json ./packages/adapters-attention-web/
COPY packages/adapters-llm/package*.json ./packages/adapters-llm/
COPY packages/core/package*.json ./packages/core/
COPY packages/sdk-web/package*.json ./packages/sdk-web/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy root package files
COPY package*.json ./

# Copy package files with structure preserved
COPY packages/adapters-attention-web/package*.json ./packages/adapters-attention-web/
COPY packages/adapters-llm/package*.json ./packages/adapters-llm/
COPY packages/core/package*.json ./packages/core/
COPY packages/sdk-web/package*.json ./packages/sdk-web/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/packages/adapters-attention-web/dist ./packages/adapters-attention-web/dist
COPY --from=builder /app/packages/adapters-llm/dist ./packages/adapters-llm/dist
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/sdk-web/dist ./packages/sdk-web/dist

# Set ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
