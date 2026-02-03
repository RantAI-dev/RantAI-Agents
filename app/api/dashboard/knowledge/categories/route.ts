import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Default categories to seed if none exist
const DEFAULT_CATEGORIES = [
  { name: "LIFE_INSURANCE", label: "Life Insurance", color: "#3b82f6", isSystem: true },
  { name: "HEALTH_INSURANCE", label: "Health Insurance", color: "#22c55e", isSystem: true },
  { name: "HOME_INSURANCE", label: "Home Insurance", color: "#f97316", isSystem: true },
  { name: "FAQ", label: "FAQ", color: "#8b5cf6", isSystem: true },
  { name: "POLICY", label: "Policy", color: "#ef4444", isSystem: true },
  { name: "GENERAL", label: "General", color: "#6b7280", isSystem: true },
]

// GET - List all categories (seeds defaults if empty)
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Check if categories exist, seed if empty
    const count = await prisma.category.count()
    if (count === 0) {
      await prisma.category.createMany({
        data: DEFAULT_CATEGORIES,
      })
    }

    const categories = await prisma.category.findMany({
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    })

    return NextResponse.json({
      categories: categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        label: cat.label,
        color: cat.color,
        isSystem: cat.isSystem,
        createdAt: cat.createdAt.toISOString(),
        updatedAt: cat.updatedAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error("Failed to list categories:", error)
    return NextResponse.json(
      { error: "Failed to list categories" },
      { status: 500 }
    )
  }
}

// POST - Create a new category
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { label, color } = await request.json()

    if (!label) {
      return NextResponse.json(
        { error: "Label is required" },
        { status: 400 }
      )
    }

    if (!color) {
      return NextResponse.json(
        { error: "Color is required" },
        { status: 400 }
      )
    }

    // Generate name from label: "My Custom Category" -> "MY_CUSTOM_CATEGORY"
    const name = label
      .toUpperCase()
      .replace(/\s+/g, "_")
      .replace(/[^A-Z0-9_]/g, "")

    // Check if name already exists
    const existing = await prisma.category.findUnique({
      where: { name },
    })
    if (existing) {
      return NextResponse.json(
        { error: "A category with this name already exists" },
        { status: 400 }
      )
    }

    const category = await prisma.category.create({
      data: {
        name,
        label,
        color,
        isSystem: false,
      },
    })

    return NextResponse.json({
      id: category.id,
      name: category.name,
      label: category.label,
      color: category.color,
      isSystem: category.isSystem,
    })
  } catch (error) {
    console.error("Failed to create category:", error)
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 }
    )
  }
}
