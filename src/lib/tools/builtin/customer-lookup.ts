import { z } from "zod"
import { prisma } from "@/lib/prisma"
import type { ToolDefinition } from "../types"

export const customerLookupTool: ToolDefinition = {
  name: "customer_lookup",
  displayName: "Customer Lookup",
  description:
    "Look up customer interaction history by name or email. Returns conversation sessions, channels, and recent activity from the platform.",
  category: "builtin",
  parameters: z.object({
    query: z
      .string()
      .describe("Customer name or email to search for"),
  }),
  execute: async (params) => {
    const q = (params.query as string).toLowerCase()
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { customerName: { contains: q, mode: "insensitive" } },
          { customerEmail: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        sessionId: true,
        status: true,
        channel: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    })
    if (conversations.length === 0) {
      return { found: false, message: "No customer records found" }
    }
    return {
      found: true,
      resultCount: conversations.length,
      customers: conversations,
    }
  },
}
