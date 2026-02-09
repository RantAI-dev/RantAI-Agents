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
        // Widget API CORS headers
        source: "/api/widget/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, X-Widget-Api-Key" },
        ],
      },
    ]
  },
}

export default nextConfig
