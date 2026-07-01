import { NextResponse } from "next/server"
import type { AppConfigPrefs } from "@open-design/contracts"
import { requireDesignContext } from "@/design/server/auth"

// GET /api/design/app-config
//
// Daemon shape (apps/daemon/src/routes/media.ts): `{ config: AppConfigPrefs }`.
// The SPA merges this over its localStorage + DEFAULT_CONFIG
// (web/state/config.ts::mergeDaemonConfig / fetchDaemonConfig).
//
// UNLOCK: we report `onboardingCompleted: true`. On a fresh browser the SPA's
// DEFAULT_CONFIG has `onboardingCompleted: false`, which makes App.tsx
// force-navigate to the "Sign in to Open Design" onboarding gate
// (`if (!next.onboardingCompleted) navigate({ view: 'onboarding' })`).
// mergeDaemonConfig copies this daemon value in (`if
// (daemonConfig.onboardingCompleted != null) next.onboardingCompleted = …`), so
// reporting true skips the gate entirely and the SPA lands on the studio home.
// The cloud port has no local-runtime onboarding to complete — the always-ready
// cloud agent (GET /api/design/agents) is the sole runtime — so onboarding is
// always "done".
//
// All other AppConfigPrefs fields are left unset so the SPA keeps its
// localStorage + DEFAULT_CONFIG values (mode:'daemon', agentId:null → the
// App.tsx auto-pick effect selects the single available cloud agent).
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const config: AppConfigPrefs = { onboardingCompleted: true }
  return NextResponse.json({ config })
}

// PUT /api/design/app-config
//
// Daemon shape (apps/daemon/src/routes/media.ts): accepts an AppConfigPrefs body
// and returns the persisted `{ config }`. The SPA's syncConfigToDaemon
// (web/state/config.ts) fires this on every config change and only checks
// `response.ok`. No server-side prefs store is ported yet, so we accept and echo
// the submitted config (forcing `onboardingCompleted: true` to stay consistent
// with GET so a stale client write can never re-arm the onboarding gate). The
// user's own copy still lives in localStorage; this keeps the wire contract
// satisfied without silently dropping the request.
export async function PUT(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  let body: AppConfigPrefs
  try {
    body = (await req.json()) as AppConfigPrefs
  } catch {
    body = {}
  }
  const config: AppConfigPrefs = { ...body, onboardingCompleted: true }
  return NextResponse.json({ config })
}
