import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { DashboardChatSessionArtifactParamsSchema } from "@/features/conversations/sessions/schema"
import { getDashboardChatSessionArtifact } from "@/features/conversations/sessions/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { getOrComputeDocx } from "@/lib/document-script/docx-cache"
import { docxToPdf } from "@/lib/rendering/server/docx-to-pdf"

export const runtime = "nodejs"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const parsedParams = DashboardChatSessionArtifactParamsSchema.safeParse(await params)
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Artifact not found" }, { status: 404 })
    }

    const format = new URL(req.url).searchParams.get("format") ?? "docx"

    const result = await getDashboardChatSessionArtifact({
      userId: session.user.id,
      sessionId: parsedParams.data.id,
      artifactId: parsedParams.data.artifactId,
    })

    if (isHttpServiceError(result)) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    if (result.artifactType !== "text/document") {
      return NextResponse.json(
        { error: "Download endpoint only serves text/document artifacts" },
        { status: 400 }
      )
    }

    if (format !== "docx" && format !== "pdf") {
      return NextResponse.json(
        { error: `Unsupported format: ${format}` },
        { status: 400 }
      )
    }

    const safeTitle =
      (result.title ?? "").replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80) ||
      "document"

    // NEW-T-2: route DOCX rendering through `getOrComputeDocx`, which
    // gates the sandbox run via `withRenderSlot` (the same semaphore the
    // preview pipeline uses) and dedupes concurrent requests for the same
    // (artifactId, content) so a rapid DOCX→PDF click shares one sandbox
    // run instead of spawning two.
    let docxBuf: Buffer
    try {
      docxBuf = await getOrComputeDocx(parsedParams.data.artifactId, result.content)
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message },
        { status: 500 }
      )
    }

    if (format === "pdf") {
      // D-3: route the cached DOCX through soffice to produce a PDF.
      // The same conversion is used internally by the preview pipeline
      // (docx → pdf → png pages); here we stop at the PDF.
      let pdf: Buffer
      try {
        pdf = await docxToPdf(docxBuf)
      } catch (err) {
        return NextResponse.json(
          { error: `pdf conversion failed: ${(err as Error).message}` },
          { status: 500 }
        )
      }
      return new Response(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${safeTitle}.pdf"`,
          "Cache-Control": "no-store",
        },
      })
    }

    return new Response(new Uint8Array(docxBuf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeTitle}.docx"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("[Artifact Download API] error:", error)
    return NextResponse.json(
      { error: "Failed to download artifact" },
      { status: 500 }
    )
  }
}
