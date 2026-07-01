import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { deleteLibraryAsset, getLibraryAsset } from "@/design/server/library-store"

export const runtime = "nodejs"

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/design/library/assets/[id]
//
// Daemon shape (apps/daemon/src/routes/library.ts): `{ asset: LibraryAsset }`.
// Scoped to the caller; 404 when missing / not owned.
export async function GET(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const asset = await getLibraryAsset(gate.ctx, id)
  if (!asset) return apiError(404, "NOT_FOUND", "asset not found")
  return NextResponse.json({ asset })
}

// DELETE /api/design/library/assets/[id]
//
// Daemon shape: `{ ok: true }`. Removes owned S3 bytes then the row (Prisma
// cascades sources / tasks / embedding). Scoped; 404 when missing / not owned.
export async function DELETE(req: Request, { params }: RouteParams) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const ok = await deleteLibraryAsset(gate.ctx, id)
  if (!ok) return apiError(404, "NOT_FOUND", "asset not found")
  return NextResponse.json({ ok: true })
}
