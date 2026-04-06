import { z } from "zod"
import type { ToolDefinition } from "../types"
import { prisma } from "@/lib/prisma"
import { uploadFile, S3Paths, getArtifactExtension } from "@/lib/s3"
import { chunkDocument, generateEmbeddings, storeChunks } from "@/lib/rag"

async function chunkAndEmbed(documentId: string, title: string, content: string) {
  const chunks = chunkDocument(content, title, "ARTIFACT", undefined, {
    chunkSize: 1000,
    chunkOverlap: 200,
  })
  if (chunks.length === 0) return

  const chunkTexts = chunks.map((chunk) => `${title}\n\n${chunk.content}`)
  const embeddings = await generateEmbeddings(chunkTexts)
  await storeChunks(documentId, chunks, embeddings)
  console.log(`[create_artifact] Indexed ${chunks.length} chunks for "${title}"`)
}

export const createArtifactTool: ToolDefinition = {
  name: "create_artifact",
  displayName: "Create Artifact",
  description:
    "Create a rich artifact that will be rendered in a side panel. Use this for substantial content like HTML pages, React components, SVG graphics, Mermaid diagrams, code files, or markdown documents. The artifact will be displayed with a live preview alongside the chat.",
  category: "builtin",
  parameters: z.object({
    title: z.string().describe("A short, descriptive title for the artifact"),
    type: z
      .enum([
        "text/html",
        "text/markdown",
        "image/svg+xml",
        "application/react",
        "application/mermaid",
        "application/code",
        "application/sheet",
        "text/latex",
        "application/slides",
        "application/python",
        "application/3d",
      ])
      .describe(
        "The content type: text/html for HTML pages, application/react for React components, image/svg+xml for SVG graphics, application/mermaid for Mermaid diagrams, application/code for code files, text/markdown for documents, application/sheet for CSV tabular data, text/latex for LaTeX math documents, application/slides for markdown presentations, application/python for executable Python scripts, application/3d for interactive 3D R3F scenes"
      ),
    content: z
      .string()
      .describe("The full content of the artifact"),
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

    // Persist to S3 + Document (knowledge system)
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
        Buffer.from(content, "utf-8"),
        mimeType
      )

      await prisma.document.create({
        data: {
          id,
          title,
          content,
          categories: ["ARTIFACT"],
          artifactType: type,
          sessionId: context.sessionId || null,
          organizationId: context.organizationId || null,
          createdBy: context.userId || null,
          s3Key,
          fileType: "artifact",
          fileSize: Buffer.byteLength(content, "utf-8"),
          mimeType,
          metadata: { artifactLanguage: language },
        },
      })
      // Background: chunk + embed so it's searchable in RAG
      chunkAndEmbed(id, title, content).catch((err) =>
        console.error("[create_artifact] Background indexing error:", err)
      )
    } catch (err) {
      // Log but don't fail the tool — artifact still works in-memory
      console.error("[create_artifact] Persistence error:", err)
    }

    return { id, title, type, content, language }
  },
}
