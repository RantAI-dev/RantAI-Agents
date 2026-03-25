import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  AssistantIdParamsSchema,
  AssistantMcpServerIdsSchema,
} from "@/src/features/assistants/bindings/schema"
import {
  isServiceError,
  listAssistantMcpServers,
  setAssistantMcpServers,
} from "@/src/features/assistants/bindings/service"

// GET /api/assistants/[id]/mcp-servers - Get assistant's bound MCP servers
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = AssistantIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid assistant id" }, { status: 400 })
    }

    const result = await listAssistantMcpServers(parsedParams.data.id)
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Assistant MCP Servers API] GET error:", error)
    return NextResponse.json(
      { error: "Failed to fetch assistant MCP servers" },
      { status: 500 }
    )
  }
}

// PUT /api/assistants/[id]/mcp-servers - Set assistant's bound MCP servers
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = AssistantIdParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid assistant id" }, { status: 400 })
    }

    const parsedBody = AssistantMcpServerIdsSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "mcpServerIds must be an array" },
        { status: 400 }
      )
    }

    const result = await setAssistantMcpServers(
      parsedParams.data.id,
      parsedBody.data.mcpServerIds
    )
    if (isServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[Assistant MCP Servers API] PUT error:", error)
    return NextResponse.json(
      { error: "Failed to update assistant MCP servers" },
      { status: 500 }
    )
  }
}
