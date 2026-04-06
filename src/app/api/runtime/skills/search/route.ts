import { NextResponse } from "next/server"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { RuntimeSkillSearchQuerySchema } from "@/features/runtime/skills/schema"
import { searchRuntimeSkills } from "@/features/runtime/skills/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

export async function GET(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { employeeId } = await verifyRuntimeToken(token)
    const url = new URL(req.url)
    const parsed = RuntimeSkillSearchQuerySchema.safeParse({
      q: url.searchParams.get("q") || "",
      source: url.searchParams.get("source") || "",
    })
    if (!parsed.success) {
      return NextResponse.json({ error: "Search failed" }, { status: 500 })
    }

    const result = await searchRuntimeSkills({ employeeId, query: parsed.data })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Runtime skill search failed:", error)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
