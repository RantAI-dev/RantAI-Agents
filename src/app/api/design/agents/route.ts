import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"
import { listCloudAgents, serializeCloudAgentsSse } from "@/design/server/agents"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/design/agents  (SPA fetches /api/agents, rewritten by the
// install-api-base fetch shim → /api/design/agents).
//
// Daemon shape (apps/daemon/src/routes/static-resource.ts `/api/agents`):
//   - default:        `{ agents: AgentInfo[] }`
//   - `?stream=1`:    SSE, one `event: agent` per AgentInfo then `event: done`
//     (the SPA's registry.ts::fetchAgentsStream consumes this incrementally).
//
// The cloud port has no local agent CLIs to detect — every run goes through our
// model gateway — so we report ONE always-ready synthetic "cloud" agent
// (available + authStatus:'ok'). That single available/authenticated agent is
// what the SPA treats as "runtime setup complete": onboarding auto-advances and
// the composer auto-picks it (web/App.tsx auto-pick effect).
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response

  const url = new URL(req.url)
  const streamParam = url.searchParams.get("stream")
  const wantsStream = streamParam === "1" || streamParam === "true"

  if (!wantsStream) {
    return NextResponse.json({ agents: listCloudAgents() })
  }

  return new Response(serializeCloudAgentsSse(), {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (nginx) so SSE frames flush immediately.
      "X-Accel-Buffering": "no",
    },
  })
}
