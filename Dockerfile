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
        python3-pip \
        make \
        g++ \
        chromium \
        chromium-driver \
        ca-certificates \
        fonts-freefont-ttf \
        fonts-noto \
        fonts-noto-cjk \
        fonts-noto-color-emoji \
        xvfb \
        wget \
        gnupg \
        libx11-6 \
        libxcb1 \
        libxcomposite1 \
        libxcursor1 \
        libxdamage1 \
        libxi6 \
        libxtst6 \
        libnss3 \
        libcups2 \
        libxss1 \
        libxrandr2 \
        libasound2 \
        libatk-bridge2.0-0 \
        libgtk-3-0 \
        libgbm1 \
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
    && /opt/generator-venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/generator-venv/bin/pip install --no-cache-dir \
        undetected-chromedriver \
        selenium \
        requests \
        colorama \
        pystyle \
        fake_useragent \
        tls-client \
        websocket-client \
        pydirectinput \
        pyautogui \
        'setuptools<70.0.0'

# Create data directory for SQLite database
RUN mkdir -p /app/data /app/logs /app/data/generated

# Persist runtime state across container/image updates
VOLUME ["/app/data", "/app/logs"]

# Set environment for Puppeteer and Browser Automation
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROME_BIN=/usr/bin/chromium \
    CHROMIUM_BIN=/usr/bin/chromium \
    SELFBOT_PYTHON=/opt/selfbot-venv/bin/python \
    GEN_PYTHON=/opt/generator-venv/bin/python \
    NODE_ENV=production \
    DISPLAY=:99 \
    XVFB_ARGS=":99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset"

# Set architecture label
LABEL org.opencontainers.image.architecture="${TARGETARCH}${TARGETVARIANT}"

# Create entrypoint script
RUN echo '#!/bin/bash\n\
# Start Xvfb\n\
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset &\n\
XVFB_PID=$!\n\
# Wait for Xvfb to start\n\
sleep 2\n\
# Start the main application\n\
npm start\n\
# Cleanup on exit\n\
kill $XVFB_PID\n\
' > /entrypoint.sh && chmod +x /entrypoint.sh

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--", "/entrypoint.sh"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1