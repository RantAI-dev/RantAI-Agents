import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

interface RouteParams {
  params: Promise<{ id: string }>
}

// POST /api/assistants/[id]/default - Set as system default
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params

    const assistant = await prisma.assistant.findUnique({
      where: { id },
    })

    if (!assistant) {
      return NextResponse.json(
        { error: "Assistant not found" },
        { status: 404 }
      )
    }

    // Remove system default from all other assistants
    await prisma.assistant.updateMany({
      where: { isSystemDefault: true },
      data: { isSystemDefault: false },
    })

    // Set this assistant as system default
    const updated = await prisma.assistant.update({
      where: { id },
      data: { isSystemDefault: true },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Failed to set system default:", error)
    return NextResponse.json(
      { error: "Failed to set system default" },
      { status: 500 }
    )
  }
}

// DELETE /api/assistants/[id]/default - Remove system default (makes no assistant the default)
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params

    const assistant = await prisma.assistant.findUnique({
      where: { id },
    })

    if (!assistant) {
      return NextResponse.json(
        { error: "Assistant not found" },
        { status: 404 }
      )
    }

    if (!assistant.isSystemDefault) {
      return NextResponse.json(
        { error: "This assistant is not the system default" },
        { status: 400 }
      )
    }

    const updated = await prisma.assistant.update({
      where: { id },
      data: { isSystemDefault: false },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Failed to remove system default:", error)
    return NextResponse.json(
      { error: "Failed to remove system default" },
      { status: 500 }
    )
  }
}
