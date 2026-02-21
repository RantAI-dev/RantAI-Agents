import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/workflows/discover?name=fraud&mode=STANDARD&apiEnabled=true
// Generic workflow discovery endpoint — no domain-specific paths
// Auth: x-api-key header (validates against any WorkflowRun API key)
export async function GET(request: Request) {
  const apiKey = request.headers.get("x-api-key")
  if (!apiKey) {
    return NextResponse.json({ error: "API key required" }, { status: 401 })
  }

  // Validate API key against any workflow that has this key
  const validWorkflow = await prisma.workflow.findFirst({
    where: { apiKey, apiEnabled: true },
    select: { id: true },
  })

  if (!validWorkflow) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const name = searchParams.get("name")
  const mode = searchParams.get("mode")
  const apiEnabled = searchParams.get("apiEnabled")

  // Build query filters
  const where: Record<string, unknown> = { status: "ACTIVE" }
  if (name) {
    where.name = { contains: name, mode: "insensitive" }
  }
  if (mode) {
    where.mode = mode
  }
  if (apiEnabled === "true") {
    where.apiEnabled = true
  }

  const workflows = await prisma.workflow.findMany({
    where,
    select: {
      id: true,
      name: true,
      mode: true,
      description: true,
    },
    orderBy: { updatedAt: "desc" },
  })

  return NextResponse.json(workflows)
}
