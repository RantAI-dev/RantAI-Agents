import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { MediaModalitySchema } from "@/features/media/schema"
import { HOUSE_MEDIA_MODELS } from "@/features/media/house-media-models"

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

  // House (white-labeled) media models are served by a direct provider, not the
  // OpenRouter sync — inject them from code, only when the upstream is configured.
  const outputFilter = parsed?.success ? MODALITY_TO_OUTPUT[parsed.data] : null
  const houseModels = process.env.MINIMAX_API_KEY
    ? HOUSE_MEDIA_MODELS.filter(
        (m) => !outputFilter || m.outputModalities.includes(outputFilter)
      ).map((m) => ({
        id: m.id, name: m.name, provider: m.provider, providerSlug: "rantai",
        description: m.description, contextWindow: 0,
        pricingInput: 0, pricingOutput: 0,
        hasVision: false, hasToolCalling: false, hasStreaming: false,
        isFree: false, outputModalities: m.outputModalities, inputModalities: m.inputModalities,
      }))
    : []

  return NextResponse.json([...houseModels, ...models])
}
