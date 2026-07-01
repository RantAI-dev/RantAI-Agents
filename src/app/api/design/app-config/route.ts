import { NextResponse } from "next/server"
import type { AppConfigPrefs } from "@open-design/contracts"
import { requireDesignContext } from "@/design/server/auth"

// GET /api/design/app-config
//
// Daemon shape (apps/daemon/src/routes/media.ts): `{ config: AppConfigPrefs }`.
// No server-side prefs store is ported yet and every AppConfigPrefs field is
// optional, so we return an empty config; the SPA falls back to its localStorage
// + DEFAULT_CONFIG for all preferences (`fetchDaemonConfig` merges over those).
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const config: AppConfigPrefs = {}
  return NextResponse.json({ config })
}
