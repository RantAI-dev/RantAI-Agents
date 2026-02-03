import type { WidgetConfig } from "./types"

/**
 * Validate and sanitize a color value to prevent CSS injection
 * Only allows hex colors (#fff, #ffffff), rgb(), rgba(), and named colors
 */
function sanitizeColor(color: string, fallback: string): string {
  if (!color || typeof color !== "string") return fallback

  // Hex colors: #fff or #ffffff
  if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color)) return color

  // rgb/rgba colors
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+))?\s*\)$/.test(color)) return color

  // Named colors (common ones)
  const namedColors = ["white", "black", "red", "green", "blue", "gray", "transparent"]
  if (namedColors.includes(color.toLowerCase())) return color

  // Invalid color, return fallback
  return fallback
}

export function generateStyles(config: WidgetConfig): string {
  const { theme, position } = config

  // Sanitize all theme colors
  const safeTheme = {
    primaryColor: sanitizeColor(theme.primaryColor, "#3b82f6"),
    backgroundColor: sanitizeColor(theme.backgroundColor, "#ffffff"),
    textColor: sanitizeColor(theme.textColor, "#1f2937"),
    userBubbleColor: sanitizeColor(theme.userBubbleColor, "#3b82f6"),
    assistantBubbleColor: sanitizeColor(theme.assistantBubbleColor, "#f3f4f6"),
  }

  // Position styles
  const positionStyles: Record<string, string> = {
    "bottom-right": "bottom: 20px; right: 20px;",
    "bottom-left": "bottom: 20px; left: 20px;",
    "top-right": "top: 20px; right: 20px;",
    "top-left": "top: 20px; left: 20px;",
  }

  const chatWindowPosition: Record<string, string> = {
    "bottom-right": "bottom: 80px; right: 0;",
    "bottom-left": "bottom: 80px; left: 0;",
    "top-right": "top: 80px; right: 0;",
    "top-left": "top: 80px; left: 0;",
  }

  return `
    .rantai-widget-container {
      position: fixed;
      z-index: 999999;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ${positionStyles[position]}
    }

    .rantai-launcher {
      width: 60px;
      height: 60px;
      border-radius: 30px;
      background: ${safeTheme.primaryColor};
      color: white;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .rantai-launcher:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }

    .rantai-launcher:active {
      transform: scale(0.95);
    }

    .rantai-launcher-icon {
      width: 28px;
      height: 28px;
    }

    .rantai-chat-window {
      display: none;
      flex-direction: column;
      width: 380px;
      height: 550px;
      max-height: calc(100vh - 120px);
      max-width: calc(100vw - 40px);
      background: ${safeTheme.backgroundColor};
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      overflow: hidden;
      position: absolute;
      ${chatWindowPosition[position]}
    }

    .rantai-chat-window.open {
      display: flex;
    }

    .rantai-header {
      background: ${safeTheme.primaryColor};
      color: white;
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }

    .rantai-header-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .rantai-header-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }

    .rantai-header-title {
      font-weight: 600;
      font-size: 16px;
    }

    .rantai-header-subtitle {
      font-size: 12px;
      opacity: 0.8;
    }

    .rantai-close {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      cursor: pointer;
      font-size: 20px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .rantai-close:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .rantai-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: ${safeTheme.backgroundColor};
    }

    .rantai-message {
      display: flex;
      gap: 8px;
      max-width: 85%;
      animation: rantai-fade-in 0.2s ease-out;
    }

    @keyframes rantai-fade-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .rantai-message.user {
      margin-left: auto;
      flex-direction: row-reverse;
    }

    .rantai-message-bubble {
      padding: 12px 16px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.5;
      word-wrap: break-word;
    }

    .rantai-message.assistant .rantai-message-bubble {
      background: ${safeTheme.assistantBubbleColor};
      color: ${safeTheme.textColor};
      border-bottom-left-radius: 4px;
    }

    .rantai-message.user .rantai-message-bubble {
      background: ${safeTheme.userBubbleColor};
      color: white;
      border-bottom-right-radius: 4px;
    }

    .rantai-typing {
      display: flex;
      gap: 4px;
      padding: 12px 16px;
      background: ${safeTheme.assistantBubbleColor};
      border-radius: 16px;
      border-bottom-left-radius: 4px;
      width: fit-content;
    }

    .rantai-typing span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${safeTheme.textColor};
      opacity: 0.4;
      animation: rantai-typing 1.4s infinite;
    }

    .rantai-typing span:nth-child(2) {
      animation-delay: 0.2s;
    }

    .rantai-typing span:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes rantai-typing {
      0%, 60%, 100% {
        transform: translateY(0);
        opacity: 0.4;
      }
      30% {
        transform: translateY(-8px);
        opacity: 1;
      }
    }

    .rantai-input-area {
      padding: 12px 16px;
      border-top: 1px solid #e5e7eb;
      background: ${safeTheme.backgroundColor};
      flex-shrink: 0;
    }

    .rantai-input-form {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    .rantai-input-wrapper {
      flex: 1;
      position: relative;
    }

    .rantai-input {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid #e5e7eb;
      border-radius: 24px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
      resize: none;
      max-height: 120px;
      font-family: inherit;
    }

    .rantai-input:focus {
      border-color: ${safeTheme.primaryColor};
      box-shadow: 0 0 0 3px ${safeTheme.primaryColor}20;
    }

    .rantai-input::placeholder {
      color: #9ca3af;
    }

    .rantai-send-btn {
      width: 44px;
      height: 44px;
      padding: 0;
      background: ${safeTheme.primaryColor};
      color: white;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s, transform 0.1s;
      flex-shrink: 0;
    }

    .rantai-send-btn:hover:not(:disabled) {
      filter: brightness(1.1);
    }

    .rantai-send-btn:active:not(:disabled) {
      transform: scale(0.95);
    }

    .rantai-send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .rantai-send-icon {
      width: 20px;
      height: 20px;
    }

    .rantai-powered {
      text-align: center;
      padding: 8px;
      font-size: 11px;
      color: #9ca3af;
      background: ${safeTheme.backgroundColor};
      border-top: 1px solid #f3f4f6;
      flex-shrink: 0;
    }

    .rantai-powered a {
      color: ${safeTheme.primaryColor};
      text-decoration: none;
      font-weight: 500;
    }

    .rantai-powered a:hover {
      text-decoration: underline;
    }

    .rantai-error {
      background: #fef2f2;
      color: #dc2626;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      margin: 8px 16px;
      text-align: center;
    }

    /* Scrollbar styling */
    .rantai-messages::-webkit-scrollbar {
      width: 6px;
    }

    .rantai-messages::-webkit-scrollbar-track {
      background: transparent;
    }

    .rantai-messages::-webkit-scrollbar-thumb {
      background: #d1d5db;
      border-radius: 3px;
    }

    .rantai-messages::-webkit-scrollbar-thumb:hover {
      background: #9ca3af;
    }

    /* Mobile responsive */
    @media (max-width: 480px) {
      .rantai-chat-window {
        width: 100%;
        height: 100%;
        max-height: 100vh;
        max-width: 100vw;
        border-radius: 0;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
      }
    }
  `
}
