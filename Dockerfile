# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim

# Build arguments for multi-arch
ARG BUILDPLATFORM
ARG TARGETPLATFORM
ARG TARGETARCH
ARG TARGETVARIANT

WORKDIR /app

# Install dumb-init, build toolchain, and Puppeteer/system dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        dumb-init \
        python3 \
        python3-venv \
        make \
        g++ \
        chromium \
        ca-certificates \
        fonts-freefont-ttf \
        fonts-noto \
        fonts-noto-cjk \
        fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Install production dependencies directly in target image/arch
COPY package.json package-lock.json ./
RUN npm ci --only=production \
    && npm rebuild better-sqlite3 --build-from-source

# Copy application code
COPY . .

# Create isolated Python environments for selfbot and generator dependencies
RUN python3 -m venv /opt/selfbot-venv \
    && /opt/selfbot-venv/bin/pip install --no-cache-dir -r /app/selfbot/requirements.txt \
    && python3 -m venv /opt/generator-venv \
    && /opt/generator-venv/bin/pip install --no-cache-dir -r /app/generator/requirements.txt

# Create data directory for SQLite database
RUN mkdir -p /app/data /app/logs

# Persist runtime state across container/image updates
VOLUME ["/app/data", "/app/logs"]

# Set environment for Puppeteer and Browser Automation
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROME_BIN=/usr/bin/chromium \
    CHROMIUM_BIN=/usr/bin/chromium \
    SELFBOT_PYTHON=/opt/selfbot-venv/bin/python \
    GEN_PYTHON=/opt/generator-venv/bin/python \
    NODE_ENV=production

# Set architecture label
LABEL org.opencontainers.image.architecture="${TARGETARCH}${TARGETVARIANT}"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the bot
CMD ["npm", "start"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1
