import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  parseGithubUrl,
  fetchRepoFiles,
  concatenateFiles,
} from "@/lib/github/fetch-repo"
import { smartChunkDocument } from "@/lib/rag/smart-chunker"
import { generateEmbeddings } from "@/lib/rag/embeddings"
import { prepareChunkForEmbedding } from "@/lib/rag/chunker"
import { prisma } from "@/lib/prisma"
import { getSurrealClient } from "@/lib/surrealdb"

/** Threshold: repos under this size go inline, above goes to RAG */
const INLINE_THRESHOLD = 100 * 1024 // 100KB

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { url, sessionId } = body as { url?: string; sessionId?: string }

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Missing url" }, { status: 400 })
  }

  const parsed = parseGithubUrl(url)
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid GitHub URL. Use a format like github.com/owner/repo or github.com/owner/repo/tree/main/src" },
      { status: 400 }
    )
  }

  // Single file → fetch and return inline
  if (parsed.type === "file") {
    try {
      const rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.branch}/${parsed.path}`
      const res = await fetch(rawUrl)
      if (!res.ok) throw new Error(res.status === 404 ? "File not found" : `GitHub returned ${res.status}`)
      const text = await res.text()
      const fileName = parsed.path!.split("/").pop() || "file.txt"

      return NextResponse.json({
        success: true,
        type: "inline",
        fileName: `${parsed.owner}/${parsed.repo}: ${fileName}`,
        text: `=== FILE: ${parsed.path} ===\n${text}`,
        fileCount: 1,
        totalSize: text.length,
      })
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to fetch file" },
        { status: 502 }
      )
    }
  }

  // Repo import
  try {
    const result = await fetchRepoFiles(parsed.owner, parsed.repo, parsed.branch, parsed.path)

    if (result.files.length === 0) {
      return NextResponse.json(
        { error: "No importable files found in this repository." },
        { status: 404 }
      )
    }

    const concatenated = concatenateFiles(result.files)
    const repoLabel = `${parsed.owner}/${parsed.repo}${parsed.path ? `/${parsed.path}` : ""}`

    // Small repo → inline
    if (result.totalSize < INLINE_THRESHOLD) {
      return NextResponse.json({
        success: true,
        type: "inline",
        fileName: repoLabel,
        text: concatenated,
        fileCount: result.files.length,
        totalSize: result.totalSize,
        skippedCount: result.skippedCount,
        truncated: result.truncated,
      })
    }

    // Large repo → try RAG pipeline, fall back to inline if embedding fails
    try {
      const chunks = await smartChunkDocument(
        concatenated,
        repoLabel,
        "GITHUB_IMPORT",
        parsed.branch,
        { maxChunkSize: 3000, overlapSize: 200, preserveCodeBlocks: true }
      )

      // Embed one at a time to avoid batch failures
      const textsForEmbedding = chunks.map(prepareChunkForEmbedding)
      const embeddings: number[][] = []
      for (const text of textsForEmbedding) {
        const [emb] = await generateEmbeddings([text])
        embeddings.push(emb)
      }

      const document = await prisma.document.create({
        data: {
          title: repoLabel,
          content: concatenated.substring(0, 50000),
          categories: ["GITHUB_IMPORT"],
          subcategory: sessionId || null,
          metadata: {
            source: "github_import",
            repoUrl: url,
            owner: parsed.owner,
            repo: parsed.repo,
            branch: parsed.branch,
            subdir: parsed.path,
            fileCount: result.files.length,
            totalSize: result.totalSize,
            sessionId,
            userId: session.user.id,
            createdAt: new Date().toISOString(),
          },
        },
      })

      const surrealClient = await getSurrealClient()
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        const embedding = embeddings[i]
        await surrealClient.query(
          `CREATE document_chunk SET
            id = $id,
            document_id = $document_id,
            content = $content,
            chunk_index = $chunk_index,
            embedding = $embedding,
            metadata = $metadata,
            created_at = time::now()`,
          {
            id: `${document.id}_${i}`,
            document_id: document.id,
            content: chunk.content,
            chunk_index: chunk.metadata.chunkIndex,
            embedding,
            metadata: chunk.metadata,
          }
        )
      }

      return NextResponse.json({
        success: true,
        type: "rag",
        fileName: repoLabel,
        documentId: document.id,
        chunkCount: chunks.length,
        fileCount: result.files.length,
        totalSize: result.totalSize,
        skippedCount: result.skippedCount,
        truncated: result.truncated,
      })
    } catch (ragError) {
      // Embedding failed — fall back to inline (truncated to fit context)
      console.warn("[GitHub Import] RAG pipeline failed, falling back to inline:", ragError instanceof Error ? ragError.message : ragError)
      return NextResponse.json({
        success: true,
        type: "inline",
        fileName: repoLabel,
        text: concatenated.substring(0, 200_000),
        fileCount: result.files.length,
        totalSize: result.totalSize,
        skippedCount: result.skippedCount,
        truncated: result.truncated,
      })
    }
  } catch (err) {
    console.error("[GitHub Import] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to import repository" },
      { status: 502 }
    )
  }
}
