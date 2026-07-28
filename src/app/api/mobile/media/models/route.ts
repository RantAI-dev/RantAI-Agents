import { NextResponse } from "next/server"

import { MediaModalitySchema } from "@/features/media/schema"
import { getRequestUserId } from "@/lib/mobile-auth"
import { prisma } from "@/lib/prisma"

const MODALITY_TO_OUTPUT: Record<string, string> = {
  IMAGE: "image",
  AUDIO: "audio",
  VIDEO: "video",
}

/**
 * GET /api/mobile/media/models?modality=IMAGE|AUDIO|VIDEO — active models that
 * can output the requested modality (slim shape for the mobile picker).
 */
export async function GET(req: Request) {
  const userId = await getRequestUserId(req)
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const modalityParam = new URL(req.url).searchParams.get("modality")
  const parsed = modalityParam ? MediaModalitySchema.safeParse(modalityParam) : null
  if (modalityParam && !parsed?.success) {
    return NextResponse.json({ error: "Invalid modality" }, { status: 400 })
  }

  const where: Record<string, unknown> = { isActive: true }
  if (parsed?.success) {
    where.outputModalities = { has: MODALITY_TO_OUTPUT[parsed.data] }
  }

  const models = await prisma.llmModel.findMany({
    where,
    orderBy: [{ provider: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      provider: true,
      isFree: true,
      outputModalities: true,
      inputModalities: true,
    },
  })

  return NextResponse.json(models)
}
