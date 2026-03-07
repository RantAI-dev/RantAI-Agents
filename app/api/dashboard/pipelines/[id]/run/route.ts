import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import type { PipelineStep } from "@/lib/digital-employee/pipelines"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    const pipeline = await prisma.employeeTemplateShare.findFirst({
      where: { id, organizationId: orgContext.organizationId, category: "pipeline" },
    })

    if (!pipeline) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 })
    }

    const data = pipeline.templateData as Record<string, unknown>
    const steps = (data?.steps as PipelineStep[]) || []

    if (steps.length === 0) {
      return NextResponse.json({ error: "Pipeline has no steps" }, { status: 400 })
    }

    const firstStep = steps[0]

    // Create handoff message to the first step's employee
    const message = await prisma.employeeMessage.create({
      data: {
        organizationId: orgContext.organizationId,
        fromEmployeeId: firstStep.employeeId, // self-directed first step
        toEmployeeId: firstStep.employeeId,
        type: "handoff",
        subject: `Pipeline: ${pipeline.name} — Step 1`,
        content: firstStep.instruction,
        priority: "high",
        attachments: [],
        metadata: {
          pipelineId: id,
          pipelineName: pipeline.name,
          stepIndex: 0,
          totalSteps: steps.length,
        } as object,
      },
    })

    return NextResponse.json({
      success: true,
      messageId: message.id,
      pipelineId: id,
      currentStep: 0,
      totalSteps: steps.length,
    })
  } catch (error) {
    console.error("Failed to run pipeline:", error)
    return NextResponse.json({ error: "Failed to run pipeline" }, { status: 500 })
  }
}
