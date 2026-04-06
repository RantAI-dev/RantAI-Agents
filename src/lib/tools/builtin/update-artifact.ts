import { z } from "zod"
import type { ToolDefinition } from "../types"
import { prisma } from "@/lib/prisma"
import { uploadFile } from "@/lib/s3"

export const updateArtifactTool: ToolDefinition = {
  name: "update_artifact",
  displayName: "Update Artifact",
  description:
    "Update an existing artifact with new content. Use this when the user asks to modify, fix, or change an artifact that was previously created with create_artifact. You must provide the full updated content, not just the changes.",
  category: "builtin",
  parameters: z.object({
    id: z
      .string()
      .describe("The ID of the artifact to update (from the create_artifact result)"),
    title: z
      .string()
      .optional()
      .describe("Optional new title. If omitted, keeps the existing title"),
    content: z
      .string()
      .describe("The full updated content of the artifact"),
  }),
  execute: async (params) => {
    const id = params.id as string
    const content = params.content as string
    const newTitle = params.title as string | undefined

    // Persist version update to Document + S3
    try {
      const existing = await prisma.document.findUnique({ where: { id } })
      if (existing) {
        // Push old version to history in metadata
        const meta = (existing.metadata as Record<string, unknown>) || {}
        const versions = (meta.versions as Array<unknown>) || []
        versions.push({
          content: existing.content,
          title: existing.title,
          timestamp: Date.now(),
        })

        // Upload new content to S3
        if (existing.s3Key) {
          await uploadFile(
            existing.s3Key,
            Buffer.from(content, "utf-8"),
            existing.mimeType || "text/plain"
          )
        }

        // Update Document record
        await prisma.document.update({
          where: { id },
          data: {
            content,
            title: newTitle || existing.title,
            fileSize: Buffer.byteLength(content, "utf-8"),
            metadata: { ...meta, versions },
          },
        })
      }
    } catch (err) {
      console.error("[update_artifact] Persistence error:", err)
    }

    return {
      id,
      title: newTitle,
      content,
      updated: true,
    }
  },
}
