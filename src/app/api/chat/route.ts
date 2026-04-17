import {
  ChatRequestBodySchema,
  ChatRequestHeadersSchema,
} from "@/features/chat-public/schema"
import {
  isChatPublicServiceError,
  runChat,
} from "@/features/chat-public/service"
import { getUserId } from "@/lib/get-user-id"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  const userId = await getUserId(req)
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  })

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
    userId,
    userName: user?.name ?? null,
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
