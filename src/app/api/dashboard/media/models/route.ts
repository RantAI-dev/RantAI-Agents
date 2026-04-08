import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { MediaModalitySchema } from "@/features/media/schema"

const MODALITY_TO_OUTPUT: Record<string, string> = {
  IMAGE: "image",
  AUDIO: "audio",
  VIDEO: "video",
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const modalityParam = url.searchParams.get("modality")
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
      id: true, name: true, provider: true, providerSlug: true,
      description: true, contextWindow: true,
      pricingInput: true, pricingOutput: true,
      hasVision: true, hasToolCalling: true, hasStreaming: true,
      isFree: true, outputModalities: true, inputModalities: true,
    },
  })

  return NextResponse.json(models)
}
