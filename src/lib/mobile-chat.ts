import "server-only"
import { generateText, stepCountIs, tool, zodSchema } from "ai"

import { findAssistantById } from "@/features/assistants/core/repository"
import {
  addDashboardChatSessionMessages,
  deleteDashboardChatSessionMessages,
  getDashboardChatSession,
} from "@/features/conversations/sessions/service"
import { isHttpServiceError } from "@/features/shared/http-service-error"
import { getChatProvider, resolveModelId } from "@/lib/llm/provider"
import { prisma } from "@/lib/prisma"
import { buildToolInstruction } from "@/lib/prompts/instructions"
import { resolveSkillsForAssistant } from "@/lib/skills/resolver"

export interface MobileSkill {
  id: string
  displayName: string
  description: string
  icon: string | null
}

/**
 * Skill yang bisa dipakai user di mobile: yang aktif, dan bersifat global
 * (organizationId null) atau milik organisasi tempat user menjadi anggota.
 * Filter ini sengaja disamakan dengan resolveSkillsForAssistant.
 */
export async function listMobileSkills(userId: string): Promise<MobileSkill[]> {
  return prisma.skill.findMany({
    where: {
      enabled: true,
      OR: [
        { organizationId: null },
        { organization: { memberships: { some: { userId } } } },
      ],
    },
    select: { id: true, displayName: true, description: true, icon: true },
    orderBy: { displayName: "asc" },
  })
}

/** Opsi per-pesan dari composer mobile. */
export interface MobileChatOptions {
  enableWebSearch?: boolean
  enableCodeInterpreter?: boolean
  /** Nama tool bawaan yang dipilih user (mis. calculator, date_time). */
  enabledToolNames?: string[]
  /** Skill yang dipilih; prompt-nya disisipkan ke system prompt. */
  enabledSkillIds?: string[]
  /** Mode Canvas: "auto" atau tipe artifact (mis. "text/html"). */
  canvasMode?: string
  /** Teks hasil ekstraksi lampiran (dari /api/chat/upload). */
  fileContext?: string
}

type ServiceError = { status: number; error: string }

/**
 * Balasan chat non-streaming untuk klien mobile. Sengaja ringkas (tanpa
 * streaming) agar mudah dikonsumsi React Native.
 */
const DEFAULT_MODEL = "openai/gpt-4o-mini"
const MAX_OUTPUT_TOKENS = 1024
/** Batas atas token keluaran untuk mobile — mencegah modelConfig.maxTokens yang
 * besar memicu limit kredit provider (mis. permintaan 65k token). */
const HARD_MAX_OUTPUT_TOKENS = 4096
const GENERIC_SYSTEM =
  "You are RantAI, a helpful assistant. Answer clearly and concisely."

/** Ambil angka valid dari nilai modelConfig, atau undefined. */
function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

/**
 * Bangun tools bawaan sesuai toggle dari toolbar mobile. Memakai ulang
 * BUILTIN_TOOLS yang sama dengan chat web.
 */
async function buildTools(params: {
  userId: string
  sessionId: string
  assistantId?: string
  options: MobileChatOptions
}) {
  const { options } = params
  const wanted = new Set<string>(options.enabledToolNames ?? [])
  if (options.enableWebSearch) wanted.add("web_search")
  if (options.enableCodeInterpreter) wanted.add("code_interpreter")
  if (options.canvasMode) {
    wanted.add("create_artifact")
    wanted.add("update_artifact")
  }
  if (wanted.size === 0) return undefined

  const { BUILTIN_TOOLS } = await import("@/lib/tools/builtin")
  // canvasMode diperlukan tool artifact; tool lain mengabaikannya.
  const ctx = {
    userId: params.userId,
    assistantId: params.assistantId,
    sessionId: params.sessionId,
    canvasMode: options.canvasMode,
  }
  const tools: Record<string, ReturnType<typeof tool>> = {}

  for (const name of wanted) {
    const builtin = BUILTIN_TOOLS[name]
    if (!builtin) continue
    tools[name] = tool({
      description: builtin.description,
      inputSchema: zodSchema(builtin.parameters),
      execute: async (args) => builtin.execute(args as Record<string, unknown>, ctx),
    })
  }

  return Object.keys(tools).length ? tools : undefined
}

/**
 * Inti generasi: menerima riwayat siap-pakai, mengembalikan teks balasan.
 * Dipakai bersama oleh kirim-pesan biasa dan regenerate.
 */
async function runGeneration(params: {
  userId: string
  sessionId: string
  assistantId: string
  history: Array<{ role: "user" | "assistant"; content: string }>
  options: MobileChatOptions
}): Promise<{ reply: string } | ServiceError> {
  const tools = await buildTools({
    userId: params.userId,
    sessionId: params.sessionId,
    assistantId: params.assistantId,
    options: params.options,
  })

  // Muat konfigurasi agent dari sesi: persona (systemPrompt), model, dan
  // parameter (temperature dll). Bila agent tak ditemukan, pakai default umum.
  const assistant = await findAssistantById(params.assistantId).catch(() => null)
  let system = assistant?.systemPrompt?.trim() ? assistant.systemPrompt : GENERIC_SYSTEM
  const modelId = assistant?.model || DEFAULT_MODEL
  const modelConfig =
    assistant?.modelConfig && typeof assistant.modelConfig === "object"
      ? (assistant.modelConfig as Record<string, unknown>)
      : null

  if (params.options.enabledSkillIds?.length) {
    const skillPrompt = await resolveSkillsForAssistant(
      params.assistantId,
      params.options.enabledSkillIds,
      params.userId
    )
    if (skillPrompt) system = `${system}\n\n${skillPrompt}`
  }
  if (tools) {
    system += buildToolInstruction(Object.keys(tools), {
      canvasMode: params.options.canvasMode,
    })
  }

  const temperature = num(modelConfig?.temperature)
  const topP = num(modelConfig?.topP)
  const presencePenalty = num(modelConfig?.presencePenalty)
  const frequencyPenalty = num(modelConfig?.frequencyPenalty)
  const maxTokens = Math.min(
    num(modelConfig?.maxTokens) ?? MAX_OUTPUT_TOKENS,
    HARD_MAX_OUTPUT_TOKENS
  )

  try {
    const result = await generateText({
      model: getChatProvider()(resolveModelId(modelId)),
      system,
      messages: params.history,
      maxOutputTokens: maxTokens,
      ...(temperature != null && { temperature }),
      ...(topP != null && { topP }),
      ...(presencePenalty != null && { presencePenalty }),
      ...(frequencyPenalty != null && { frequencyPenalty }),
      // Canvas perlu langkah ekstra: buat artifact lalu simpulkan hasilnya.
      ...(tools ? { tools, stopWhen: stepCountIs(params.options.canvasMode ? 8 : 5) } : {}),
    })

    const reply = result.text.trim()
    // Tool yang gagal bisa membuat model berhenti tanpa teks akhir. Jangan
    // simpan balasan kosong — laporkan sebagai error agar UI bisa memberi tahu.
    if (!reply) {
      return {
        status: 502,
        error: "AI tidak menghasilkan balasan (kemungkinan tool gagal dijalankan).",
      }
    }
    return { reply }
  } catch (error) {
    console.error("[Mobile Chat] generate error:", error)
    return { status: 502, error: "Gagal menghasilkan balasan AI" }
  }
}

/**
 * Alur: ambil riwayat sesi → simpan pesan user → hasilkan balasan AI →
 * simpan balasan → kembalikan teksnya.
 */
export async function generateMobileReply(params: {
  userId: string
  sessionId: string
  content: string
  /** Id pesan yang dibalas (fitur reply). Disimpan & dikutip ke prompt. */
  replyTo?: string
  options: MobileChatOptions
}): Promise<{ reply: string } | ServiceError> {
  const detail = await getDashboardChatSession({
    userId: params.userId,
    sessionId: params.sessionId,
  })
  if (isHttpServiceError(detail)) {
    return { status: detail.status, error: detail.error }
  }

  const history = detail.messages.map((message) => ({
    role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: message.content,
  }))

  // Simpan pesan user lebih dulu (agar tetap tercatat walau generasi gagal).
  // Konten disimpan bersih; kutipan & lampiran hanya menempel di prompt.
  const persistUser = await addDashboardChatSessionMessages({
    userId: params.userId,
    sessionId: params.sessionId,
    input: {
      messages: [
        {
          role: "user",
          content: params.content,
          ...(params.replyTo ? { replyTo: params.replyTo } : {}),
        },
      ],
    },
  })
  if (isHttpServiceError(persistUser)) {
    return { status: persistUser.status, error: persistUser.error }
  }

  let userContent = params.content

  // Beri tahu model pesan mana yang sedang dibalas.
  if (params.replyTo) {
    const quoted = detail.messages.find((m) => m.id === params.replyTo)
    if (quoted) {
      userContent = `--- Membalas pesan berikut ---\n${quoted.content}\n--- Akhir kutipan ---\n\n${userContent}`
    }
  }

  // Sisipkan isi lampiran (bila ada) sebagai konteks pada pesan user.
  if (params.options.fileContext) {
    userContent = `${userContent}\n\n--- Isi lampiran ---\n${params.options.fileContext}`
  }

  const generated = await runGeneration({
    userId: params.userId,
    sessionId: params.sessionId,
    assistantId: detail.assistantId,
    history: [...history, { role: "user", content: userContent }],
    options: params.options,
  })
  if ("error" in generated) return generated

  await addDashboardChatSessionMessages({
    userId: params.userId,
    sessionId: params.sessionId,
    input: { messages: [{ role: "assistant", content: generated.reply }] },
  })

  return generated
}

/**
 * Regenerate: buang balasan asisten paling akhir, lalu hasilkan balasan baru
 * dari riwayat yang tersisa. Pesan user TIDAK ditulis ulang.
 */
export async function regenerateMobileReply(params: {
  userId: string
  sessionId: string
  options: MobileChatOptions
}): Promise<{ reply: string } | ServiceError> {
  const detail = await getDashboardChatSession({
    userId: params.userId,
    sessionId: params.sessionId,
  })
  if (isHttpServiceError(detail)) {
    return { status: detail.status, error: detail.error }
  }

  const messages = [...detail.messages]
  const staleIds: string[] = []
  while (messages.length > 0 && messages[messages.length - 1].role === "assistant") {
    staleIds.push(messages[messages.length - 1].id)
    messages.pop()
  }
  if (messages.length === 0) {
    return { status: 400, error: "Tidak ada pesan untuk dibuat ulang." }
  }

  const generated = await runGeneration({
    userId: params.userId,
    sessionId: params.sessionId,
    assistantId: detail.assistantId,
    history: messages.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
    options: params.options,
  })
  if ("error" in generated) return generated

  // Hapus balasan lama hanya setelah balasan baru berhasil dibuat.
  if (staleIds.length > 0) {
    await deleteDashboardChatSessionMessages({
      userId: params.userId,
      sessionId: params.sessionId,
      input: { messageIds: staleIds },
    })
  }

  await addDashboardChatSessionMessages({
    userId: params.userId,
    sessionId: params.sessionId,
    input: { messages: [{ role: "assistant", content: generated.reply }] },
  })

  return generated
}
