import { NextResponse } from "next/server"
import { verifyRuntimeToken } from "@/lib/digital-employee/runtime-auth"
import { RuntimeOnboardingReportSchema } from "@/features/runtime/onboarding-report/schema"
import { reportRuntimeOnboardingStatus } from "@/features/runtime/onboarding-report/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"

export async function POST(req: Request) {
  try {
    const bearerToken = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!bearerToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await verifyRuntimeToken(bearerToken)

    const parsed = RuntimeOnboardingReportSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Failed" }, { status: 500 })
    }

    const result = await reportRuntimeOnboardingStatus(parsed.data)
    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Onboarding report failed:", error)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
