import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext, canManage } from "@/lib/organization"
import { DEFAULT_WIDGET_CONFIG } from "@/lib/embed/types"

// GET /api/dashboard/embed-keys/:id - Get single key details
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    // Only owner and admin can view API keys
    if (orgContext && !canManage(orgContext.membership.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      )
    }

    const embedKey = await prisma.embedApiKey.findUnique({
      where: { id },
    })

    if (!embedKey) {
      return NextResponse.json(
        { error: "Embed key not found" },
        { status: 404 }
      )
    }

    // Verify organization access
    if (embedKey.organizationId) {
      if (!orgContext || embedKey.organizationId !== orgContext.organizationId) {
        return NextResponse.json({ error: "Embed key not found" }, { status: 404 })
      }
    } else if (orgContext) {
      return NextResponse.json({ error: "Embed key not found" }, { status: 404 })
    }

    const assistant = await prisma.assistant.findUnique({
      where: { id: embedKey.assistantId },
      select: { id: true, name: true, emoji: true },
    })

    return NextResponse.json({
      id: embedKey.id,
      name: embedKey.name,
      key: embedKey.key,
      assistantId: embedKey.assistantId,
      allowedDomains: embedKey.allowedDomains,
      config: { ...DEFAULT_WIDGET_CONFIG, ...(embedKey.config as object) },
      requestCount: embedKey.requestCount,
      lastUsedAt: embedKey.lastUsedAt?.toISOString() || null,
      enabled: embedKey.enabled,
      createdAt: embedKey.createdAt.toISOString(),
      updatedAt: embedKey.updatedAt.toISOString(),
      assistant,
    })
  } catch (error) {
    console.error("[Embed Keys API] GET/:id error:", error)
    return NextResponse.json(
      { error: "Failed to fetch embed key" },
      { status: 500 }
    )
  }
}

// PUT /api/dashboard/embed-keys/:id - Update key config
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    // Verify key exists
    const existingKey = await prisma.embedApiKey.findUnique({
      where: { id },
    })

    if (!existingKey) {
      return NextResponse.json(
        { error: "Embed key not found" },
        { status: 404 }
      )
    }

    // Verify organization access
    if (existingKey.organizationId) {
      if (!orgContext || existingKey.organizationId !== orgContext.organizationId) {
        return NextResponse.json({ error: "Embed key not found" }, { status: 404 })
      }

      // Only owner and admin can manage API keys
      if (!canManage(orgContext.membership.role)) {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
      }
    }

    const body = await req.json()
    const { name, allowedDomains, config, enabled } = body

    // Merge config with existing
    const existingConfig = existingKey.config as object
    const mergedConfig = config
      ? { ...DEFAULT_WIDGET_CONFIG, ...existingConfig, ...config }
      : existingConfig

    const updatedKey = await prisma.embedApiKey.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(allowedDomains !== undefined && { allowedDomains }),
        ...(config !== undefined && { config: mergedConfig }),
        ...(enabled !== undefined && { enabled }),
      },
    })

    const assistant = await prisma.assistant.findUnique({
      where: { id: updatedKey.assistantId },
      select: { id: true, name: true, emoji: true },
    })

    return NextResponse.json({
      id: updatedKey.id,
      name: updatedKey.name,
      key: updatedKey.key,
      assistantId: updatedKey.assistantId,
      allowedDomains: updatedKey.allowedDomains,
      config: { ...DEFAULT_WIDGET_CONFIG, ...(updatedKey.config as object) },
      requestCount: updatedKey.requestCount,
      lastUsedAt: updatedKey.lastUsedAt?.toISOString() || null,
      enabled: updatedKey.enabled,
      createdAt: updatedKey.createdAt.toISOString(),
      updatedAt: updatedKey.updatedAt.toISOString(),
      assistant,
    })
  } catch (error) {
    console.error("[Embed Keys API] PUT/:id error:", error)
    return NextResponse.json(
      { error: "Failed to update embed key" },
      { status: 500 }
    )
  }
}

// DELETE /api/dashboard/embed-keys/:id - Delete key
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    // Verify key exists
    const existingKey = await prisma.embedApiKey.findUnique({
      where: { id },
    })

    if (!existingKey) {
      return NextResponse.json(
        { error: "Embed key not found" },
        { status: 404 }
      )
    }

    // Verify organization access
    if (existingKey.organizationId) {
      if (!orgContext || existingKey.organizationId !== orgContext.organizationId) {
        return NextResponse.json({ error: "Embed key not found" }, { status: 404 })
      }

      // Only owner and admin can delete API keys
      if (!canManage(orgContext.membership.role)) {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
      }
    }

    await prisma.embedApiKey.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Embed Keys API] DELETE/:id error:", error)
    return NextResponse.json(
      { error: "Failed to delete embed key" },
      { status: 500 }
    )
  }
}
