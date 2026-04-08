import { prisma } from "@/lib/prisma"
import { TRACKED_PROVIDERS, getProviderName, isTrackedProvider } from "./providers"

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"

/** Grace period before soft-deactivating models missing from the API. */
const DEACTIVATION_GRACE_HOURS = 48

interface OpenRouterModel {
  id: string
  name: string
  context_length: number
  architecture?: {
    modality?: string
    input_modalities?: string[]
    output_modalities?: string[]
  }
  pricing?: {
    prompt?: string
    completion?: string
  }
  supported_parameters?: string[]
  top_provider?: {
    context_length?: number
    max_completion_tokens?: number
    is_moderated?: boolean
  }
}

interface OpenRouterResponse {
  data: OpenRouterModel[]
}

interface SyncResult {
  synced: number
  deactivated: number
  freeWithTools: number
  trackedLab: number
  total: number
}

/** Fetch all models from OpenRouter API. */
async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  const res = await fetch(OPENROUTER_MODELS_URL)
  if (!res.ok) {
    throw new Error(`OpenRouter API returned ${res.status}: ${res.statusText}`)
  }
  const json = (await res.json()) as OpenRouterResponse
  return json.data ?? []
}

/** Extract provider slug from model ID (e.g. "openai/gpt-5.2" → "openai"). */
function extractProviderSlug(modelId: string): string {
  return modelId.split("/")[0] ?? modelId
}

const SUPPORTED_OUTPUT_MODALITIES = ["text", "image", "audio", "video"]

/** Check if a model outputs a supported modality (text, image, audio, or video). */
function isSupportedModel(model: OpenRouterModel): boolean {
  const outputModalities = model.architecture?.output_modalities
  if (!outputModalities || outputModalities.length === 0) return true // assume text if unspecified
  return outputModalities.some((m) => SUPPORTED_OUTPUT_MODALITIES.includes(m))
}

function isFreeModel(model: OpenRouterModel): boolean {
  return model.pricing?.prompt === "0" && model.pricing?.completion === "0"
}

function hasToolCalling(model: OpenRouterModel): boolean {
  return model.supported_parameters?.includes("tools") ?? false
}

function hasVision(model: OpenRouterModel): boolean {
  return model.architecture?.input_modalities?.includes("image") ?? false
}

/** Convert per-token string price to per-million-tokens number. */
function toPerMillion(perToken: string | undefined): number {
  if (!perToken || perToken === "0") return 0
  return parseFloat(perToken) * 1_000_000
}

/** Clean OpenRouter display name (strips "Provider: " prefix if present). */
function cleanModelName(rawName: string): string {
  const colonIndex = rawName.indexOf(": ")
  if (colonIndex > 0 && colonIndex < 30) {
    return rawName.slice(colonIndex + 2)
  }
  return rawName
}

/** Determine if a model should be included in our sync. */
function shouldIncludeModel(model: OpenRouterModel): { include: boolean; reason: "tracked_lab" | "free_with_tools" | null } {
  if (!isSupportedModel(model)) return { include: false, reason: null }

  const slug = extractProviderSlug(model.id)
  if (isTrackedProvider(slug)) {
    return { include: true, reason: "tracked_lab" }
  }

  if (isFreeModel(model) && hasToolCalling(model)) {
    return { include: true, reason: "free_with_tools" }
  }

  return { include: false, reason: null }
}

/**
 * Sync models from OpenRouter into the LlmModel table.
 *
 * Includes:
 * - All text models from tracked labs (1:1 coverage)
 * - All free models with tool-calling support
 *
 * Models that disappear from OpenRouter are soft-deactivated after a grace period.
 */
export async function syncModelsFromOpenRouter(): Promise<SyncResult> {
  const openRouterModels = await fetchOpenRouterModels()

  const toSync: Array<{
    model: OpenRouterModel
    reason: "tracked_lab" | "free_with_tools"
  }> = []

  for (const model of openRouterModels) {
    const { include, reason } = shouldIncludeModel(model)
    if (include && reason) {
      toSync.push({ model, reason })
    }
  }

  const now = new Date()
  const syncedIds: string[] = []
  let freeWithToolsCount = 0
  let trackedLabCount = 0

  for (const { model, reason } of toSync) {
    const slug = extractProviderSlug(model.id)
    const free = isFreeModel(model)
    const tools = hasToolCalling(model)

    if (reason === "free_with_tools") freeWithToolsCount++
    if (reason === "tracked_lab") trackedLabCount++

    await prisma.llmModel.upsert({
      where: { id: model.id },
      create: {
        id: model.id,
        name: cleanModelName(model.name),
        provider: getProviderName(slug),
        providerSlug: slug,
        description: "",
        contextWindow: model.context_length ?? 0,
        pricingInput: toPerMillion(model.pricing?.prompt),
        pricingOutput: toPerMillion(model.pricing?.completion),
        hasVision: hasVision(model),
        hasToolCalling: tools,
        hasStreaming: true,
        isFree: free,
        isTrackedLab: reason === "tracked_lab",
        isActive: true,
        outputModalities: model.architecture?.output_modalities ?? [],
        inputModalities: model.architecture?.input_modalities ?? [],
        rawData: JSON.parse(JSON.stringify(model)),
        lastSeenAt: now,
      },
      update: {
        name: cleanModelName(model.name),
        provider: getProviderName(slug),
        providerSlug: slug,
        contextWindow: model.context_length ?? 0,
        pricingInput: toPerMillion(model.pricing?.prompt),
        pricingOutput: toPerMillion(model.pricing?.completion),
        hasVision: hasVision(model),
        hasToolCalling: tools,
        isFree: free,
        isTrackedLab: reason === "tracked_lab",
        isActive: true,
        outputModalities: model.architecture?.output_modalities ?? [],
        inputModalities: model.architecture?.input_modalities ?? [],
        rawData: JSON.parse(JSON.stringify(model)),
        lastSeenAt: now,
      },
    })

    syncedIds.push(model.id)
  }

  // Soft-deactivate models not seen in this sync, with grace period
  const graceCutoff = new Date(now.getTime() - DEACTIVATION_GRACE_HOURS * 60 * 60 * 1000)
  const deactivated = await prisma.llmModel.updateMany({
    where: {
      id: { notIn: syncedIds },
      isActive: true,
      lastSeenAt: { lt: graceCutoff },
    },
    data: { isActive: false },
  })

  return {
    synced: syncedIds.length,
    deactivated: deactivated.count,
    freeWithTools: freeWithToolsCount,
    trackedLab: trackedLabCount,
    total: syncedIds.length,
  }
}
