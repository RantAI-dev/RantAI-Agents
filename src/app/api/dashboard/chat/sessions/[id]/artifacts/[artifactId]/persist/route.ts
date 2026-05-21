import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { uploadFile, S3Paths, getArtifactExtension } from "@/lib/s3"
import { indexArtifactContent } from "@/lib/rag"
import {
  ARTIFACT_TYPES,
  type ArtifactType,
} from "@/features/conversations/components/chat/artifacts/registry"

type Params = { params: Promise<{ id: string; artifactId: string }> }

interface Body {
  title?: unknown
  type?: unknown
  content?: unknown
  language?: unknown
}

function isValidType(type: unknown): type is ArtifactType {
  return (
    typeof type === "string" &&
    (ARTIFACT_TYPES as readonly string[]).includes(type)
  )
}

export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: sessionId, artifactId } = await params

  // Ownership: the chat session must belong to the caller.
  const ownerRow = await prisma.dashboardSession.findFirst({
    where: { id: sessionId, userId: session.user.id },
    select: { id: true, organizationId: true },
  })
  if (!ownerRow) {
    return Response.json({ error: "Session not found" }, { status: 404 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (typeof body.title !== "string" || !body.title) {
    return Response.json({ error: "title is required" }, { status: 400 })
  }
  if (!isValidType(body.type)) {
    return Response.json({ error: "type is invalid" }, { status: 400 })
  }
  if (typeof body.content !== "string" || !body.content) {
    return Response.json({ error: "content is required" }, { status: 400 })
  }
  const language =
    typeof body.language === "string" && body.language ? body.language : undefined

  // Idempotent: an earlier retry attempt or a network-retry from the client
  // could land here after the original create_artifact actually succeeded
  // under the hood. Return ok with a flag instead of throwing on duplicate.
  const existing = await prisma.document.findUnique({
    where: { id: artifactId },
    select: { id: true },
  })
  if (existing) {
    return Response.json({ ok: true, alreadyPersisted: true })
  }

  const contentBytes = Buffer.byteLength(body.content, "utf-8")
  const ext = getArtifactExtension(body.type)
  const s3Key = S3Paths.artifact(
    ownerRow.organizationId,
    sessionId,
    artifactId,
    ext,
  )
  const mimeType =
    body.type === "image/svg+xml" ? "image/svg+xml" : "text/plain"

  try {
    await uploadFile(s3Key, Buffer.from(body.content, "utf-8"), mimeType)
    await prisma.document.create({
      data: {
        id: artifactId,
        title: body.title,
        content: body.content,
        categories: ["ARTIFACT"],
        artifactType: body.type,
        sessionId,
        organizationId: ownerRow.organizationId,
        createdBy: session.user.id,
        s3Key,
        fileType: "artifact",
        fileSize: contentBytes,
        mimeType,
        metadata: { artifactLanguage: language },
      },
    })
    indexArtifactContent(artifactId, body.title, body.content, {
      artifactType: body.type,
    }).catch((err) =>
      console.error("[artifacts/persist] Background indexing error:", err),
    )
    return Response.json({ ok: true })
  } catch (err) {
    console.error("[artifacts/persist] Persistence retry failed:", err)
    return Response.json(
      {
        ok: false,
        error:
          "Storage backend still failing. Try again in a moment, or the artifact may need to be regenerated.",
      },
      { status: 502 },
    )
  }
}
