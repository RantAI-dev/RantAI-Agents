import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { importWorkflow } from "@/lib/workflow/import-export"
import { Prisma } from "@prisma/client"

// POST /api/dashboard/workflows/import
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()

    // Import and validate
    const imported = importWorkflow(body)

    // Get org context
    const orgContext = await getOrganizationContext(req, session.user.id)

    // Create workflow from imported data
    const workflow = await prisma.workflow.create({
      data: {
        name: `${imported.name} (imported)`,
        description: imported.description,
        nodes: imported.nodes as unknown as Prisma.InputJsonValue,
        edges: imported.edges as unknown as Prisma.InputJsonValue,
        trigger: imported.trigger as unknown as Prisma.InputJsonValue,
        variables: imported.variables as unknown as Prisma.InputJsonValue,
        status: "DRAFT",
        createdBy: session.user.id,
        ...(orgContext?.organizationId && {
          organizationId: orgContext.organizationId,
        }),
      },
      include: { _count: { select: { runs: true } } },
    })

    return NextResponse.json(workflow)
  } catch (error) {
    console.error("Failed to import workflow:", error)
    const message = error instanceof Error ? error.message : "Failed to import workflow"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
