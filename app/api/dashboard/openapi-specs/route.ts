import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { parseOpenApiSpec } from "@/lib/openapi/parser"
import { generateToolsFromEndpoints } from "@/lib/openapi/tool-generator"

// GET /api/dashboard/openapi-specs - List all org specs
export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)

    const specs = await prisma.openApiSpec.findMany({
      where: {
        organizationId: orgContext?.organizationId || null,
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(
      specs.map((s) => ({
        id: s.id,
        name: s.name,
        specUrl: s.specUrl,
        version: s.version,
        serverUrl: s.serverUrl,
        toolCount: s.toolCount,
        createdAt: s.createdAt.toISOString(),
      }))
    )
  } catch (error) {
    console.error("[OpenAPI API] GET error:", error)
    return NextResponse.json({ error: "Failed to fetch specs" }, { status: 500 })
  }
}

// POST /api/dashboard/openapi-specs - Upload spec, parse, create tools
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContext(req, session.user.id)
    const body = await req.json()

    const { specContent, specUrl, name, authConfig, selectedOperationIds } = body

    if (!specContent && !specUrl) {
      return NextResponse.json(
        { error: "specContent or specUrl is required" },
        { status: 400 }
      )
    }

    let rawSpec = specContent as string

    // Fetch from URL if provided
    if (!rawSpec && specUrl) {
      const res = await fetch(specUrl, {
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) {
        return NextResponse.json(
          { error: `Failed to fetch spec from URL: ${res.status}` },
          { status: 400 }
        )
      }
      rawSpec = await res.text()
    }

    // Parse the spec
    let parsed
    try {
      parsed = parseOpenApiSpec(rawSpec)
    } catch (error) {
      return NextResponse.json(
        { error: `Invalid OpenAPI spec: ${error instanceof Error ? error.message : "Parse error"}` },
        { status: 400 }
      )
    }

    // If this is a preview request (no name), return parsed info
    if (!name) {
      return NextResponse.json({
        preview: true,
        title: parsed.title,
        version: parsed.version,
        serverUrl: parsed.serverUrl,
        endpoints: parsed.endpoints.map((e) => ({
          operationId: e.operationId,
          method: e.method,
          path: e.path,
          summary: e.summary,
        })),
      })
    }

    const organizationId = orgContext?.organizationId || null

    // Create OpenApiSpec record
    const spec = await prisma.openApiSpec.create({
      data: {
        name: name || parsed.title,
        specUrl: specUrl || null,
        specContent: JSON.parse(typeof rawSpec === "string" ? (rawSpec.trim().startsWith("{") ? rawSpec : JSON.stringify(rawSpec)) : JSON.stringify(rawSpec)),
        version: parsed.version,
        serverUrl: parsed.serverUrl,
        authConfig: authConfig || null,
        toolCount: 0,
        organizationId,
        createdBy: session.user.id,
      },
    })

    // Generate and create tools
    const toolInputs = generateToolsFromEndpoints(parsed.endpoints, {
      serverUrl: parsed.serverUrl,
      specId: spec.id,
      organizationId,
      createdBy: session.user.id,
      authConfig,
      selectedOperationIds,
    })

    if (toolInputs.length > 0) {
      await prisma.tool.createMany({
        data: toolInputs,
        skipDuplicates: true,
      })

      // Update tool count
      await prisma.openApiSpec.update({
        where: { id: spec.id },
        data: { toolCount: toolInputs.length },
      })
    }

    return NextResponse.json(
      {
        spec: { id: spec.id, name: spec.name },
        toolsCreated: toolInputs.length,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("[OpenAPI API] POST error:", error)
    return NextResponse.json({ error: "Failed to import spec" }, { status: 500 })
  }
}
