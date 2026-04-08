const OPENROUTER_BASE = "https://openrouter.ai/api/v1"

export interface GeneratedImage {
  bytes: Uint8Array
  mimeType: string
  width?: number
  height?: number
}

export interface GenerateImageInput {
  apiKey: string
  modelId: string
  prompt: string
  parameters: Record<string, unknown>
  referenceImageUrls: string[]
}

export interface GenerateImageResult {
  images: GeneratedImage[]
  actualCostCents?: number
  rawResponse: unknown
}

export async function generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  const userContent: Array<Record<string, unknown>> =
    input.referenceImageUrls.length > 0
      ? [
          ...input.referenceImageUrls.map((url) => ({
            type: "image_url",
            image_url: { url },
          })),
          { type: "text", text: input.prompt },
        ]
      : [{ type: "text", text: input.prompt }]

  const extras: Record<string, unknown> = {}
  if (typeof input.parameters.width === "number") extras.image_width = input.parameters.width
  if (typeof input.parameters.height === "number") extras.image_height = input.parameters.height
  if (typeof input.parameters.count === "number") extras.n = input.parameters.count
  if (typeof input.parameters.seed === "number") extras.seed = input.parameters.seed

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://rantai.dev",
      "X-Title": "RantAI Agents Media Studio",
    },
    body: JSON.stringify({
      model: input.modelId,
      messages: [{ role: "user", content: userContent }],
      modalities: ["image", "text"],
      ...extras,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    let message = `${response.status} ${response.statusText}`
    try {
      const parsed = JSON.parse(errText)
      message = parsed?.error?.message ?? message
    } catch {
      message = errText || message
    }
    throw new Error(`OpenRouter image generation failed: ${message}`)
  }

  const json = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: Array<{
          type?: string
          image_url?: { url?: string }
          text?: string
        }>
      }
    }>
    usage?: { total_cost?: number }
  }

  const images: GeneratedImage[] = []
  const choices = json.choices ?? []
  for (const choice of choices) {
    const parts = choice.message?.content ?? []
    for (const part of parts) {
      if (part.type === "image_url" && part.image_url?.url) {
        const parsed = parseDataUrl(part.image_url.url)
        if (parsed) images.push(parsed)
      }
    }
  }

  if (images.length === 0) {
    throw new Error("OpenRouter returned no images")
  }

  const actualCostCents =
    typeof json.usage?.total_cost === "number"
      ? Math.max(1, Math.round(json.usage.total_cost * 100))
      : undefined

  return { images, actualCostCents, rawResponse: json }
}

function parseDataUrl(url: string): GeneratedImage | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  const mimeType = match[1] ?? "image/png"
  const b64 = match[2] ?? ""
  const bytes = Uint8Array.from(Buffer.from(b64, "base64"))
  return { bytes, mimeType }
}

export interface GeneratedAudio {
  bytes: Uint8Array
  mimeType: string
  durationMs?: number
}

export interface GenerateAudioInput {
  apiKey: string
  modelId: string
  prompt: string
  parameters: Record<string, unknown>
}

export interface GenerateAudioResult {
  audio: GeneratedAudio
  actualCostCents?: number
  rawResponse: unknown
}

export async function generateAudio(input: GenerateAudioInput): Promise<GenerateAudioResult> {

  const audioConfig: Record<string, unknown> = {}
  if (typeof input.parameters.voice === "string") audioConfig.voice = input.parameters.voice
  if (typeof input.parameters.format === "string") audioConfig.format = input.parameters.format

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://rantai.dev",
      "X-Title": "RantAI Agents Media Studio",
    },
    body: JSON.stringify({
      model: input.modelId,
      messages: [{ role: "user", content: input.prompt }],
      modalities: ["text", "audio"],
      audio: audioConfig,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`OpenRouter audio generation failed: ${errText}`)
  }

  const json = (await response.json()) as {
    choices?: Array<{
      message?: {
        audio?: { data?: string; format?: string }
      }
    }>
    usage?: { total_cost?: number }
  }

  const audioObj = json.choices?.[0]?.message?.audio
  if (!audioObj?.data) throw new Error("OpenRouter returned no audio")

  const format = audioObj.format ?? "mp3"
  const mimeType = `audio/${format === "mp3" ? "mpeg" : format}`
  const bytes = Uint8Array.from(Buffer.from(audioObj.data, "base64"))

  const actualCostCents =
    typeof json.usage?.total_cost === "number"
      ? Math.max(1, Math.round(json.usage.total_cost * 100))
      : undefined

  return {
    audio: { bytes, mimeType },
    actualCostCents,
    rawResponse: json,
  }
}

const VIDEO_BASE = `${OPENROUTER_BASE}/video/generations`

export interface SubmitVideoInput {
  apiKey: string
  modelId: string
  prompt: string
  parameters: Record<string, unknown>
}

export interface SubmitVideoResult {
  providerJobId: string
  status: "queued" | "running" | "succeeded" | "failed"
}

export async function submitVideoJob(input: SubmitVideoInput): Promise<SubmitVideoResult> {
  const response = await fetch(VIDEO_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://rantai.dev",
      "X-Title": "RantAI Agents Media Studio",
    },
    body: JSON.stringify({
      model: input.modelId,
      prompt: input.prompt,
      duration_seconds: input.parameters.durationSec,
      aspect_ratio: input.parameters.aspectRatio,
      resolution: input.parameters.resolution,
      seed: input.parameters.seed,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenRouter video submit failed: ${text}`)
  }

  const json = (await response.json()) as { id?: string; status?: string }
  if (!json.id) throw new Error("OpenRouter video submit returned no id")
  return {
    providerJobId: json.id,
    status: (json.status as SubmitVideoResult["status"]) ?? "queued",
  }
}

export interface PollVideoInput {
  apiKey: string
  providerJobId: string
}

export interface PollVideoResult {
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled"
  videoUrl?: string
  errorMessage?: string
  actualCostCents?: number
  rawResponse: unknown
}

export async function pollVideoJob(input: PollVideoInput): Promise<PollVideoResult> {
  const response = await fetch(`${VIDEO_BASE}/${input.providerJobId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.apiKey}` },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenRouter video poll failed: ${text}`)
  }

  const json = (await response.json()) as {
    status?: string
    output?: { video?: { url?: string } }
    error?: { message?: string }
    usage?: { total_cost?: number }
  }

  const status = (json.status as PollVideoResult["status"]) ?? "running"
  const videoUrl = json.output?.video?.url
  const errorMessage = json.error?.message

  const actualCostCents =
    typeof json.usage?.total_cost === "number"
      ? Math.max(1, Math.round(json.usage.total_cost * 100))
      : undefined

  return { status, videoUrl, errorMessage, actualCostCents, rawResponse: json }
}

export async function fetchVideoBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch video bytes: ${res.status}`)
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}
