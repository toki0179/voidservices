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
        tesseract-ocr \
        libtesseract-dev \
    && rm -rf /var/lib/apt/lists/

# Install Chromium v120 with architecture-aware snapshot packages
RUN if [ "${TARGETARCH}" = "amd64" ] || [ "${TARGETARCH}" = "arm64" ]; then \
    wget -q "https://snapshot.debian.org/archive/debian/20240121T032514Z/pool/main/c/chromium/chromium_120.0.6099.224-1~deb12u1_${TARGETARCH}.deb" -O /tmp/chromium.deb \
    && wget -q "https://snapshot.debian.org/archive/debian/20240121T032514Z/pool/main/c/chromium/chromium-common_120.0.6099.224-1~deb12u1_${TARGETARCH}.deb" -O /tmp/chromium-common.deb \
    && wget -q "https://snapshot.debian.org/archive/debian/20240121T032514Z/pool/main/c/chromium/chromium-driver_120.0.6099.224-1~deb12u1_${TARGETARCH}.deb" -O /tmp/chromium-driver.deb \
    && wget -q "https://snapshot.debian.org/archive/debian/20240121T032514Z/pool/main/c/chromium/chromium-sandbox_120.0.6099.224-1~deb12u1_${TARGETARCH}.deb" -O /tmp/chromium-sandbox.deb \
        && dpkg -i /tmp/chromium*.deb || true \
        && apt-get update \
        && apt-get install -f -y; \
    else \
        echo "Unsupported TARGETARCH for pinned Chromium v120: ${TARGETARCH}" \
        && exit 1; \
    fi \
    && ln -sf /usr/bin/chromium /usr/bin/google-chrome-stable \
    && rm -rf /var/lib/apt/lists/* /tmp/*.deb

# Verify Chromium installation
RUN chromium --version || chromium-browser --version
    
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
    && /opt/generator-venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/generator-venv/bin/pip install --no-cache-dir -r /app/generator/requirements.txt \
    && /opt/generator-venv/bin/python -m playwright install --with-deps

# Create data directory for SQLite database
RUN mkdir -p /app/data /app/logs /app/data/generated

# Ensure data directory is writable by all users (fixes SQLite access issues)
RUN chmod -R 777 /app/data

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