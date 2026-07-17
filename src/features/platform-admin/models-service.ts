/**
 * Admin model catalog management: enable/disable, manual add (for endpoints
 * without /models), platform default model (PlatformSetting), OpenRouter sync.
 */
import { prisma } from "@/lib/prisma"
import { DEFAULT_MODEL_ID } from "@/lib/models"
import { invalidateProviderRegistry } from "@/lib/llm/provider-registry"
import { writeAdminAudit, type AdminActor } from "./audit"

export const DEFAULT_MODEL_SETTING_KEY = "default_chat_model"

export async function listAdminModels(params: { search?: string; providerId?: string }) {
  const where: Record<string, unknown> = {}
  if (params.search) {
    where.OR = [
      { id: { contains: params.search, mode: "insensitive" } },
      { name: { contains: params.search, mode: "insensitive" } },
    ]
  }
  if (params.providerId === "legacy") where.providerId = null
  else if (params.providerId) where.providerId = params.providerId

  const [models, defaultModelId] = await Promise.all([
    prisma.llmModel.findMany({
      where,
      orderBy: [{ providerId: "asc" }, { provider: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        provider: true,
        providerId: true,
        source: true,
        enabled: true,
        isActive: true,
        isFree: true,
        hasVision: true,
        hasToolCalling: true,
        contextWindow: true,
        pricingInput: true,
        pricingOutput: true,
        llmProvider: { select: { name: true } },
      },
    }),
    getDefaultChatModel(),
  ])
  return { models, defaultModelId }
}

/** Effective platform default chat model: PlatformSetting override else code default. */
export async function getDefaultChatModel(): Promise<string> {
  try {
    const row = await prisma.platformSetting.findUnique({
      where: { key: DEFAULT_MODEL_SETTING_KEY },
    })
    const value = row?.value
    if (typeof value === "string" && value) return value
  } catch {
    // table missing pre-migration — fall back
  }
  return DEFAULT_MODEL_ID
}

export async function setDefaultChatModel(actor: AdminActor, modelId: string) {
  const model = await prisma.llmModel.findUnique({ where: { id: modelId } })
  if (!model) return { error: "Model not found in catalog" }
  if (!model.enabled || !model.isActive) return { error: "Cannot default to a disabled model" }
  await prisma.platformSetting.upsert({
    where: { key: DEFAULT_MODEL_SETTING_KEY },
    update: { value: modelId },
    create: { key: DEFAULT_MODEL_SETTING_KEY, value: modelId },
  })
  await writeAdminAudit({
    actor,
    action: "model.set_default",
    targetType: "model",
    targetId: modelId,
    targetLabel: model.name,
  })
  return { ok: true, defaultModelId: modelId }
}

export async function setModelEnabled(actor: AdminActor, modelId: string, enabled: boolean) {
  const model = await prisma.llmModel.update({
    where: { id: modelId },
    data: { enabled },
    select: { name: true },
  })
  await invalidateProviderRegistry()
  await writeAdminAudit({
    actor,
    action: enabled ? "model.enable" : "model.disable",
    targetType: "model",
    targetId: modelId,
    targetLabel: model.name,
  })
  return { ok: true }
}

export async function addManualModel(
  actor: AdminActor,
  input: {
    id: string
    name?: string
    providerId: string
    contextWindow?: number
    hasVision?: boolean
    hasToolCalling?: boolean
  }
) {
  const id = input.id.trim()
  if (!id) return { error: "Model id is required" }
  const provider = await prisma.llmProvider.findUnique({ where: { id: input.providerId } })
  if (!provider) return { error: "Provider not found" }
  const existing = await prisma.llmModel.findUnique({ where: { id } })
  if (existing) return { error: "A model with this id already exists in the catalog" }

  await prisma.llmModel.create({
    data: {
      id,
      name: input.name?.trim() || id,
      provider: provider.name,
      providerSlug: id.includes("/") ? id.split("/")[0] : provider.name.toLowerCase().replace(/\s+/g, "-"),
      contextWindow: input.contextWindow ?? 0,
      pricingInput: 0,
      pricingOutput: 0,
      hasVision: input.hasVision ?? false,
      hasToolCalling: input.hasToolCalling ?? true,
      providerId: provider.id,
      source: "manual",
    },
  })
  await invalidateProviderRegistry()
  await writeAdminAudit({
    actor,
    action: "model.add_manual",
    targetType: "model",
    targetId: id,
    targetLabel: input.name || id,
    metadata: { providerId: provider.id },
  })
  return { ok: true }
}

/** Remove a discovered/manual model. OpenRouter-synced rows are managed by the sync. */
export async function removeManagedModel(actor: AdminActor, modelId: string) {
  const model = await prisma.llmModel.findUnique({ where: { id: modelId } })
  if (!model) return { error: "Model not found" }
  if (model.source === "openrouter_sync") {
    return { error: "OpenRouter-synced models cannot be removed — disable them instead" }
  }
  await prisma.llmModel.delete({ where: { id: modelId } })
  await invalidateProviderRegistry()
  await writeAdminAudit({
    actor,
    action: "model.remove",
    targetType: "model",
    targetId: modelId,
    targetLabel: model.name,
  })
  return { ok: true }
}
