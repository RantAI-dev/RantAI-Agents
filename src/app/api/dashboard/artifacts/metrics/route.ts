import "server-only"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { metrics } from "@/lib/document-script/metrics"

export const runtime = "nodejs"

/**
 * D-38: surface document-script counters via a Prometheus-style text
 * endpoint. Scrapers (Prometheus, Datadog Agent, Vector) consume the
 * exposition format directly; humans can curl it.
 *
 * Auth-gated to logged-in users so the endpoint can sit on a public host
 * without leaking internal counters anonymously. Tighten further (e.g.
 * admin-only) if your deployment exposes this through a reverse proxy.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const c = metrics()
  const lines: string[] = []
  const emit = (name: string, help: string, type: "counter" | "gauge", value: number) => {
    lines.push(`# HELP ${name} ${help}`)
    lines.push(`# TYPE ${name} ${type}`)
    lines.push(`${name} ${value}`)
  }
  emit("artifact_sandbox_attempts_total", "Total document-script sandbox runs.", "counter", c.sandbox_attempts)
  emit("artifact_sandbox_failures_total", "Sandbox runs that failed.", "counter", c.sandbox_failures)
  emit("artifact_sandbox_duration_ms_total", "Cumulative sandbox wall time (ms).", "counter", c.sandbox_duration_ms_total)
  emit("artifact_render_attempts_total", "Total preview-pipeline runs (sandbox→soffice→pdftoppm).", "counter", c.render_attempts)
  emit("artifact_render_failures_total", "Preview-pipeline runs that failed.", "counter", c.render_failures)
  emit("artifact_render_duration_ms_total", "Cumulative pipeline wall time (ms).", "counter", c.render_duration_ms_total)
  return new Response(lines.join("\n") + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}
