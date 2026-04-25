import { z } from "zod"
import { Prisma } from "@prisma/client"
import type { ToolDefinition } from "../types"
import { prisma } from "@/lib/prisma"
import { uploadFile } from "@/lib/s3"
import { indexArtifactContent } from "@/lib/rag"
import { resolveImages, resolveSlideImages } from "@/lib/unsplash"
import {
  validateArtifactContent,
  formatValidationError,
} from "./_validate-artifact"

/** Maximum number of versions to keep in metadata */
const MAX_VERSION_HISTORY = 20

/** Maximum artifact content size: 512 KB */
const MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024

/**
 * Hard cap on inline-fallback content size when S3 archival fails.
 * Without this, repeated edits on a 512 KB artifact with flaky S3 storage
 * accumulate the previous content into `metadata.versions[*].content` on
 * every update, ballooning the Postgres row indefinitely. 32 KB keeps small
 * artifacts (markdown, code) recoverable while preventing the worst case.
 */
const MAX_INLINE_FALLBACK_BYTES = 32 * 1024

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
  execute: async (params, context) => {
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
    let validationWarnings: string[] = []
    let finalContent = content
    try {
      const existing = await prisma.document.findUnique({ where: { id } })
      // Fix #23: explicit not-found path. Without this the function silently
      // falls through to the success return below and tells the LLM
      // `updated: true, persisted: true` for an artifact that doesn't exist —
      // the model never knows to call create_artifact instead.
      if (!existing) {
        return {
          id,
          title: newTitle,
          content,
          updated: false,
          persisted: false,
          error: `Artifact "${id}" not found. Call create_artifact instead to create a new artifact.`,
        }
      }

      // Fix #6: canvas-mode type enforcement. When the user has selected a
      // specific artifact type, the LLM is required to keep using it.
      // create_artifact has the same check; without it here, an LLM in
      // canvas-mode could replace e.g. an HTML artifact with React content
      // and slip past the type-specific renderer.
      const canvasMode = context.canvasMode
      if (
        canvasMode &&
        canvasMode !== "auto" &&
        existing.artifactType &&
        canvasMode !== existing.artifactType
      ) {
        return {
          id,
          title: newTitle,
          content,
          updated: false,
          persisted: false,
          error: `Canvas mode is locked to "${canvasMode}" but the artifact type is "${existing.artifactType}". The user explicitly chose this type — do not switch. Keep updating with content valid for "${existing.artifactType}".`,
          validationErrors: [
            `Canvas-mode mismatch: expected "${canvasMode}", artifact is "${existing.artifactType}".`,
          ],
        }
      }

      // Structural validation against the artifact's known type. Failures
      // are surfaced back to the LLM so it can self-correct.
      if (existing.artifactType) {
        const validation = await validateArtifactContent(
          existing.artifactType,
          content
        )
        validationWarnings = validation.warnings
        if (!validation.ok) {
          return {
            id,
            title: newTitle,
            content,
            updated: false,
            persisted: false,
            error: formatValidationError(existing.artifactType, validation),
            validationErrors: validation.errors,
          }
        }
        // Fix #2: pick up the validator's rewritten content. For
        // `text/document` this is the AST with `unsplash:` URLs already
        // resolved. Without this assignment the rewrite is silently
        // discarded and raw `unsplash:keyword` strings get persisted.
        if (validation.content) {
          finalContent = validation.content
        }
      }

      // Resolve unsplash: URLs to real images for HTML and slides artifacts
      if (existing.artifactType === "text/html") {
        finalContent = await resolveImages(finalContent)
      } else if (existing.artifactType === "application/slides") {
        finalContent = await resolveSlideImages(finalContent)
      }

      // Archive old version to S3 and record lightweight metadata
      {
        const meta = (existing.metadata as Record<string, unknown>) || {}
        const versions = (meta.versions as Array<unknown>) || []
        const evictedVersionCount =
          typeof meta.evictedVersionCount === "number"
            ? meta.evictedVersionCount
            : 0
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

        // When S3 archival fails, fall back to inlining the previous
        // content into metadata — but only if it's small. For large artifacts
        // we drop to a summary-only record to prevent unbounded row growth.
        const previousBytes = Buffer.byteLength(existing.content, "utf-8")
        const inlineFallback =
          !versionS3Key && previousBytes <= MAX_INLINE_FALLBACK_BYTES
            ? { content: existing.content }
            : !versionS3Key
              ? { archiveFailed: true as const }
              : null

        versions.push({
          title: existing.title,
          timestamp: Date.now(),
          contentLength: previousBytes,
          ...(versionS3Key ? { s3Key: versionS3Key } : {}),
          ...(inlineFallback ?? {}),
        })

        // Track FIFO evictions in metadata so the UI can show
        // "+N earlier versions evicted" instead of silently dropping history.
        let newlyEvicted = 0
        if (versions.length > MAX_VERSION_HISTORY) {
          newlyEvicted = versions.length - MAX_VERSION_HISTORY
          versions.splice(0, newlyEvicted)
        }
        const totalEvicted = evictedVersionCount + newlyEvicted

        // Upload new content to S3
        if (existing.s3Key) {
          await uploadFile(
            existing.s3Key,
            Buffer.from(finalContent, "utf-8"),
            existing.mimeType || "text/plain"
          )
        }

        // Update Document record with optimistic lock — `WHERE updatedAt = X`
        // ensures concurrent writers don't clobber each other's metadata.versions
        // array. updateMany returns { count: 0 } if another writer changed the
        // row between our read and our write.
        const updatedTitle = newTitle || existing.title
        const lockResult = await prisma.document.updateMany({
          where: { id, updatedAt: existing.updatedAt },
          data: {
            content: finalContent,
            title: updatedTitle,
            fileSize: contentBytes,
            metadata: {
              ...meta,
              versions,
              ...(totalEvicted > 0 ? { evictedVersionCount: totalEvicted } : {}),
              ...(validationWarnings.length > 0
                ? { validationWarnings }
                : {}),
            } as Prisma.InputJsonValue,
          },
        })

        if (lockResult.count === 0) {
          // Another writer beat us. Surface the conflict to the LLM so it can
          // re-fetch and retry rather than silently dropping the update.
          return {
            id,
            title: newTitle,
            content,
            updated: false,
            persisted: false,
            error:
              "Concurrent update detected: another writer modified this artifact between read and write. Re-fetch the artifact and retry the update.",
          }
        }

        // Background: re-index updated content for RAG search
        indexArtifactContent(id, updatedTitle, finalContent, { isUpdate: true }).catch((err) =>
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
      content: finalContent,
      updated: true,
      persisted,
      ...(validationWarnings.length > 0 ? { warnings: validationWarnings } : {}),
    }
  },
}
