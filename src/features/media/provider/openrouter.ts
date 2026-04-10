const OPENROUTER_BASE = "https://openrouter.ai/api/v1"

// Detect safety-filter / content-policy rejections and return a user-actionable
// message. Returns null if the error is not a content-policy rejection.
function friendlyContentPolicyMessage(raw: string): string | null {
  if (
    /prohibited_content|safety|content.?policy|content.?filter|blocked.*(prompt|content)|responsible.?ai/i.test(
      raw
    )
  ) {
    return "Your prompt was blocked by the model's safety filter. Please rephrase it — avoid named people/artists, explicit themes, and copyrighted references, then try again."
  }
  return null
}

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
  // When no reference images are provided, send content as a plain string.
  // Gemini reasoning-image models (e.g. 3.1-flash-image-preview) interpret
  // array-wrapped single-text content as a conversation turn and respond
  // with reasoning text instead of generating an image.
  const userContent: string | Array<Record<string, unknown>> =
    input.referenceImageUrls.length > 0
      ? [
          ...input.referenceImageUrls.map((url) => ({
            type: "image_url",
            image_url: { url },
          })),
          { type: "text", text: input.prompt },
        ]
      : input.prompt

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
      messages: [
        {
          role: "system",
          content:
            "You are an image generation assistant. Generate a single high-quality image matching the user's description. Do not ask for clarification. Do not respond with text — only produce the image.",
        },
        { role: "user", content: userContent },
      ],
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
    const friendly = friendlyContentPolicyMessage(message)
    if (friendly) throw new Error(friendly)
    throw new Error(`OpenRouter image generation failed: ${message}`)
  }

  type ImagePart = {
    type?: string
    image_url?: { url?: string }
  }
  const json = (await response.json()) as {
    choices?: Array<{
      finish_reason?: string
      native_finish_reason?: string
      message?: {
        content?: string | Array<{ type?: string; image_url?: { url?: string }; text?: string }>
        // OpenRouter image-generating models (Gemini Nano Banana, GPT-5 Image) return
        // generated images here as a sibling of `content`.
        images?: ImagePart[]
      }
    }>
    usage?: { total_cost?: number }
    error?: { message?: string }
  }

  const images: GeneratedImage[] = []
  const choices = json.choices ?? []
  for (const choice of choices) {
    // Primary shape: message.images array
    for (const part of choice.message?.images ?? []) {
      if (part.image_url?.url) {
        const parsed = parseDataUrl(part.image_url.url)
        if (parsed) images.push(parsed)
      }
    }
    // Fallback: message.content as array of parts (some models)
    if (Array.isArray(choice.message?.content)) {
      for (const part of choice.message.content) {
        if (part.type === "image_url" && part.image_url?.url) {
          const parsed = parseDataUrl(part.image_url.url)
          if (parsed) images.push(parsed)
        }
      }
    }
  }

  if (images.length === 0) {
    // Content-policy signal #1: finish_reason flag on the choice itself.
    // Gemini returns finish_reason="content_filter" + native_finish_reason="PROHIBITED_CONTENT"
    // with a null message when it refuses a prompt.
    const firstChoice = json.choices?.[0]
    const finishReason = firstChoice?.finish_reason ?? ""
    const nativeFinish = firstChoice?.native_finish_reason ?? ""
    if (
      finishReason === "content_filter" ||
      /prohibited|safety|blocked/i.test(nativeFinish)
    ) {
      throw new Error(
        "Your prompt was blocked by the model's safety filter. Please rephrase it — avoid named people/artists, explicit themes, and copyrighted references, then try again."
      )
    }

    // Surface the provider's actual text reply when a reasoning-image model
    // refuses or stalls out. This is the most actionable signal for the user.
    const providerError = json.error?.message
    const textReply = (() => {
      const firstContent = firstChoice?.message?.content
      if (typeof firstContent === "string") return firstContent
      if (Array.isArray(firstContent)) {
        return firstContent
          .map((p) => (typeof p === "object" && p && "text" in p ? (p as { text?: string }).text : ""))
          .filter(Boolean)
          .join(" ")
      }
      return ""
    })()
    const friendly =
      (providerError && friendlyContentPolicyMessage(providerError)) ||
      (textReply && friendlyContentPolicyMessage(textReply))
    if (friendly) throw new Error(friendly)
    const detail = providerError
      ? `: ${providerError}`
      : textReply
      ? ` — model replied with text instead: "${textReply.slice(0, 300)}"`
      : ` — response: ${JSON.stringify(json).slice(0, 500)}`
    throw new Error(`OpenRouter returned no images${detail}`)
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
      Accept: "text/event-stream",
      "HTTP-Referer": "https://rantai.dev",
      "X-Title": "RantAI Agents Media Studio",
    },
    body: JSON.stringify({
      model: input.modelId,
      messages: [{ role: "user", content: input.prompt }],
      modalities: ["text", "audio"],
      audio: audioConfig,
      stream: true,
    }),
  })

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => "")
    throw new Error(`OpenRouter audio generation failed: ${errText}`)
  }

  // Parse SSE stream, accumulating audio chunks.
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let audioB64 = ""
  let format: string | undefined
  let totalCost: number | undefined
  const allEvents: unknown[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE events separated by \n\n; each line begins with "data: ".
    let idx: number
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      for (const line of rawEvent.split("\n")) {
        const trimmed = line.trim()
        if (!trimmed.startsWith("data:")) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === "[DONE]") continue
        try {
          const evt = JSON.parse(payload) as Record<string, unknown> & {
            error?: { code?: number; message?: string; metadata?: unknown }
          }
          allEvents.push(evt)
          if (evt.error) {
            const code = evt.error.code ?? "error"
            const msg = evt.error.message ?? "unknown provider error"
            const friendly = friendlyContentPolicyMessage(msg)
            if (friendly) throw new Error(friendly)
            throw new Error(`Audio provider error [${code}]: ${msg}`)
          }
          // Deep-walk the event for any audio payload. Providers put it in
          // different places: delta.audio.data, message.audio.data,
          // delta.content[].audio.data, delta.content[].input_audio.data, etc.
          walkForAudio(evt, (data, fmt) => {
            audioB64 += data
            if (fmt) format = fmt
          })
          const usage = (evt as { usage?: { total_cost?: number } }).usage
          if (typeof usage?.total_cost === "number") totalCost = usage.total_cost
        } catch (err) {
          // Re-throw real provider errors; swallow JSON parse errors only.
          if (
            err instanceof Error &&
            (err.message.startsWith("Audio provider error") ||
              err.message.startsWith("Your prompt was blocked by"))
          ) {
            reader.cancel().catch(() => {})
            throw err
          }
          // ignore malformed chunks
        }
      }
    }
  }

  if (!audioB64) {
    console.error(
      "[openrouter] audio stream had no audio payload. Sample events:",
      JSON.stringify(allEvents.slice(0, 3), null, 2)
    )
    throw new Error("OpenRouter returned no audio")
  }

  const fmt = format ?? "mp3"
  const mimeType = `audio/${fmt === "mp3" ? "mpeg" : fmt}`
  const bytes = Uint8Array.from(Buffer.from(audioB64, "base64"))

  const actualCostCents =
    typeof totalCost === "number" ? Math.max(1, Math.round(totalCost * 100)) : undefined

  return {
    audio: { bytes, mimeType },
    actualCostCents,
    rawResponse: allEvents,
  }
}

// Recursively walks an SSE event looking for base64-encoded audio payloads.
// Invokes `emit` for every audio chunk found.
function walkForAudio(
  node: unknown,
  emit: (data: string, format?: string) => void,
  depth = 0
): void {
  if (depth > 8 || node == null) return
  if (Array.isArray(node)) {
    for (const item of node) walkForAudio(item, emit, depth + 1)
    return
  }
  if (typeof node !== "object") return
  const obj = node as Record<string, unknown>

  // Common shapes:
  //   { audio: { data, format } }
  //   { input_audio: { data, format } }
  //   { type: "audio", data, format }
  //   { type: "output_audio", audio: { data } }
  const audioField = obj.audio ?? obj.input_audio ?? obj.output_audio
  if (audioField && typeof audioField === "object") {
    const a = audioField as Record<string, unknown>
    if (typeof a.data === "string" && a.data.length > 0) {
      emit(a.data, typeof a.format === "string" ? a.format : undefined)
    }
  }
  if (
    (obj.type === "audio" || obj.type === "output_audio") &&
    typeof obj.data === "string"
  ) {
    emit(obj.data, typeof obj.format === "string" ? obj.format : undefined)
  }

  for (const key of Object.keys(obj)) {
    if (key === "audio" || key === "input_audio" || key === "output_audio") continue
    walkForAudio(obj[key], emit, depth + 1)
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
    const friendly = friendlyContentPolicyMessage(text)
    if (friendly) throw new Error(friendly)
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
  const rawErrorMessage = json.error?.message
  const errorMessage = rawErrorMessage
    ? friendlyContentPolicyMessage(rawErrorMessage) ?? rawErrorMessage
    : undefined

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

// ─── Synchronous video generation (chat completions path) ──────────
// Mirrors the image/audio flow: POST /chat/completions, walk the response
// for a video URL or base64 data, then fetch bytes if necessary.

export interface GeneratedVideo {
  bytes: Uint8Array
  mimeType: string
  width?: number
  height?: number
  durationMs?: number
}

export interface GenerateVideoInput {
  apiKey: string
  modelId: string
  prompt: string
  parameters: Record<string, unknown>
}

export interface GenerateVideoResult {
  video: GeneratedVideo
  actualCostCents?: number
  rawResponse: unknown
}

// OpenRouter Video Generation Alpha lives at a different base path than the
// standard /api/v1 endpoints.
const VIDEO_ALPHA_BASE = "https://openrouter.ai/api/alpha/videos"

// Max time we'll poll a single video job before giving up.
const VIDEO_POLL_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
const VIDEO_POLL_INTERVAL_MS = 10 * 1000 // 10s (docs recommend 30s but dev UX benefits from faster)

export async function generateVideo(
  input: GenerateVideoInput
): Promise<GenerateVideoResult> {
  // Build the submit body. Map our canonical parameter names to the alpha API.
  const body: Record<string, unknown> = {
    model: input.modelId,
    prompt: input.prompt,
  }
  if (typeof input.parameters.durationSec === "number")
    body.duration = input.parameters.durationSec
  if (typeof input.parameters.aspectRatio === "string")
    body.aspect_ratio = input.parameters.aspectRatio
  if (typeof input.parameters.resolution === "string")
    body.resolution = input.parameters.resolution
  if (typeof input.parameters.size === "string") body.size = input.parameters.size
  if (typeof input.parameters.seed === "number") body.seed = input.parameters.seed
  if (typeof input.parameters.generateAudio === "boolean")
    body.generate_audio = input.parameters.generateAudio
  if (Array.isArray(input.parameters.inputReferences))
    body.input_references = input.parameters.inputReferences

  // ── Step 1: submit ─────────────────────────────────────
  const submit = await fetch(VIDEO_ALPHA_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://rantai.dev",
      "X-Title": "RantAI Agents Media Studio",
    },
    body: JSON.stringify(body),
  })

  if (!submit.ok) {
    const errText = await submit.text()
    let message = `${submit.status} ${submit.statusText}`
    try {
      const parsed = JSON.parse(errText)
      message = parsed?.error?.message ?? parsed?.error ?? message
    } catch {
      message = errText || message
    }
    const friendly = friendlyContentPolicyMessage(message)
    if (friendly) throw new Error(friendly)
    throw new Error(`OpenRouter video submit failed: ${message}`)
  }

  const submitJson = (await submit.json()) as {
    id?: string
    polling_url?: string
    status?: string
    error?: string
  }
  if (!submitJson.id) {
    throw new Error(
      `OpenRouter video submit returned no job id: ${JSON.stringify(submitJson).slice(0, 400)}`
    )
  }

  const jobId = submitJson.id

  // ── Step 2: poll until completed / failed ─────────────
  const deadline = Date.now() + VIDEO_POLL_TIMEOUT_MS
  let poll: {
    id?: string
    status?: string
    unsigned_urls?: string[]
    usage?: { cost?: number }
    error?: string
    generation_id?: string
  } = submitJson
  let lastStatus = poll.status ?? "pending"

  while (
    lastStatus !== "completed" &&
    lastStatus !== "failed" &&
    lastStatus !== "cancelled" &&
    lastStatus !== "expired"
  ) {
    if (Date.now() > deadline) {
      throw new Error(
        `OpenRouter video generation timed out after ${VIDEO_POLL_TIMEOUT_MS / 1000}s (job ${jobId})`
      )
    }
    await new Promise((r) => setTimeout(r, VIDEO_POLL_INTERVAL_MS))
    const pollRes = await fetch(`${VIDEO_ALPHA_BASE}/${jobId}`, {
      headers: { Authorization: `Bearer ${input.apiKey}` },
    })
    if (!pollRes.ok) {
      const t = await pollRes.text().catch(() => "")
      throw new Error(`OpenRouter video poll failed: ${pollRes.status} ${t}`)
    }
    poll = await pollRes.json()
    lastStatus = poll.status ?? lastStatus
  }

  if (lastStatus !== "completed") {
    const rawErr = poll.error ?? `job ended with status: ${lastStatus}`
    const friendly = friendlyContentPolicyMessage(rawErr)
    if (friendly) throw new Error(friendly)
    throw new Error(`OpenRouter video generation ${lastStatus}: ${rawErr}`)
  }

  const firstUrl = poll.unsigned_urls?.[0]
  if (!firstUrl) {
    throw new Error(
      `OpenRouter video completed but no URL returned: ${JSON.stringify(poll).slice(0, 400)}`
    )
  }

  // ── Step 3: download the raw MP4 bytes (auth required) ──
  const download = await fetch(firstUrl, {
    headers: { Authorization: `Bearer ${input.apiKey}` },
  })
  if (!download.ok) {
    throw new Error(`Failed to download video bytes: ${download.status}`)
  }
  const mimeType = download.headers.get("content-type") ?? "video/mp4"
  const buf = await download.arrayBuffer()
  const bytes = new Uint8Array(buf)

  const actualCostCents =
    typeof poll.usage?.cost === "number"
      ? Math.max(1, Math.round(poll.usage.cost * 100))
      : undefined

  return {
    video: { bytes, mimeType },
    actualCostCents,
    rawResponse: poll,
  }
}

