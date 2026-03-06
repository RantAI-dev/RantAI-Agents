import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET - List all workspace files
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: {
        id,
        ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
      },
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const files = await prisma.employeeFile.findMany({
      where: { digitalEmployeeId: id },
      orderBy: { filename: "asc" },
    })

    return NextResponse.json(files)
  } catch (error) {
    console.error("Failed to fetch files:", error)
    return NextResponse.json({ error: "Failed to fetch files" }, { status: 500 })
  }
}

// PUT - Bulk sync files (for VM to push changes back)
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: {
        id,
        ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
      },
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const { files } = await req.json() as { files: Array<{ filename: string; content: string }> }

    if (!Array.isArray(files)) {
      return NextResponse.json({ error: "files array required" }, { status: 400 })
    }

    const results = await Promise.all(
      files.map((f) =>
        prisma.employeeFile.upsert({
          where: {
            digitalEmployeeId_filename: {
              digitalEmployeeId: id,
              filename: f.filename,
            },
          },
          create: {
            digitalEmployeeId: id,
            filename: f.filename,
            content: f.content,
            updatedBy: session.user.id,
          },
          update: {
            content: f.content,
            updatedBy: session.user.id,
          },
        })
      )
    )

    return NextResponse.json(results)
  } catch (error) {
    console.error("Failed to sync files:", error)
    return NextResponse.json({ error: "Failed to sync files" }, { status: 500 })
  }
}
