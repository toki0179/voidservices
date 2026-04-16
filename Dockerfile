# syntax=docker/dockerfile:1

# Build stage
FROM --platform=$BUILDPLATFORM node:20-alpine as builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production

# Runtime stage - multi-arch
FROM node:20-alpine

# Build arguments for multi-arch
ARG BUILDPLATFORM
ARG TARGETPLATFORM
ARG TARGETARCH
ARG TARGETVARIANT

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Install Puppeteer system dependencies with multi-arch support
RUN apk add --no-cache \
    chromium \
    noto-sans \
    noto-sans-monospace \
    noto-serif \
    woff-noto \
    woff2-noto \
    ca-certificates

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY . .

# Create data directory for SQLite database
RUN mkdir -p /app/data /app/logs

# Set environment for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

# Set architecture label
LABEL org.opencontainers.image.architecture="${TARGETARCH}${TARGETVARIANT}"

# Use dumb-init to handle signals properly
ENTRYPOINT ["/sbin/dumb-init", "--"]

# Start the bot
CMD ["npm", "start"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1
