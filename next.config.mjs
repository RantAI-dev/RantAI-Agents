/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // External packages with native bindings (canvas for PDF-to-image OCR)
  serverExternalPackages: ["canvas", "pdf-img-convert", "sharp"],
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
