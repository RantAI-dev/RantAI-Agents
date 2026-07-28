/**
 * Mobile-only audio generation path.
 *
 * OpenRouter requires `stream: true` for audio output, and streaming only
 * supports the raw `pcm16` format (not directly playable). The shared web
 * `generateAudio` (src/features/media/provider/openrouter.ts) stores that raw
 * pcm16 as-is. To avoid changing that shared web behavior, mobile audio has its
 * own path that requests `pcm16`, accumulates the streamed chunks, and wraps
 * them in a **WAV container** (24kHz / mono / 16-bit) so the result is a
 * standard, playable `.wav`. It reuses the shared data/storage layer only.
 */
import {
  createMediaJobRow,
  failMediaJob,
  finalizeMediaJobAsSucceeded,
  setJobRunning,
} from "@/features/media/repository"
import { uploadMediaBytes } from "@/features/media/storage"
import { prisma } from "@/lib/prisma"

const OPENROUTER_BASE = "https://openrouter.ai/api/v1"

function getOpenRouterApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error("OPENROUTER_API_KEY is not set")
  return key
}

/** Collect every base64 chunk under an `audio`/`input_audio` key in an event. */
function collectAudioChunks(value: unknown, out: (b64: string) => void): void {
  if (!value || typeof value !== "object") return
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if ((key === "audio" || key === "input_audio") && v && typeof v === "object") {
      const d = (v as { data?: unknown }).data
      if (typeof d === "string" && d.length > 0) out(d)
    }
    if (v && typeof v === "object") collectAudioChunks(v, out)
  }
}

/** Wrap raw little-endian PCM in a minimal WAV container. */
function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bits = 16): Buffer {
  const byteRate = (sampleRate * channels * bits) / 8
  const blockAlign = (channels * bits) / 8
  const header = Buffer.alloc(44)
  header.write("RIFF", 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write("WAVE", 8)
  header.write("fmt ", 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bits, 34)
  header.write("data", 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

interface MobileAudioResult {
  bytes: Uint8Array
  mimeType: string
  costCents: number
}

/** Streaming pcm16 TTS request, assembled into a playable WAV file. */
async function generateMobileAudio(input: {
  modelId: string
  prompt: string
  voice: string
}): Promise<MobileAudioResult> {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenRouterApiKey()}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "HTTP-Referer": "https://rantai.dev",
      "X-Title": "RantAI Agents Mobile Media",
    },
    body: JSON.stringify({
      model: input.modelId,
      messages: [{ role: "user", content: input.prompt }],
      modalities: ["text", "audio"],
      audio: { voice: input.voice, format: "pcm16" },
      stream: true,
    }),
  })

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "")
    throw new Error(`OpenRouter audio generation failed: ${errText}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  const chunks: Buffer[] = []
  let totalCost: number | undefined

  // Parse the SSE stream; decode each pcm16 chunk to bytes and concatenate.
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      for (const line of rawEvent.split("\n")) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data:")) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === "[DONE]") continue
        let evt: Record<string, unknown>
        try {
          evt = JSON.parse(payload)
        } catch {
          continue
        }
        const err = evt.error as { message?: string } | undefined
        if (err) throw new Error(`Audio provider error: ${err.message ?? "unknown"}`)
        collectAudioChunks(evt, (b64) => chunks.push(Buffer.from(b64, "base64")))
        const usage = evt.usage as { cost?: number; total_cost?: number } | undefined
        const cost = usage?.cost ?? usage?.total_cost
        if (typeof cost === "number") totalCost = cost
      }
    }
  }

  if (chunks.length === 0) {
    throw new Error("No audio returned by the provider")
  }

  const wav = pcmToWav(Buffer.concat(chunks))
  const costCents = typeof totalCost === "number" ? Math.max(1, Math.round(totalCost * 100)) : 0
  return { bytes: new Uint8Array(wav), mimeType: "audio/wav", costCents }
}

/**
 * Full mobile audio job lifecycle (create → run → generate → store → finalize),
 * mirroring the shared image path but with the mobile-only generator above.
 */
export async function createMobileAudioJob(input: {
  userId: string
  organizationId: string
  modelId: string
  prompt: string
  parameters: Record<string, unknown>
  referenceAssetIds: string[]
}) {
  const model = await prisma.llmModel.findUnique({ where: { id: input.modelId } })
  if (!model) throw new Error(`Model not found: ${input.modelId}`)
  if (!model.isActive) throw new Error(`Model is inactive: ${input.modelId}`)

  const job = await createMediaJobRow({
    organizationId: input.organizationId,
    userId: input.userId,
    modality: "AUDIO",
    modelId: input.modelId,
    prompt: input.prompt,
    parameters: input.parameters,
    referenceAssetIds: input.referenceAssetIds,
    estimatedCostCents: 0,
  })

  try {
    await setJobRunning(job.id)

    const voice =
      typeof input.parameters.voice === "string" ? input.parameters.voice : "alloy"
    const { bytes, mimeType, costCents } = await generateMobileAudio({
      modelId: input.modelId,
      prompt: input.prompt,
      voice,
    })

    const assetId = `${job.id}_0`
    const extension = mimeType.split("/")[1] ?? "wav"
    const upload = await uploadMediaBytes({
      organizationId: input.organizationId,
      modality: "AUDIO",
      assetId,
      mimeType,
      extension,
      bytes,
    })

    return await finalizeMediaJobAsSucceeded({
      jobId: job.id,
      costCents,
      assets: [
        {
          modality: "AUDIO",
          mimeType,
          s3Key: upload.s3Key,
          sizeBytes: upload.sizeBytes,
          metadata: { modelId: input.modelId },
        },
      ],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[Mobile Media] audio job ${job.id} failed:`, error)
    await failMediaJob(job.id, message)
    throw error
  }
}
