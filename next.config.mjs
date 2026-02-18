/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // External packages with native bindings (canvas for OCR, LibSQL for database)
  serverExternalPackages: [
    "canvas", 
    "pdf-img-convert", 
    "sharp", 
    "@libsql/client", 
    "@libsql/win32-x64-msvc", 
    "@mastra/libsql"
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
