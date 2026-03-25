import { NextResponse } from "next/server"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { RuntimeStoreIntegrationCredentialsSchema } from "@/src/features/runtime/integrations/schema"
import { storeRuntimeIntegrationCredentials } from "@/src/features/runtime/integrations/service"
import { isHttpServiceError } from "@/src/features/shared/http-service-error"

export async function POST(req: Request) {
  try {
    const bearerToken = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!bearerToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await verifyRuntimeToken(bearerToken)

    const parsed = RuntimeStoreIntegrationCredentialsSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Failed" }, { status: 500 })
    }

    const result = await storeRuntimeIntegrationCredentials(parsed.data)
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Store credentials failed:", error)
    return NextResponse.json({ error: "Failed to store credentials" }, { status: 500 })
  }
}
