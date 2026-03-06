import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"

interface RouteParams {
  params: Promise<{ id: string; filename: string }>
}

// GET - Single file content
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, filename } = await params
    const decodedFilename = decodeURIComponent(filename)
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

    const file = await prisma.employeeFile.findUnique({
      where: {
        digitalEmployeeId_filename: {
          digitalEmployeeId: id,
          filename: decodedFilename,
        },
      },
    })

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    return NextResponse.json(file)
  } catch (error) {
    console.error("Failed to fetch file:", error)
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 500 })
  }
}

// PUT - Update file content
export async function PUT(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, filename } = await params
    const decodedFilename = decodeURIComponent(filename)
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

    const { content } = await req.json()

    const file = await prisma.employeeFile.upsert({
      where: {
        digitalEmployeeId_filename: {
          digitalEmployeeId: id,
          filename: decodedFilename,
        },
      },
      create: {
        digitalEmployeeId: id,
        filename: decodedFilename,
        content,
        updatedBy: session.user.id,
      },
      update: {
        content,
        updatedBy: session.user.id,
      },
    })

    return NextResponse.json(file)
  } catch (error) {
    console.error("Failed to update file:", error)
    return NextResponse.json({ error: "Failed to update file" }, { status: 500 })
  }
}
