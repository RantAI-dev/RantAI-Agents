import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET /api/dashboard/openapi-specs/[id]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const spec = await prisma.openApiSpec.findUnique({ where: { id } })
    if (!spec) {
      return NextResponse.json({ error: "Spec not found" }, { status: 404 })
    }

    // Get associated tools
    const tools = await prisma.tool.findMany({
      where: { openApiSpecId: id },
      select: {
        id: true,
        name: true,
        displayName: true,
        description: true,
        enabled: true,
      },
    })

    return NextResponse.json({ ...spec, tools })
  } catch (error) {
    console.error("[OpenAPI API] GET [id] error:", error)
    return NextResponse.json({ error: "Failed to fetch spec" }, { status: 500 })
  }
}

// DELETE /api/dashboard/openapi-specs/[id] - Delete spec and cascade tools
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    // Delete associated tools first (cascade)
    await prisma.tool.deleteMany({ where: { openApiSpecId: id } })

    // Delete the spec
    await prisma.openApiSpec.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[OpenAPI API] DELETE error:", error)
    return NextResponse.json({ error: "Failed to delete spec" }, { status: 500 })
  }
}

// POST /api/dashboard/openapi-specs/[id] - Resync tools from spec
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const spec = await prisma.openApiSpec.findUnique({ where: { id } })
    if (!spec) {
      return NextResponse.json({ error: "Spec not found" }, { status: 404 })
    }

    // Re-parse and regenerate
    const { parseOpenApiSpec } = await import("@/lib/openapi/parser")
    const { generateToolsFromEndpoints } = await import("@/lib/openapi/tool-generator")

    const rawSpec = typeof spec.specContent === "string"
      ? spec.specContent
      : JSON.stringify(spec.specContent)

    const parsed = parseOpenApiSpec(rawSpec)

    // Delete old tools
    await prisma.tool.deleteMany({ where: { openApiSpecId: id } })

    // Regenerate
    const toolInputs = generateToolsFromEndpoints(parsed.endpoints, {
      serverUrl: spec.serverUrl,
      specId: id,
      organizationId: spec.organizationId,
      createdBy: session.user.id,
      authConfig: spec.authConfig as { type: string; token?: string; headerName?: string } | null,
    })

    if (toolInputs.length > 0) {
      await prisma.tool.createMany({ data: toolInputs, skipDuplicates: true })
    }

    await prisma.openApiSpec.update({
      where: { id },
      data: { toolCount: toolInputs.length },
    })

    return NextResponse.json({ toolsCreated: toolInputs.length })
  } catch (error) {
    console.error("[OpenAPI API] POST resync error:", error)
    return NextResponse.json({ error: "Failed to resync" }, { status: 500 })
  }
}
