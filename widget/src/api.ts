import type { WidgetPublicConfig, Message } from "./types"

export class WidgetAPI {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl
  }

  async getConfig(): Promise<WidgetPublicConfig> {
    const response = await fetch(
      `${this.baseUrl}/api/widget/config?key=${encodeURIComponent(this.apiKey)}`
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Failed to load config" }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    return response.json()
  }

  async sendMessage(
    messages: Message[],
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/widget/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Widget-Api-Key": this.apiKey,
      },
      body: JSON.stringify({
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Failed to send message" }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    // Handle streaming response
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error("No response body")
    }

    const decoder = new TextDecoder()
    let fullContent = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      fullContent += chunk
      onChunk(fullContent)
    }

    return fullContent
  }

  async uploadFile(file: File): Promise<{ base64?: string; content?: string }> {
    const formData = new FormData()
    formData.append("file", file)

    const response = await fetch(`${this.baseUrl}/api/widget/upload`, {
      method: "POST",
      headers: {
        "X-Widget-Api-Key": this.apiKey,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Upload failed" }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    return response.json()
  }
}
