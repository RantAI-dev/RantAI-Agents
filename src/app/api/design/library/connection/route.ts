import { NextResponse } from "next/server"
import { requireDesignContext } from "@/design/server/auth"
import { libraryConnectionStatus } from "@/design/server/library-store"

export const runtime = "nodejs"

// GET /api/design/library/connection
//
// Daemon shape (apps/daemon/src/routes/library.ts `/api/library/connection`):
// `{ paired, tokens: [...] }`. Reports whether the scope has any paired
// browser-extension token (OdLibraryToken). A fresh user has none → not paired.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const status = await libraryConnectionStatus(gate.ctx)
  return NextResponse.json(status)
}
