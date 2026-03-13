import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { orchestrator } from "@/lib/digital-employee"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { id } = await params
  const orgContext = await getOrganizationContext(req, session.user.id)

  const employee = await prisma.digitalEmployee.findFirst({
    where: {
      id,
      ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
    },
    select: { groupId: true },
  })

  if (!employee) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

  const groupId = employee.groupId

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        await orchestrator.startGroupContainer(groupId, (event) => {
          send(event)
        })
      } catch (error) {
        console.error("Start container failed:", error)
        send({
          step: 0,
          total: 0,
          message: error instanceof Error ? error.message : "Start failed",
          status: "error",
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
