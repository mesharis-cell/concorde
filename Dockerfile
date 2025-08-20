# Use Bun's official image as base
FROM oven/bun:1.1.29-alpine as base

# Set working directory
WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY . .

# Generate Prisma client
RUN bun run prisma:generate

# Create a non-root user
RUN addgroup -g 1001 -S bun && \
    adduser -S bun -u 1001

# Change ownership of the app directory to bun user
RUN chown -R bun:bun /app
USER bun

# Expose the port the app runs on
EXPOSE 3001

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Command to run the application
CMD ["bun", "start"]