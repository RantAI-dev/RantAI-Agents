import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { DashboardChatSessionArtifactParamsSchema } from "@/features/conversations/sessions/schema"
import { getDashboardChatSessionArtifact } from "@/features/conversations/sessions/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { DocumentAstSchema } from "@/lib/document-ast/schema"
import { astToDocx } from "@/lib/document-ast/to-docx"
import { runScriptInSandbox } from "@/lib/document-script/sandbox-runner"

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

    // Compute a safe filename slug once — both AST and script branches reuse it.
    // For script artifacts we don't have an AST title, so fall back to the
    // artifact's own `title` field; for AST we'll override with the parsed
    // ast.meta.title below since it is the authoritative document title.
    let safeTitle =
      (result.title ?? "").replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80) ||
      "document"

    if (result.documentFormat === "script") {
      const r = await runScriptInSandbox(result.content, {})
      if (!r.ok || !r.buf) {
        return NextResponse.json(
          { error: `script failed: ${r.error ?? "unknown"}` },
          { status: 500 }
        )
      }
      if (format === "docx") {
        return new Response(new Uint8Array(r.buf), {
          status: 200,
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": `attachment; filename="${safeTitle}.docx"`,
            "Cache-Control": "no-store",
          },
        })
      }
      // pdf format for script artifacts is wired up in a later task.
      return NextResponse.json(
        {
          error: `format ${format} not supported for script artifacts in this build`,
        },
        { status: 400 }
      )
    }

    let ast
    try {
      ast = DocumentAstSchema.parse(JSON.parse(result.content))
    } catch (e) {
      // Schema-shape failures map to 422 (Unprocessable Entity) — the
      // request was syntactically valid but the stored content can't
      // be processed. (409 would imply a concurrency conflict.)
      return NextResponse.json(
        { error: `Invalid document AST: ${(e as Error).message}` },
        { status: 422 }
      )
    }

    if (format === "docx") {
      const buf = await astToDocx(ast)
      safeTitle =
        ast.meta.title.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 80) || "document"
      return new Response(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${safeTitle}.docx"`,
          "Cache-Control": "no-store",
        },
      })
    }

    return NextResponse.json(
      { error: `Unsupported format: ${format}` },
      { status: 400 }
    )
  } catch (error) {
    console.error("[Artifact Download API] error:", error)
    return NextResponse.json(
      { error: "Failed to download artifact" },
      { status: 500 }
    )
  }
}
