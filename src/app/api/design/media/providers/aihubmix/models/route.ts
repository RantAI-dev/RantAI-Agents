import { NextResponse } from "next/server"

// GET /api/design/media/providers/aihubmix/models?type=<catalog>
//
// The daemon (apps/daemon/src/routes/media.ts) proxies AIHubMix's public model
// catalogue so the media pickers can list the live image/video/tts models. This
// is a BYOK / provider-integration surface the cloud build does not wire up, so
// we return an empty (but valid) catalogue. The SPA's `fetchAIHubMixModels`
// reads `payload.models ?? []` and keeps its static AIHubMix seeds, so the
// picker is never empty.
export function GET() {
  return NextResponse.json({ ok: true, models: [] })
}
