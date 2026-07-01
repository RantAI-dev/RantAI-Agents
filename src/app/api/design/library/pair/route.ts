import { NextResponse } from "next/server"
import { randomInt } from "node:crypto"
import { requireDesignContext } from "@/design/server/auth"
import type { LibraryPairingStartResponse } from "@open-design/contracts"

export const runtime = "nodejs"

const PAIRING_TTL_MS = 5 * 60 * 1000

// POST /api/design/library/pair
//
// Daemon shape (apps/daemon/src/routes/library.ts `/api/library/pair`):
// `{ code, expiresAt }` — a short pairing code shown to the user so a local
// browser extension can confirm-pair against the loopback daemon.
//
// STUB: browser-extension pairing targets a *local* daemon over loopback; there
// is no cloud analogue for the cross-origin `/pair/confirm` handshake (a
// per-tenant cloud backend is not something a `chrome-extension://` origin pairs
// with the same way). We return a well-formed code so the UI's "connect
// extension" affordance renders instead of erroring, but there is no confirm
// endpoint, so no token is ever minted. `GET /connection` therefore stays
// unpaired. Wiring real pairing would need a cloud-side confirm route + a token
// mint scoped to { userId, organizationId } (OdLibraryToken).
export async function POST(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
  const body: LibraryPairingStartResponse = {
    code,
    expiresAt: Date.now() + PAIRING_TTL_MS,
  }
  return NextResponse.json(body)
}
