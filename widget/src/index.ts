import { WidgetAPI } from "./api"
import { generateStyles } from "./styles"
import { chatIcon, closeIcon, sendIcon, headphonesIcon, userIcon, agentIcon, botIcon } from "./icons"
import type { WidgetPublicConfig, WidgetConfig, Message, WidgetState } from "./types"

class RantAIWidgetInstance {
  private static STORAGE_KEY_VISITOR = "rantai_visitor_id"
  private static STORAGE_KEY_THREAD = "rantai_thread_id"
  private static STORAGE_KEY_MESSAGES = "rantai_messages"
  private static MAX_PERSISTED_MESSAGES = 50

  private api: WidgetAPI
  private config: WidgetPublicConfig | null = null
  private container: HTMLDivElement | null = null
  private chatWindow: HTMLDivElement | null = null
  private messagesContainer: HTMLDivElement | null = null
  private input: HTMLTextAreaElement | null = null
  private sendButton: HTMLButtonElement | null = null
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private lastPollTimestamp: string | null = null
  private state: WidgetState = {
    isOpen: false,
    isLoading: false,
    messages: [],
    error: null,
    handoffState: "idle",
    conversationId: null,
    visitorId: "",
    threadId: "",
  }

  constructor(apiKey: string, baseUrl: string) {
    this.api = new WidgetAPI(apiKey, baseUrl)
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 8)}`
  }

  private loadOrCreateVisitorId(): string {
    try {
      const stored = localStorage.getItem(RantAIWidgetInstance.STORAGE_KEY_VISITOR)
      if (stored) return stored
      const id = this.generateId("vis")
      localStorage.setItem(RantAIWidgetInstance.STORAGE_KEY_VISITOR, id)
      return id
    } catch {
      return this.generateId("vis")
    }
  }

  private loadOrCreateThreadId(): string {
    try {
      const stored = localStorage.getItem(RantAIWidgetInstance.STORAGE_KEY_THREAD)
      if (stored) return stored
      const id = this.generateId("thread")
      localStorage.setItem(RantAIWidgetInstance.STORAGE_KEY_THREAD, id)
      return id
    } catch {
      return this.generateId("thread")
    }
  }

  private resetThreadId(): string {
    const id = this.generateId("thread")
    try {
      localStorage.setItem(RantAIWidgetInstance.STORAGE_KEY_THREAD, id)
    } catch { /* ignore if localStorage blocked */ }
    return id
  }

  private persistMessages(): void {
    try {
      const slim = this.state.messages
        .slice(-RantAIWidgetInstance.MAX_PERSISTED_MESSAGES)
        .map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: m.timestamp }))
      localStorage.setItem(RantAIWidgetInstance.STORAGE_KEY_MESSAGES, JSON.stringify(slim))
    } catch { /* localStorage full or blocked */ }
  }

  private loadPersistedMessages(): boolean {
    try {
      const stored = localStorage.getItem(RantAIWidgetInstance.STORAGE_KEY_MESSAGES)
      if (!stored) return false
      const messages = JSON.parse(stored) as Message[]
      if (!messages.length) return false
      for (const msg of messages) {
        msg.timestamp = new Date(msg.timestamp)
        this.state.messages.push(msg)
        this.renderMessage(msg)
      }
      this.scrollToBottom()
      return true
    } catch { return false }
  }

  async init(): Promise<void> {
    try {
      // Load or create persistent identity
      this.state.visitorId = this.loadOrCreateVisitorId()
      this.state.threadId = this.loadOrCreateThreadId()

      // Load config
      this.config = await this.api.getConfig()

      // Inject styles
      this.injectStyles()

      // Create UI
      this.createUI()

      // Load persisted messages OR show welcome message
      const hasPersistedMessages = this.loadPersistedMessages()
      if (!hasPersistedMessages) {
        this.addMessage("assistant", this.config.config.welcomeMessage)
      }

      console.log(`[RantAI Widget] Initialized (visitor: ${this.state.visitorId}, thread: ${this.state.threadId})`)
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

  private addMessage(role: "user" | "assistant" | "agent", content: string, id?: string): Message {
    const message: Message = {
      id: id || `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role,
      content,
      timestamp: new Date(),
    }

    this.state.messages.push(message)
    this.renderMessage(message)
    this.scrollToBottom()
    this.persistMessages()

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

    // Build avatar HTML based on role
    let avatarHtml = ""
    if (message.role === "assistant") {
      const avatar = this.config?.config.avatar || this.config?.assistantEmoji || ""
      const isValidUrl = avatar.startsWith("http://") || avatar.startsWith("https://")
      const avatarContent = isValidUrl
        ? `<img src="${avatar}" alt="" style="width: 100%; height: 100%; border-radius: 50%;">`
        : avatar
          ? `<span class="rantai-msg-avatar-emoji">${this.escapeHtml(avatar)}</span>`
          : botIcon
      avatarHtml = `<div class="rantai-msg-avatar rantai-msg-avatar-assistant">${avatarContent}</div>`
    } else if (message.role === "agent") {
      avatarHtml = `<div class="rantai-msg-avatar rantai-msg-avatar-agent">${agentIcon}</div>`
    } else if (message.role === "user") {
      avatarHtml = `<div class="rantai-msg-avatar rantai-msg-avatar-user">${userIcon}</div>`
    }

    const labelHtml =
      message.role === "agent"
        ? '<div class="rantai-agent-label">Agent</div>'
        : ""
    div.innerHTML = `${avatarHtml}<div class="rantai-msg-content">${labelHtml}<div class="rantai-message-bubble">${bubbleContent}</div></div>`
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

    // If in live chat mode, send via handoff API
    if (
      this.state.handoffState === "connected" &&
      this.state.conversationId
    ) {
      this.addMessage("user", content)
      try {
        await this.api.sendHandoffMessage(this.state.conversationId, content)
      } catch (error) {
        console.error("[RantAI Widget] Handoff message error:", error)
        this.showError("Failed to send message to agent")
      }
      return
    }

    // Normal AI chat flow
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
      await this.api.sendMessage(
        this.state.messages.slice(0, -1),
        (chunk) => {
          assistantMessage.content = chunk
          // Strip handoff marker from display during streaming
          const display = chunk.replace(/\[AGENT_HANDOFF\]/g, "").trim()
          this.updateMessage(assistantMessage.id, display)
          this.scrollToBottom()
        },
        this.state.visitorId,
        this.state.threadId
      )

      // After streaming completes, check for handoff marker
      const raw = assistantMessage.content
      if (raw.includes("[AGENT_HANDOFF]")) {
        // Clean the marker from stored content
        assistantMessage.content = raw.replace(/\[AGENT_HANDOFF\]/g, "").trim()
        this.updateMessage(assistantMessage.id, assistantMessage.content)

        // Show handoff button if live chat is enabled
        if (this.config?.liveChatEnabled) {
          this.showHandoffButton()
        }
      }
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
      this.persistMessages()
    }
  }

  private showHandoffButton(): void {
    if (!this.messagesContainer) return

    const btn = document.createElement("button")
    btn.className = "rantai-handoff-btn"
    btn.innerHTML = `${headphonesIcon} Connect with Agent`
    btn.addEventListener("click", () => {
      btn.remove()
      this.requestHandoff()
    })
    this.messagesContainer.appendChild(btn)
    this.scrollToBottom()
  }

  private async requestHandoff(): Promise<void> {
    if (!this.messagesContainer) return

    this.state.handoffState = "requesting"

    // Show waiting indicator
    const waitingDiv = document.createElement("div")
    waitingDiv.className = "rantai-waiting-indicator"
    waitingDiv.id = "rantai-waiting"
    waitingDiv.innerHTML = '<div class="rantai-waiting-dot"></div> Waiting for an agent...'
    this.messagesContainer.appendChild(waitingDiv)
    this.scrollToBottom()

    try {
      const chatHistory = this.state.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }))

      const result = await this.api.requestHandoff({ chatHistory, visitorId: this.state.visitorId })
      this.state.conversationId = result.conversationId
      this.state.handoffState = "waiting"

      // Start polling
      this.startPolling()
    } catch (error) {
      console.error("[RantAI Widget] Handoff request error:", error)
      this.state.handoffState = "idle"
      const w = document.getElementById("rantai-waiting")
      if (w) w.remove()
      this.showError("Failed to connect with an agent. Please try again.")
    }
  }

  private startPolling(): void {
    if (this.pollInterval) return

    this.lastPollTimestamp = null

    this.pollInterval = setInterval(async () => {
      if (!this.state.conversationId) return

      try {
        const result = await this.api.pollHandoff(
          this.state.conversationId,
          this.lastPollTimestamp || undefined
        )

        // Handle status transitions
        if (
          result.status === "AGENT_CONNECTED" &&
          this.state.handoffState !== "connected"
        ) {
          this.state.handoffState = "connected"

          // Remove waiting indicator
          const w = document.getElementById("rantai-waiting")
          if (w) w.remove()

          // Show agent joined banner
          this.showBanner(
            `${result.agentName || "An agent"} joined the chat`
          )
        }

        if (result.status === "RESOLVED" && this.state.handoffState !== "resolved") {
          this.state.handoffState = "resolved"
          this.stopPolling()
          this.showBanner("Conversation resolved", true)

          // Reset widget state after a short delay so user sees the banner,
          // then gets a fresh chat session for the next conversation
          setTimeout(() => this.resetToFreshChat(), 3000)
        }

        // Render new messages
        for (const msg of result.messages) {
          // Avoid duplicates
          if (this.state.messages.some((m) => m.id === msg.id)) continue
          // Skip system messages
          if (msg.role === "system") continue

          if (msg.role === "agent") {
            this.addMessage("agent", msg.content, msg.id)
          }
        }

        // Update poll timestamp
        if (result.messages.length > 0) {
          this.lastPollTimestamp =
            result.messages[result.messages.length - 1].timestamp
        }
      } catch (error) {
        console.error("[RantAI Widget] Poll error:", error)
      }
    }, 3000)
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }

  private resetToFreshChat(): void {
    // Clear all state for a fresh session
    this.state.messages = []
    this.state.handoffState = "idle"
    this.state.conversationId = null
    this.state.isLoading = false
    this.state.error = null
    this.state.threadId = this.resetThreadId()
    this.lastPollTimestamp = null
    try { localStorage.removeItem(RantAIWidgetInstance.STORAGE_KEY_MESSAGES) } catch {}

    // Clear DOM messages and re-add welcome message
    if (this.messagesContainer) {
      this.messagesContainer.innerHTML = ""
    }
    if (this.config) {
      this.addMessage("assistant", this.config.config.welcomeMessage)
    }
  }

  private showBanner(text: string, resolved?: boolean): void {
    if (!this.messagesContainer) return

    const div = document.createElement("div")
    div.className = `rantai-agent-banner${resolved ? " resolved" : ""}`
    div.textContent = text
    this.messagesContainer.appendChild(div)
    this.scrollToBottom()
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
