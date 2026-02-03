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
    this.chatWindow?.classList.add("open")
    this.input?.focus()
  }

  close(): void {
    this.state.isOpen = false
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

  private renderMessage(message: Message): void {
    if (!this.messagesContainer) return

    const div = document.createElement("div")
    div.className = `rantai-message ${message.role}`
    div.id = message.id
    div.innerHTML = `
      <div class="rantai-message-bubble">${this.escapeHtml(message.content)}</div>
    `

    this.messagesContainer.appendChild(div)
  }

  private updateMessage(messageId: string, content: string): void {
    const div = document.getElementById(messageId)
    if (!div) return

    const bubble = div.querySelector(".rantai-message-bubble")
    if (bubble) {
      bubble.textContent = content
    }
  }

  private showTypingIndicator(): HTMLDivElement {
    if (!this.messagesContainer) return document.createElement("div")

    const div = document.createElement("div")
    div.className = "rantai-message assistant"
    div.id = "rantai-typing"
    div.innerHTML = `
      <div class="rantai-typing">
        <span></span><span></span><span></span>
      </div>
    `

    this.messagesContainer.appendChild(div)
    this.scrollToBottom()

    return div
  }

  private hideTypingIndicator(): void {
    const typing = document.getElementById("rantai-typing")
    if (typing) {
      typing.remove()
    }
  }

  private showError(message: string): void {
    if (!this.messagesContainer) return

    // Remove existing error
    const existing = this.messagesContainer.querySelector(".rantai-error")
    if (existing) existing.remove()

    const div = document.createElement("div")
    div.className = "rantai-error"
    div.textContent = message

    this.messagesContainer.appendChild(div)
    this.scrollToBottom()

    // Auto-remove after 5 seconds
    setTimeout(() => div.remove(), 5000)
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

    // Show typing indicator
    this.state.isLoading = true
    this.showTypingIndicator()

    try {
      // Create placeholder for assistant message
      const assistantMessage: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      }

      // Hide typing indicator and add empty message
      this.hideTypingIndicator()
      this.state.messages.push(assistantMessage)
      this.renderMessage(assistantMessage)

      // Stream response
      await this.api.sendMessage(this.state.messages.slice(0, -1), (content) => {
        assistantMessage.content = content
        this.updateMessage(assistantMessage.id, content)
        this.scrollToBottom()
      })
    } catch (error) {
      this.hideTypingIndicator()
      console.error("[RantAI Widget] Send message error:", error)
      this.showError(
        error instanceof Error ? error.message : "Failed to send message"
      )
    } finally {
      this.state.isLoading = false
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
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
