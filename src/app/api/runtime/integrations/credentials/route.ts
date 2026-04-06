import { NextResponse } from "next/server"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { RuntimeIntegrationCredentialsSchema } from "@/features/runtime/integrations/schema"
import { requestRuntimeIntegrationCredentials } from "@/features/runtime/integrations/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { employeeId } = await verifyRuntimeToken(token)
    const parsed = RuntimeIntegrationCredentialsSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Failed" }, { status: 500 })
    }

    const result = await requestRuntimeIntegrationCredentials({
      employeeId,
      input: parsed.data,
    })
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to request credentials:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
