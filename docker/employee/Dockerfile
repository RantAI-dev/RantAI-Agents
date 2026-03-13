# ── Stage 1: Build RantaiClaw from source (local submodule) ────────
FROM debian:bookworm-slim AS rantaiclaw-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates build-essential pkg-config \
    libssl-dev perl cmake && \
    rm -rf /var/lib/apt/lists/*

# Install Rust nightly (RantaiClaw requires rustc 1.91+)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain nightly
ENV PATH="/root/.cargo/bin:${PATH}"

# Copy from local submodule — requires build context at repo root:
#   docker build -f docker/employee/Dockerfile -t rantai/employee:latest .
COPY packages/rantaiclaw /build/rantaiclaw
WORKDIR /build/rantaiclaw
RUN cargo build --release --features whatsapp-web && \
    cp target/release/rantaiclaw /usr/local/bin/rantaiclaw

# ── Stage 2: Grab Python 3.12 from official slim image ──────────
FROM python:3.12-slim-bookworm AS python-src

# ── Stage 3: Runtime image ───────────────────────────────────────
FROM debian:bookworm-slim

# Copy RantaiClaw binary
COPY --from=rantaiclaw-builder /usr/local/bin/rantaiclaw /usr/local/bin/rantaiclaw

# Copy Python 3.12 from official image (avoids compiling from source)
COPY --from=python-src /usr/local/bin/python3.12 /usr/local/bin/python3.12
COPY --from=python-src /usr/local/bin/pip3.12 /usr/local/bin/pip3.12
COPY --from=python-src /usr/local/lib/python3.12/ /usr/local/lib/python3.12/
COPY --from=python-src /usr/local/lib/libpython3.12.so* /usr/local/lib/
RUN ln -sf /usr/local/bin/python3.12 /usr/local/bin/python3 && \
    ln -sf /usr/local/bin/python3.12 /usr/local/bin/python && \
    ln -sf /usr/local/bin/pip3.12 /usr/local/bin/pip3 && \
    ln -sf /usr/local/bin/pip3.12 /usr/local/bin/pip && \
    ldconfig

# Install Node.js 22 LTS + Bun + minimal system deps + tools needed by ClawHub skills
# Includes Playwright/headless browser system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl unzip libssl3 git jq sudo \
    # Browser / Playwright system deps
    libglib2.0-0 libnss3 libnspr4 libdbus-1-3 libatk1.0-0 \
    libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libatspi2.0-0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libxshmfence1 fonts-liberation xdg-utils wget \
    # Browser playground: Firefox ESR + display stack
    firefox-esr xvfb x11vnc novnc websockify xdotool && \
    # Install Node.js 22 LTS (real node/npm/npx for tool compatibility)
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    # Install Bun (as bun/bunx only, not aliased to node)
    curl -fsSL https://bun.sh/install | bash && \
    mv /root/.bun/bin/bun /usr/local/bin/bun && \
    ln -sf /usr/local/bin/bun /usr/local/bin/bunx && \
    rm -rf /root/.bun && \
    rm -rf /var/lib/apt/lists/*

# Copy Agent Runner
COPY docker/employee/agent-runner/ /opt/agent-runner/
WORKDIR /opt/agent-runner

# Volume mount point for persistent data
VOLUME /data

# Expose gateway port for RantaiClaw
EXPOSE 8080 6080

ENTRYPOINT ["bun", "run", "/opt/agent-runner/index.js"]
