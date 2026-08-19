import { NextResponse } from "next/server"
import { requireMobileAdmin } from "@/lib/mobile-admin"
import { listUsers, createUser } from "@/features/platform-admin/users-service"

export async function GET(request: Request) {
  const auth = await requireMobileAdmin(request)
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const params = new URL(request.url).searchParams
  const suspendedParam = params.get("suspended")
  const result = await listUsers({
    search: params.get("search") ?? undefined,
    role: (params.get("role") as "USER" | "ADMIN" | null) ?? undefined,
    suspended: suspendedParam === null ? undefined : suspendedParam === "true",
    page: params.get("page") ? Number(params.get("page")) : undefined,
    pageSize: params.get("pageSize") ? Number(params.get("pageSize")) : undefined,
  })
  return NextResponse.json(result)
}

export async function POST(request: Request) {
  const auth = await requireMobileAdmin(request)
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const body = await request.json().catch(() => null)
  if (!body?.email) return NextResponse.json({ error: "email is required" }, { status: 400 })
  const result = await createUser(auth.user, {
    email: body.email,
    name: body.name ?? "",
    password: body.password || undefined,
    role: body.role,
  })
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result, { status: 201 })
}
