import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { hasPermission } from "@/lib/digital-employee/rbac"
import Dockerode from "dockerode"

const docker = new Dockerode({ socketPath: "/var/run/docker.sock" })

/** Batch-reconcile group container states against Docker */
async function reconcileGroups<T extends { id: string; status: string; containerId: string | null }>(groups: T[]): Promise<T[]> {
  // Get all running container IDs in one Docker API call
  const runningContainers = await docker.listContainers({ all: false })
  const runningIds = new Set(runningContainers.map((c) => c.Id))

  const reconciled = await Promise.all(
    groups.map(async (g) => {
      // Groups with a containerId — check if container is actually running
      if (g.containerId) {
        if (runningIds.has(g.containerId)) {
          // Container is alive — ensure status is RUNNING
          if (g.status !== "RUNNING") {
            await prisma.employeeGroup.update({
              where: { id: g.id },
              data: { status: "RUNNING" },
            })
            return { ...g, status: "RUNNING" }
          }
          return g
        }
        // Container is dead — clear fields, set IDLE
        await prisma.employeeGroup.update({
          where: { id: g.id },
          data: { status: "IDLE", containerId: null, containerPort: null, noVncPort: null, gatewayToken: null },
        })
        return { ...g, status: "IDLE", containerId: null, containerPort: null, noVncPort: null, gatewayToken: null }
      }

      // No containerId but status isn't IDLE (e.g. legacy "ACTIVE") — set IDLE
      if (g.status !== "IDLE") {
        await prisma.employeeGroup.update({
          where: { id: g.id },
          data: { status: "IDLE" },
        })
        return { ...g, status: "IDLE" }
      }

      return g
    })
  )

  return reconciled
}

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    const groups = await prisma.employeeGroup.findMany({
      where: {
        organizationId: orgContext.organizationId,
      },
      include: {
        members: {
          select: {
            id: true,
            name: true,
            avatar: true,
            status: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    })

    // Batch-reconcile container states against Docker
    const reconciled = await reconcileGroups(groups)

    const result = reconciled.map((g) => ({
      ...g,
      memberCount: g.members.length,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error("Failed to fetch groups:", error)
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    if (!hasPermission(orgContext.membership.role, "employee.create")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await req.json()
    const { name, description } = body

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const group = await prisma.employeeGroup.create({
      data: {
        organizationId: orgContext.organizationId,
        name,
        description: description || null,
        createdBy: session.user.id,
      },
      include: {
        members: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    })

    return NextResponse.json({
      ...group,
      memberCount: group.members.length,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    }, { status: 201 })
  } catch (error) {
    console.error("Failed to create group:", error)
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 })
  }
}
