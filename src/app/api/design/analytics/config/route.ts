import { NextResponse } from "next/server"
import type { AnalyticsConfigResponse } from "@open-design/contracts"

// GET /api/design/analytics/config
//
// Daemon shape (apps/daemon/src/routes/telemetry.ts + analytics.ts): PostHog
// runtime config gated on a build-time key + user consent. The cloud port ships
// no PostHog key, so we return the daemon's disabled baseline
// (`enabled: false`, null key/host). The SPA's analytics client + error tracker
// both treat a missing key/host as "telemetry off" and no-op cleanly.
export function GET() {
  const body: AnalyticsConfigResponse = {
    enabled: false,
    env: "web",
    key: null,
    host: null,
  }
  return NextResponse.json(body)
}
