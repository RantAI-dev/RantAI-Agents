# Stage 1: Build Theia application (needs node/yarn for theia build tooling)
FROM node:20-bullseye AS builder

RUN apt-get update && apt-get install -y \
    make \
    g++ \
    python3 \
    libsecret-1-dev \
    libx11-dev \
    libxkbfile-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /theia

COPY package.json .
RUN yarn install --frozen-lockfile 2>/dev/null || yarn install
RUN yarn build

# Remove dev dependencies and source maps to reduce size
RUN yarn install --production \
    && find . -name "*.ts" -not -name "*.d.ts" -delete \
    && find . -name "*.map" -delete

# Stage 2: Lean runtime — just enough to serve the IDE
FROM node:20-bullseye-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    git \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r theia && useradd -r -g theia -m -s /bin/bash theia

WORKDIR /theia
COPY --chown=theia:theia --from=builder /theia /theia

# Create workspace directory and default settings
RUN mkdir -p /workspace/.theia && chown -R theia:theia /workspace
COPY --chown=theia:theia settings.json /workspace/.theia/settings.json
COPY --chown=theia:theia entrypoint.js /theia/entrypoint.js

USER theia

EXPOSE 3000

ENTRYPOINT ["node", "entrypoint.js", "/workspace", "--hostname=0.0.0.0"]
