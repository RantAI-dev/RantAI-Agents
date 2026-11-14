import { rustHealth } from "@/lib/rust-router/health"

export const dynamic = "force-dynamic"

// GET /api/health — Next is up; with RUST_API_URL set, also whether Rust's /readyz answers.
// Always 200: a Rust outage must not make an orchestrator restart the Next.js process.
export async function GET() {
  const rust = await rustHealth()
  return Response.json({ status: "ok", rust }, { headers: { "Cache-Control": "no-store" } })
}
