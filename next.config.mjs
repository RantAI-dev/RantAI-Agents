import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))

// Force a single physical copy of @codemirror/state and @codemirror/view.
// Bun keeps nested copies even when versions match; the CodeMirror runtime
// uses `instanceof` checks that fail across separate module instances.
// Turbopack treats absolute paths as server-relative, so use project-relative.
const codemirrorAliasesTurbo = {
  "@codemirror/state": "./node_modules/@codemirror/state",
  "@codemirror/view": "./node_modules/@codemirror/view",
}
const codemirrorAliasesWebpack = {
  "@codemirror/state": resolve(__dirname, "node_modules/@codemirror/state"),
  "@codemirror/view": resolve(__dirname, "node_modules/@codemirror/view"),
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  turbopack: {
    resolveAlias: codemirrorAliasesTurbo,
  },
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, ...codemirrorAliasesWebpack }
    return config
  },
  // External packages with native bindings (canvas for OCR, LibSQL for database)
  serverExternalPackages: [
    "canvas",
    "pdf-img-convert",
    "sharp",
    "@libsql/client",
    "@libsql/win32-x64-msvc",
    "@mastra/libsql",
    "dockerode",
    "docker-modem",
    "ssh2",
    "jsdom"
  ],
  async headers() {
    return [
      {
        // Global security headers
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Widget API CORS headers
        source: "/api/widget/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, X-Widget-Api-Key" },
        ],
      },
      {
        // MCP Server CORS headers (external MCP clients)
        source: "/api/mcp/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version" },
        ],
      },
    ]
  },
}

export default nextConfig
