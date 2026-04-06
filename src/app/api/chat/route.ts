import {
  ChatRequestBodySchema,
  ChatRequestHeadersSchema,
} from "@/features/chat-public/schema"
import {
  isChatPublicServiceError,
  runChat,
} from "@/features/chat-public/service"
import { auth } from "@/lib/auth"

export async function POST(req: Request) {
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
