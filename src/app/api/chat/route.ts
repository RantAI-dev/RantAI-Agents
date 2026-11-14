import {
  ChatRequestBodySchema,
  ChatRequestHeadersSchema,
} from "@/features/chat-public/schema"
import {
  isChatPublicServiceError,
  runChat,
} from "@/features/chat-public/service"
import { auth } from "@/lib/auth"
import { forwardWithFallback } from "@/lib/rust-router/forward"
import { rustTarget } from "@/lib/rust-router/routes"

// POST /api/chat — with the `chat` route group on, Rust answers first; an assistant it cannot
// serve yet (KB, MCP, workflows, attachments) is a 409 `capability_not_ported`, and that
// request runs here instead (docs/operations/rust-cutover.md).
export async function POST(req: Request) {
  const { pathname, search } = new URL(req.url)
  const target = rustTarget(req.method, pathname, search)
  if (!target) return chatInNext(req)
  return forwardWithFallback(req, target.url, {
    fallbackOn: { status: 409, code: "capability_not_ported" },
    fallback: chatInNext,
  })
}

async function chatInNext(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const parsedHeaders = ChatRequestHeadersSchema.safeParse({
    assistantId: req.headers.get("X-Assistant-Id"),
    systemPromptB64: req.headers.get("X-System-Prompt"),
    useKnowledgeBase: req.headers.get("X-Use-Knowledge-Base"),
  })
  if (!parsedHeaders.success) {
    return new Response(JSON.stringify({ error: "Invalid request headers" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const parsedBody = ChatRequestBodySchema.safeParse(rawBody)
  if (!parsedBody.success) {
    return new Response(JSON.stringify({ error: "Invalid request payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const result = await runChat({
    body: parsedBody.data,
    userId: session.user.id,
    userName: session.user.name,
    headers: parsedHeaders.data,
    abortSignal: req.signal,
  })

  if (isChatPublicServiceError(result)) {
    return new Response(
      JSON.stringify({ error: result.error, ...(result.code ? { code: result.code } : {}) }),
      {
        status: result.status,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  return result
}
