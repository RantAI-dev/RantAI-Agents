import { NextResponse } from "next/server"
import { apiError, requireDesignContext } from "@/design/server/auth"
import { designSystems } from "@/design/server/design-catalog.generated"
import {
  createUserDesignSystem,
  listUserDesignSystems,
  type UserDesignSystemInput,
} from "@/design/server/user-design-systems"

// GET /api/design/design-systems
//
// Daemon shape (apps/daemon/src/routes/static-resource.ts):
// `{ designSystems: DesignSystemSummary[] }` — the list strips `body` (and, in
// our port, `packageInfo`). Merges the read-only bundled catalog
// (design-catalog.generated.ts, built-in presets) with the caller's own
// OdDesignSystem rows (source=user, isEditable=true). User systems come first
// so freshly created/generated ones surface at the top of the manager.
export async function GET(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const presets = designSystems.map(({ body, packageInfo, ...summary }) => summary)
  const users = await listUserDesignSystems(gate.ctx)
  return NextResponse.json({ designSystems: [...users, ...presets] })
}

// POST /api/design/design-systems
//
// Daemon shape (apps/daemon/src/routes/design-systems.ts): `201 { ...summary,
// designSystem }`. Creates a user design system from the provided draft
// (scaffolds a DESIGN.md when no body is given), scoped to the caller.
export async function POST(req: Request) {
  const gate = await requireDesignContext(req)
  if (!gate.ok) return gate.response
  let input: UserDesignSystemInput
  try {
    input = ((await req.json()) as UserDesignSystemInput) || {}
  } catch {
    return apiError(400, "BAD_REQUEST", "invalid request body")
  }
  const created = await createUserDesignSystem(gate.ctx, input)
  return NextResponse.json({ ...created, designSystem: created }, { status: 201 })
}
