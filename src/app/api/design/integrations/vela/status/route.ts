import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"

// GET /api/design/integrations/vela/status  (SPA fetches
// /api/integrations/vela/status, rewritten → here).
//
// Daemon shape (apps/daemon/src/routes/vela.ts `/api/integrations/vela/status`):
// a VelaLoginStatus projection of the local `~/.amr` AMR/Vela CLI auth state
// (web/providers/daemon.ts::VelaLoginStatus / fetchVelaLoginStatus). AMR/Vela is
// open-design's *local* cloud-CLI runtime; the RantAI cloud port does not use it
// — our gateway is the cloud runtime. We report a stable "not signed in /
// disabled" projection so the endpoint stops 404-ing. The SPA's EntryShell keeps
// `amrSignedIn` false and simply never offers the AMR sign-in path; it is
// irrelevant here because onboarding is skipped (app-config reports
// onboardingCompleted:true) and the composer uses the always-ready cloud agent.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return NextResponse.json({
    loggedIn: false,
    loginInFlight: false,
    profile: "default",
    user: null,
    configPath: "",
  })
}
