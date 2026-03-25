import { NextResponse } from "next/server"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { RuntimeSkillInstallSchema } from "@/src/features/runtime/skills/schema"
import { installRuntimeSkill } from "@/src/features/runtime/skills/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { employeeId } = await verifyRuntimeToken(token)
    const parsed = RuntimeSkillInstallSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Install failed" }, { status: 500 })
    }

    const result = await installRuntimeSkill({ employeeId, input: parsed.data })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Runtime skill install failed:", error)
    const msg = error instanceof Error ? error.message : "Install failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
