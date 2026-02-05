import { WidgetAPI } from "./api"
import { generateStyles } from "./styles"
import { chatIcon, closeIcon, sendIcon } from "./icons"
import type { WidgetPublicConfig, WidgetConfig, Message, WidgetState } from "./types"

class RantAIWidgetInstance {
  private api: WidgetAPI
  private config: WidgetPublicConfig | null = null
  private container: HTMLDivElement | null = null
  private chatWindow: HTMLDivElement | null = null
  private messagesContainer: HTMLDivElement | null = null
  private input: HTMLTextAreaElement | null = null
  private sendButton: HTMLButtonElement | null = null
  private state: WidgetState = {
    isOpen: false,
    isLoading: false,
    messages: [],
    error: null,
  }

  constructor(apiKey: string, baseUrl: string) {
    this.api = new WidgetAPI(apiKey, baseUrl)
  }

  async init(): Promise<void> {
    try {
      // Load config
      this.config = await this.api.getConfig()

      // Inject styles
      this.injectStyles()

      // Create UI
      this.createUI()

      // Add welcome message
      this.addMessage("assistant", this.config.config.welcomeMessage)

      console.log("[RantAI Widget] Initialized successfully")
    } catch (error) {
      console.error("[RantAI Widget] Failed to initialize:", error)
      throw error
    }
  }

  private injectStyles(): void {
    if (!this.config) return

    const styleId = "rantai-widget-styles"
    if (document.getElementById(styleId)) return

    const style = document.createElement("style")
    style.id = styleId
    style.textContent = generateStyles(this.config.config)
    document.head.appendChild(style)
  }

  private createUI(): void {
    if (!this.config) return

    // Create container
    this.container = document.createElement("div")
    this.container.id = "rantai-widget"
    this.container.className = `rantai-widget-container ${this.config.config.customCssClass || ""}`

    // Create launcher button
    const launcher = document.createElement("button")
    launcher.className = "rantai-launcher"
    launcher.setAttribute("aria-label", "Open chat")
    launcher.innerHTML = chatIcon
    launcher.onclick = () => this.toggle()

    // Create chat window
    this.chatWindow = document.createElement("div")
    this.chatWindow.className = "rantai-chat-window"
    this.chatWindow.innerHTML = this.createChatWindowHTML()

    this.container.appendChild(launcher)
    this.container.appendChild(this.chatWindow)
    document.body.appendChild(this.container)

    // Get references
    this.messagesContainer = this.chatWindow.querySelector(".rantai-messages")
    this.input = this.chatWindow.querySelector(".rantai-input")
    this.sendButton = this.chatWindow.querySelector(".rantai-send-btn")

    // Bind events
    this.bindEvents()
  }

  private createChatWindowHTML(): string {
    if (!this.config) return ""

    const { config, assistantName, assistantEmoji } = this.config
    const avatar = config.avatar || assistantEmoji

    // Escape HTML to prevent XSS
    const escapeAttr = (str: string) => str.replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c] || c))

    const safeTitle = this.escapeHtml(config.headerTitle || assistantName)
    const safePlaceholder = escapeAttr(config.placeholderText)

    // Validate avatar URL - only allow http(s) URLs
    const isValidUrl = avatar.startsWith("http://") || avatar.startsWith("https://")
    const avatarContent = isValidUrl
      ? `<img src="${escapeAttr(avatar)}" alt="" style="width: 100%; height: 100%; border-radius: 50%;">`
      : this.escapeHtml(avatar)

    return `
      <div class="rantai-header">
        <div class="rantai-header-info">
          <div class="rantai-header-avatar">${avatarContent}</div>
          <div>
            <div class="rantai-header-title">${safeTitle}</div>
            <div class="rantai-header-subtitle">Online</div>
          </div>
        </div>
        <button class="rantai-close" aria-label="Close chat">${closeIcon}</button>
      </div>

      <div class="rantai-messages"></div>

      <div class="rantai-input-area">
        <form class="rantai-input-form">
          <div class="rantai-input-wrapper">
            <textarea
              class="rantai-input"
              placeholder="${safePlaceholder}"
              rows="1"
              aria-label="Message input"
            ></textarea>
          </div>
          <button type="submit" class="rantai-send-btn" aria-label="Send message">
            ${sendIcon}
          </button>
        </form>
      </div>

      <div class="rantai-powered">
        Powered by <a href="https://rantai.dev" target="_blank" rel="noopener">RantAI</a>
      </div>
    `
  }

  private bindEvents(): void {
    if (!this.chatWindow || !this.input) return

    // Close button
    const closeBtn = this.chatWindow.querySelector(".rantai-close")
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.close())
    }

    // Form submit
    const form = this.chatWindow.querySelector(".rantai-input-form")
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault()
        this.sendMessage()
      })
    }

    // Input auto-resize and enter handling
    this.input.addEventListener("input", () => {
      if (!this.input) return
      this.input.style.height = "auto"
      this.input.style.height = Math.min(this.input.scrollHeight, 120) + "px"
    })

    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        this.sendMessage()
      }
    })
  }

  private toggle(): void {
    if (this.state.isOpen) {
      this.close()
    } else {
      this.open()
    }
  }

  open(): void {
    this.state.isOpen = true
    this.container?.classList.add("rantai-chat-open")
    this.chatWindow?.classList.add("open")
    this.input?.focus()
  }

  close(): void {
    this.state.isOpen = false
    this.container?.classList.remove("rantai-chat-open")
    this.chatWindow?.classList.remove("open")
  }

  private addMessage(role: "user" | "assistant", content: string): Message {
    const message: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role,
      content,
      timestamp: new Date(),
    }

    this.state.messages.push(message)
    this.renderMessage(message)
    this.scrollToBottom()

    return message
  }

  private renderMessage(
    message: Message,
    options?: { isThinking?: boolean }
  ): void {
    if (!this.messagesContainer) return

    const div = document.createElement("div")
    div.className = `rantai-message ${message.role}`
    div.id = message.id

    const isThinking =
      options?.isThinking &&
      message.role === "assistant" &&
      !message.content.trim()
    const bubbleContent = isThinking
      ? '<div class="rantai-typing"><span></span><span></span><span></span></div>'
      : this.formatMessageContent(message.content)

    div.innerHTML = `<div class="rantai-message-bubble">${bubbleContent}</div>`
    this.messagesContainer.appendChild(div)
  }

  private updateMessage(messageId: string, content: string): void {
    const div = document.getElementById(messageId)
    if (!div) return

    const bubble = div.querySelector(".rantai-message-bubble")
    if (bubble) {
      bubble.innerHTML = this.formatMessageContent(content)
    }
  }

  private showError(message: string): void {
    if (!this.messagesContainer) return

    const existing = this.messagesContainer.querySelector(".rantai-error")
    if (existing) existing.remove()

    const div = document.createElement("div")
    div.className = "rantai-error"
    const text = document.createElement("span")
    text.className = "rantai-error-text"
    text.textContent = message
    div.appendChild(text)
    const btn = document.createElement("button")
    btn.type = "button"
    btn.className = "rantai-error-retry"
    btn.textContent = "Try again"
    btn.addEventListener("click", () => {
      div.remove()
      this.input?.focus()
    })
    div.appendChild(btn)
    this.messagesContainer.appendChild(div)
    this.scrollToBottom()
    setTimeout(() => div.remove(), 8000)
  }

  private scrollToBottom(): void {
    if (!this.messagesContainer) return
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight
  }

  private async sendMessage(): Promise<void> {
    if (!this.input || this.state.isLoading) return

    const content = this.input.value.trim()
    if (!content) return

    // Clear input
    this.input.value = ""
    this.input.style.height = "auto"

    // Add user message
    this.addMessage("user", content)

    this.state.isLoading = true
    if (this.sendButton) this.sendButton.disabled = true
    if (this.input) this.input.disabled = true

    const assistantMessage: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    }
    this.state.messages.push(assistantMessage)
    this.renderMessage(assistantMessage, { isThinking: true })

    try {
      await this.api.sendMessage(this.state.messages.slice(0, -1), (content) => {
        assistantMessage.content = content
        this.updateMessage(assistantMessage.id, content)
        this.scrollToBottom()
      })
    } catch (error) {
      console.error("[RantAI Widget] Send message error:", error)
      this.state.messages.pop()
      const failedEl = document.getElementById(assistantMessage.id)
      if (failedEl) failedEl.remove()
      this.showError(
        error instanceof Error ? error.message : "Failed to send message"
      )
    } finally {
      this.state.isLoading = false
      if (this.sendButton) this.sendButton.disabled = false
      if (this.input) this.input.disabled = false
      this.updateMessage(assistantMessage.id, assistantMessage.content)
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
  }

  /** Allow only http(s) URLs and escape for use in href to prevent XSS. */
  private safeLinkHref(url: string): string {
    const t = url.trim()
    if (!t.startsWith("http://") && !t.startsWith("https://")) return "#"
    return t.replace(/"/g, "&quot;")
  }

  /**
   * Format markdown for display: code blocks, inline code, bold, italic, links,
   * lists, blockquotes, headings. Escapes HTML and sanitizes link URLs.
   */
  private formatMessageContent(content: string): string {
    if (!content) return ""

    const blocks: string[] = []
    const place = (html: string) => {
      const i = blocks.length
      blocks.push(html)
      return `\x00B${i}\x00`
    }

    // 1) Extract code blocks and inline code (avoid parsing inside them)
    let s = content.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      return place(`<pre><code class="language-${lang || "text"}">${this.escapeHtml(code.trim())}</code></pre>`)
    })
    s = s.replace(/`([^`]+?)`/g, (_, code) => place(`<code>${this.escapeHtml(code)}</code>`))

    // 2) Escape then apply inline/line-based markdown
    s = this.escapeHtml(s)

    const lineRules: [RegExp, string][] = [
      [/^### (.+)$/gm, "<h3>$1</h3>"],
      [/^## (.+)$/gm, "<h2>$1</h2>"],
      [/^# (.+)$/gm, "<h1>$1</h1>"],
      [/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>"],
      [/^[*-] (.+)$/gm, "\x00L$1\x00"],
      [/^\d+\. (.+)$/gm, "\x00L$1\x00"],
    ]
    for (const [re, repl] of lineRules) s = s.replace(re, repl)

    // Wrap consecutive \x00L...\x00 lines in <ul><li>...</li></ul>
    s = s.replace(/(\x00L[^\x00]+\x00(?:\n?))+/g, (chunk) => {
      const items = chunk.split(/\x00L|\x00/).filter(Boolean).map((t) => t.trim()).filter(Boolean)
      return `<ul>${items.map((t) => `<li>${t}</li>`).join("")}</ul>`
    })

    // Inline: bold, italic, links (safe href)
    s = s.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
    s = s.replace(/__([^_]+?)__/g, "<strong>$1</strong>")
    s = s.replace(/\*([^*\n]+?)\*/g, "<em>$1</em>")
    s = s.replace(/_([^_\n]+?)_/g, "<em>$1</em>")
    s = s.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, (_, text, url) => {
      const href = this.safeLinkHref(url)
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`
    })

    s = s.replace(/\n/g, "<br/>")

    // 3) Restore placeholders
    return s.replace(/\x00B(\d+)\x00/g, (_, i) => blocks[parseInt(i, 10)] ?? "")
  }
}

// Global initialization
let widgetInstance: RantAIWidgetInstance | null = null

function initWidget(): void {
  // Prevent multiple initializations
  if (widgetInstance) {
    console.warn("[RantAI Widget] Already initialized")
    return
  }

  // Find script tag and extract API key
  const scripts = document.getElementsByTagName("script")
  let apiKey: string | null = null
  let baseUrl = ""

  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i]
    if (script.src.includes("rantai-widget")) {
      apiKey = script.getAttribute("data-api-key")
      // Extract base URL from script src
      const url = new URL(script.src)
      baseUrl = url.origin
      break
    }
  }

  if (!apiKey) {
    console.error("[RantAI Widget] Missing data-api-key attribute")
    return
  }

  // Create and initialize widget
  widgetInstance = new RantAIWidgetInstance(apiKey, baseUrl)
  widgetInstance.init().catch((error) => {
    console.error("[RantAI Widget] Initialization failed:", error)
  })
}

// Auto-initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWidget)
} else {
  initWidget()
}

// Export for manual control
export { initWidget, RantAIWidgetInstance }
