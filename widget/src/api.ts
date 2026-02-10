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

  async requestHandoff(data: {
    customerName?: string
    customerEmail?: string
    productInterest?: string
    chatHistory: Array<{ role: string; content: string }>
  }): Promise<{ conversationId: string; status: string; queuePosition: number }> {
    const response = await fetch(`${this.baseUrl}/api/widget/handoff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Widget-Api-Key": this.apiKey,
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Handoff request failed" }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    return response.json()
  }

  async pollHandoff(
    conversationId: string,
    after?: string
  ): Promise<{
    status: string
    agentName: string | null
    messages: Array<{ id: string; role: string; content: string; timestamp: string }>
  }> {
    const params = new URLSearchParams({ conversationId })
    if (after) params.set("after", after)

    const response = await fetch(
      `${this.baseUrl}/api/widget/handoff?${params.toString()}`,
      {
        headers: { "X-Widget-Api-Key": this.apiKey },
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Poll failed" }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    return response.json()
  }

  async sendHandoffMessage(
    conversationId: string,
    content: string
  ): Promise<{ messageId: string }> {
    const response = await fetch(`${this.baseUrl}/api/widget/handoff/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Widget-Api-Key": this.apiKey,
      },
      body: JSON.stringify({ conversationId, content }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Send failed" }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    return response.json()
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
