import type {
  GenerateImageInput,
  GenerateImageResult,
  GeneratedImage,
  GenerateAudioInput,
  GenerateAudioResult,
} from "./openrouter"

// Direct MiniMax image-generation provider (white-labeled as "RantAI Canvas").
// Synchronous text-to-image via POST /v1/image_generation. The model id passed
// in is the upstream id (e.g. "image-01"), already resolved from the house id.
const MINIMAX_BASE =
  process.env.MINIMAX_BASE_URL?.replace(/\/+$/, "") || "https://api.minimax.io/v1"

// MiniMax image-01 takes an aspect_ratio rather than width/height.
const SUPPORTED_ASPECTS = ["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"]

function pickAspectRatio(params: Record<string, unknown>): string {
  if (
    typeof params.aspectRatio === "string" &&
    SUPPORTED_ASPECTS.includes(params.aspectRatio)
  ) {
    return params.aspectRatio
  }
  const w = typeof params.width === "number" ? params.width : 0
  const h = typeof params.height === "number" ? params.height : 0
  if (w > 0 && h > 0) {
    const target = w / h
    let best = "1:1"
    let bestDiff = Infinity
    for (const a of SUPPORTED_ASPECTS) {
      const [aw, ah] = a.split(":").map(Number)
      const diff = Math.abs(aw / ah - target)
      if (diff < bestDiff) {
        bestDiff = diff
        best = a
      }
    }
    return best
  }
  return "1:1"
}

function sniffMime(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg"
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png"
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return "image/webp" // RIFF
  return "image/png"
}

export async function generateImage(
  input: GenerateImageInput
): Promise<GenerateImageResult> {
  const rawCount =
    typeof input.parameters.count === "number" ? input.parameters.count : 1
  const n = Math.min(Math.max(rawCount, 1), 9)

  const response = await fetch(`${MINIMAX_BASE}/image_generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.modelId, // upstream id, e.g. "image-01"
      prompt: input.prompt,
      aspect_ratio: pickAspectRatio(input.parameters),
      response_format: "base64",
      n,
      prompt_optimizer: true,
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => "")
    throw new Error(
      `Image generation failed: ${response.status} ${response.statusText}${
        errText ? " — " + errText.slice(0, 300) : ""
      }`
    )
  }

  const json = (await response.json()) as {
    data?: { image_base64?: string[]; image_urls?: string[] }
    base_resp?: { status_code?: number; status_msg?: string }
  }

  // MiniMax returns base_resp.status_code !== 0 on errors even with HTTP 200.
  if (
    json.base_resp &&
    typeof json.base_resp.status_code === "number" &&
    json.base_resp.status_code !== 0
  ) {
    throw new Error(
      `Image generation error ${json.base_resp.status_code}: ${
        json.base_resp.status_msg ?? "unknown"
      }`
    )
  }

  const images: GeneratedImage[] = []
  for (const b64 of json.data?.image_base64 ?? []) {
    const bytes = Uint8Array.from(Buffer.from(b64, "base64"))
    images.push({ bytes, mimeType: sniffMime(bytes) })
  }
  // Fallback: some configs return URLs instead of base64.
  if (images.length === 0 && json.data?.image_urls?.length) {
    for (const url of json.data.image_urls) {
      const r = await fetch(url)
      if (r.ok) {
        const bytes = new Uint8Array(await r.arrayBuffer())
        images.push({ bytes, mimeType: sniffMime(bytes) })
      }
    }
  }

  if (images.length === 0) {
    throw new Error(
      `No images returned — response: ${JSON.stringify(json).slice(0, 500)}`
    )
  }

  return { images, rawResponse: json }
}

// ── Text-to-speech (T2A v2) ──────────────────────────────────────────────────
const AUDIO_FORMAT_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  pcm: "audio/pcm",
}
const DEFAULT_VOICE_ID = "English_Insightful_Speaker"

export async function generateAudio(
  input: GenerateAudioInput
): Promise<GenerateAudioResult> {
  const p = input.parameters
  const format =
    typeof p.format === "string" && p.format in AUDIO_FORMAT_MIME ? p.format : "mp3"
  const voiceId =
    typeof p.voice === "string" && p.voice ? p.voice : DEFAULT_VOICE_ID
  const speed = typeof p.speed === "number" ? p.speed : 1.0

  // Some MiniMax deployments require a GroupId query param; include if configured.
  const groupId = process.env.MINIMAX_GROUP_ID
  const url = `${MINIMAX_BASE}/t2a_v2${
    groupId ? `?GroupId=${encodeURIComponent(groupId)}` : ""
  }`

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.modelId, // upstream id, e.g. "speech-2.6-turbo"
      text: input.prompt,
      stream: false,
      output_format: "hex",
      voice_setting: { voice_id: voiceId, speed, vol: 1, pitch: 0 },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format, channel: 1 },
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => "")
    throw new Error(
      `Audio generation failed: ${response.status} ${response.statusText}${
        errText ? " — " + errText.slice(0, 300) : ""
      }`
    )
  }

  const json = (await response.json()) as {
    data?: { audio?: string }
    extra_info?: { audio_length?: number; audio_format?: string }
    base_resp?: { status_code?: number; status_msg?: string }
  }

  if (
    json.base_resp &&
    typeof json.base_resp.status_code === "number" &&
    json.base_resp.status_code !== 0
  ) {
    throw new Error(
      `Audio generation error ${json.base_resp.status_code}: ${
        json.base_resp.status_msg ?? "unknown"
      }`
    )
  }

  const hex = json.data?.audio
  if (!hex) {
    throw new Error(
      `No audio returned — response: ${JSON.stringify(json).slice(0, 500)}`
    )
  }

  const bytes = Uint8Array.from(Buffer.from(hex, "hex"))
  const mimeType =
    AUDIO_FORMAT_MIME[json.extra_info?.audio_format ?? format] ?? "audio/mpeg"
  const durationMs =
    typeof json.extra_info?.audio_length === "number"
      ? json.extra_info.audio_length
      : undefined

  return { audio: { bytes, mimeType, durationMs }, rawResponse: json }
}
