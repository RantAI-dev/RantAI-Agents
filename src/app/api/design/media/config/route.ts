import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"

// GET /api/design/media/config
//
// Daemon shape (apps/daemon/src/routes/media.ts, `readMaskedConfig`):
// `{ providers: Record<providerId, { configured, apiKeyTail, baseUrl, model }> }`.
// Media-provider BYOK credentials are stored on the local machine's media config
// in the daemon; the cloud port has no such per-user server store yet, so we
// return no configured providers. The SPA's `fetchMediaProvidersFromDaemon`
// iterates `payload.providers ?? {}`, so an empty map cleanly means "nothing
// configured server-side" and it falls back to its localStorage copy.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return NextResponse.json({ providers: {} })
}

// PUT /api/design/media/config
//
// The daemon persists the posted provider credentials and echoes the masked
// config. With no server-side media store ported, we accept the write as a no-op
// and echo the empty masked shape; the SPA keeps the user's copy in localStorage
// (its own fallback for an offline daemon), so nothing is lost.
export async function PUT(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  return NextResponse.json({ providers: {} })
}
