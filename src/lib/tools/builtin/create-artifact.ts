import { z } from "zod"
import type { ToolDefinition } from "../types"
import { prisma } from "@/lib/prisma"
import { uploadFile, S3Paths, getArtifactExtension } from "@/lib/s3"
import { indexArtifactContent } from "@/lib/rag"
import {
  ARTIFACT_TYPES,
  type ArtifactType,
} from "@/features/conversations/components/chat/artifacts/registry"
import {
  validateArtifactContent,
  formatValidationError,
} from "./_validate-artifact"

/** Maximum artifact content size: 512 KB */
const MAX_ARTIFACT_CONTENT_BYTES = 512 * 1024

/** All `text/document` artifacts now use the docx-js script pipeline. */
const DOC_FORMAT = "script" as const

export const createArtifactTool: ToolDefinition = {
  name: "create_artifact",
  displayName: "Create Artifact",
  description:
    "Create a rich, polished artifact rendered in a live preview panel. Use for substantial content: HTML pages, React components, SVG graphics, diagrams, code files, documents, spreadsheets, slides, Python scripts, or 3D scenes. Output must be complete, self-contained, and production-quality — no placeholders, no TODOs, no incomplete sections. Always choose the most appropriate type for the content. To REVISE an artifact you created earlier in this same session, call `update_artifact` with that artifact's id — do NOT call `create_artifact` again to refine an artifact you just made. Each create_artifact call produces a separate artifact; calling it twice for what should be one artifact leaves the user with a stale draft alongside the real version.",
  category: "builtin",
  parameters: z.object({
    title: z.string().describe("A concise, descriptive title (3-8 words) that clearly identifies the artifact content"),
    type: z
      .enum(ARTIFACT_TYPES as unknown as [ArtifactType, ...ArtifactType[]])
      .describe(
        "The artifact format. Choose based on content: text/html (interactive pages, dashboards, games), application/react (UI components, data visualizations), image/svg+xml (graphics, icons), application/mermaid (flowcharts, diagrams), application/code (source code), text/markdown (documents, reports), application/sheet (CSV tables), text/latex (math equations), application/slides (presentations as JSON), application/python (executable scripts), application/3d (R3F 3D scenes), text/document (formal deliverables with frontmatter, Unsplash images, DOCX/PDF export)"
      ),
    content: z
      .string()
      .describe("The complete, self-contained content of the artifact. Must be fully functional — no placeholders, stubs, or TODO comments. For HTML: include full document structure. For React: include all component logic with export default. For code: include all necessary functions. For slides: provide complete JSON with theme and slides array."),
    language: z
      .string()
      .optional()
      .describe(
        "Programming language for application/code type (e.g. python, javascript, typescript)"
      ),
  }),
  execute: async (params, context) => {
    const id = crypto.randomUUID()
    const content = params.content as string
    const type = params.type as string
    const title = params.title as string
    const language = (params.language as string) || undefined

    // Validate content size
    const contentBytes = Buffer.byteLength(content, "utf-8")
    if (contentBytes > MAX_ARTIFACT_CONTENT_BYTES) {
      return {
        id,
        title,
        type,
        content,
        language,
        persisted: false,
        error: `Artifact content exceeds maximum size (${Math.round(contentBytes / 1024)}KB > ${MAX_ARTIFACT_CONTENT_BYTES / 1024}KB)`,
      }
    }

    // Canvas-mode type enforcement. When the user has selected a
    // specific artifact type, the LLM is required to use it. If it picks
    // something else we surface a validation error so the SDK retry loop
    // re-issues with the correct type instead of silently shipping the wrong
    // artifact.
    const canvasMode = context.canvasMode
    if (
      canvasMode &&
      canvasMode !== "auto" &&
      canvasMode !== type
    ) {
      return {
        id,
        title,
        type,
        content,
        language,
        persisted: false,
        error: `Canvas mode is locked to "${canvasMode}" but you called create_artifact with type "${type}". Re-issue the call with type="${canvasMode}". The user explicitly chose this type — do not switch.`,
        validationErrors: [
          `Wrong artifact type: expected "${canvasMode}", got "${type}".`,
        ],
      }
    }

    // `application/code` requires `language` — it lives on the
    // tool args (not content) so the validator can't see it. Enforce here.
    if (type === "application/code" && !language) {
      return {
        id,
        title,
        type,
        content,
        language,
        persisted: false,
        error:
          'application/code artifacts require a `language` parameter (e.g. "python", "typescript", "rust"). Re-issue the call with the language set — it controls syntax highlighting and the download file extension.',
        validationErrors: ["Missing required `language` parameter for application/code."],
      }
    }

    // Structural validation for HTML/React. Failures are surfaced back to the
    // LLM so it can self-correct on the next tool call. Other artifact types
    // pass through unchanged.
    const validation = await validateArtifactContent(type, content, {
      isNew: true,
    })
    let validationWarnings: string[] = validation.warnings
    if (!validation.ok) {
      return {
        id,
        title,
        type,
        content,
        language,
        persisted: false,
        error: formatValidationError(type, validation),
        validationErrors: validation.errors,
      }
    }

    // The validator now resolves unsplash:keyword URLs for HTML/slides/document
    // and returns the rewritten content via validation.content, so we just
    // pick that up here.
    const finalContent = validation.content ?? content

    // Persist to S3 + Document (knowledge system)
    let persisted = true
    try {
      const ext = getArtifactExtension(type)
      const s3Key = S3Paths.artifact(
        context.organizationId || null,
        context.sessionId || "orphan",
        id,
        ext
      )
      const mimeType =
        type === "image/svg+xml" ? "image/svg+xml" : "text/plain"

      await uploadFile(
        s3Key,
        Buffer.from(finalContent, "utf-8"),
        mimeType
      )

      await prisma.document.create({
        data: {
          id,
          title,
          content: finalContent,
          categories: ["ARTIFACT"],
          artifactType: type,
          sessionId: context.sessionId || null,
          organizationId: context.organizationId || null,
          createdBy: context.userId || null,
          s3Key,
          fileType: "artifact",
          fileSize: contentBytes,
          mimeType,
          ...(type === "text/document" ? { documentFormat: DOC_FORMAT } : {}),
          metadata: {
            artifactLanguage: language,
            ...(validationWarnings.length > 0
              ? { validationWarnings }
              : {}),
          },
        },
      })
      // Background: chunk + embed so it's searchable in RAG
      indexArtifactContent(id, title, finalContent).catch((err) =>
        console.error("[create_artifact] Background indexing error:", err)
      )
    } catch (err) {
      // Log but don't fail the tool — artifact still works in-memory
      console.error("[create_artifact] Persistence error:", err)
      persisted = false
    }

    return {
      id,
      title,
      type,
      content: finalContent,
      language,
      persisted,
      ...(validationWarnings.length > 0 ? { warnings: validationWarnings } : {}),
    }
  },
}
