import { z } from "zod"
import type { ToolDefinition } from "../types"
import { prisma } from "@/lib/prisma"
import { uploadFile } from "@/lib/s3"
import { indexArtifactContent } from "@/lib/rag"

/** Maximum number of versions to keep in metadata */
const MAX_VERSION_HISTORY = 20

/** Maximum artifact content size: 512 KB */
const MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024

export const updateArtifactTool: ToolDefinition = {
  name: "update_artifact",
  displayName: "Update Artifact",
  description:
    "Update an existing artifact with new content. Use when the user asks to modify, fix, improve, or iterate on a previously created artifact. Provide the COMPLETE updated content — not a diff or partial snippet. Preserve the overall structure, imports, and patterns from the original unless the user explicitly asks to change them. Ensure the updated artifact remains complete, functional, and production-quality.",
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
      .describe("The complete updated content replacing the entire artifact. Include ALL content — unchanged parts must be repeated, not omitted. The artifact must remain fully functional after the update."),
  }),
  execute: async (params) => {
    const id = params.id as string
    const content = params.content as string
    const newTitle = params.title as string | undefined

    // Validate content size
    const contentBytes = Buffer.byteLength(content, "utf-8")
    if (contentBytes > MAX_ARTIFACT_CONTENT_BYTES) {
      return {
        id,
        title: newTitle,
        content,
        updated: false,
        persisted: false,
        error: `Artifact content exceeds maximum size (${Math.round(contentBytes / 1024)}KB > ${MAX_ARTIFACT_CONTENT_BYTES / 1024}KB)`,
      }
    }

    // Persist version update to Document + S3
    let persisted = true
    try {
      const existing = await prisma.document.findUnique({ where: { id } })
      if (existing) {
        // Archive old version to S3 and record lightweight metadata
        const meta = (existing.metadata as Record<string, unknown>) || {}
        const versions = (meta.versions as Array<unknown>) || []
        const versionNum = versions.length + 1

        // Upload old content to a versioned S3 key
        let versionS3Key: string | undefined
        if (existing.s3Key) {
          versionS3Key = `${existing.s3Key}.v${versionNum}`
          await uploadFile(
            versionS3Key,
            Buffer.from(existing.content, "utf-8"),
            existing.mimeType || "text/plain"
          ).catch((err) => {
            console.error("[update_artifact] Failed to archive version to S3:", err)
            versionS3Key = undefined
          })
        }

        versions.push({
          title: existing.title,
          timestamp: Date.now(),
          contentLength: Buffer.byteLength(existing.content, "utf-8"),
          ...(versionS3Key ? { s3Key: versionS3Key } : { content: existing.content }),
        })

        // Cap version history
        if (versions.length > MAX_VERSION_HISTORY) {
          versions.splice(0, versions.length - MAX_VERSION_HISTORY)
        }

        // Upload new content to S3
        if (existing.s3Key) {
          await uploadFile(
            existing.s3Key,
            Buffer.from(content, "utf-8"),
            existing.mimeType || "text/plain"
          )
        }

        // Update Document record
        const updatedTitle = newTitle || existing.title
        await prisma.document.update({
          where: { id },
          data: {
            content,
            title: updatedTitle,
            fileSize: contentBytes,
            metadata: { ...meta, versions },
          },
        })

        // Background: re-index updated content for RAG search
        indexArtifactContent(id, updatedTitle, content, { isUpdate: true }).catch((err) =>
          console.error("[update_artifact] Background re-indexing error:", err)
        )
      }
    } catch (err) {
      console.error("[update_artifact] Persistence error:", err)
      persisted = false
    }

    return {
      id,
      title: newTitle,
      content,
      updated: true,
      persisted,
    }
  },
}
