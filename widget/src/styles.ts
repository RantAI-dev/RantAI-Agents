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
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .rantai-launcher:hover {
      transform: scale(1.06);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22), 0 4px 10px rgba(0, 0, 0, 0.12);
    }

    .rantai-launcher:active {
      transform: scale(0.96);
    }

    .rantai-widget-container.rantai-chat-open .rantai-launcher {
      visibility: hidden;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
    }

    .rantai-launcher-icon {
      width: 28px;
      height: 28px;
    }

    .rantai-chat-window {
      display: none;
      flex-direction: column;
      width: 384px;
      height: 540px;
      max-height: calc(100vh - 100px);
      max-width: calc(100vw - 32px);
      background: ${safeTheme.backgroundColor};
      border-radius: 20px;
      border: 1px solid rgba(0, 0, 0, 0.06);
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15), 0 8px 20px rgba(0, 0, 0, 0.06);
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
      padding: 14px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .rantai-header-info {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .rantai-header-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
      overflow: hidden;
    }

    .rantai-header-title {
      font-weight: 600;
      font-size: 15px;
      letter-spacing: -0.01em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .rantai-header-subtitle {
      font-size: 12px;
      opacity: 0.88;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .rantai-header-subtitle::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.9);
      flex-shrink: 0;
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
      overflow-x: hidden;
      padding: 16px 14px 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: ${safeTheme.backgroundColor};
      scroll-behavior: smooth;
    }

    .rantai-message {
      display: flex;
      gap: 8px;
      max-width: 88%;
      animation: rantai-fade-in 0.25s ease-out;
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
      padding: 11px 15px;
      border-radius: 18px;
      font-size: 14px;
      line-height: 1.52;
      word-wrap: break-word;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }

    .rantai-message-bubble strong {
      font-weight: 600;
    }

    .rantai-message-bubble em {
      font-style: italic;
    }

    .rantai-message-bubble code {
      background: rgba(0, 0, 0, 0.06);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 13px;
    }

    .rantai-message.user .rantai-message-bubble code {
      background: rgba(255, 255, 255, 0.2);
    }

    .rantai-message-bubble pre {
      background: rgba(0, 0, 0, 0.06);
      padding: 12px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 8px 0;
    }

    .rantai-message.user .rantai-message-bubble pre {
      background: rgba(255, 255, 255, 0.2);
    }

    .rantai-message-bubble pre code {
      background: transparent;
      padding: 0;
      font-size: 13px;
      line-height: 1.4;
    }

    .rantai-message-bubble a {
      color: ${safeTheme.primaryColor};
      text-decoration: none;
      border-bottom: 1px solid currentColor;
      transition: opacity 0.2s;
    }

    .rantai-message-bubble a:hover {
      opacity: 0.85;
    }

    .rantai-message.user .rantai-message-bubble a {
      color: rgba(255, 255, 255, 0.95);
      border-bottom-color: rgba(255, 255, 255, 0.6);
    }

    .rantai-message-bubble ul {
      margin: 6px 0 4px;
      padding-left: 20px;
      list-style-type: disc;
    }

    .rantai-message-bubble ol {
      margin: 6px 0 4px;
      padding-left: 20px;
      list-style-type: decimal;
    }

    .rantai-message-bubble li {
      margin: 2px 0;
    }

    .rantai-message-bubble blockquote {
      border-left: 3px solid rgba(0, 0, 0, 0.12);
      padding-left: 12px;
      margin: 8px 0;
      font-style: italic;
      opacity: 0.92;
    }

    .rantai-message.user .rantai-message-bubble blockquote {
      border-left-color: rgba(255, 255, 255, 0.5);
    }

    .rantai-message-bubble h1,
    .rantai-message-bubble h2,
    .rantai-message-bubble h3 {
      margin: 10px 0 6px;
      font-weight: 600;
      line-height: 1.3;
    }

    .rantai-message-bubble h1:first-child,
    .rantai-message-bubble h2:first-child,
    .rantai-message-bubble h3:first-child {
      margin-top: 0;
    }

    .rantai-message-bubble h1 {
      font-size: 20px;
    }

    .rantai-message-bubble h2 {
      font-size: 18px;
    }

    .rantai-message-bubble h3 {
      font-size: 16px;
    }

    .rantai-message.assistant .rantai-message-bubble {
      background: ${safeTheme.assistantBubbleColor};
      color: ${safeTheme.textColor};
      border-bottom-left-radius: 6px;
    }

    .rantai-message.user .rantai-message-bubble {
      background: ${safeTheme.userBubbleColor};
      color: white;
      border-bottom-right-radius: 6px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    }

    .rantai-typing {
      display: flex;
      gap: 5px;
      padding: 14px 18px;
      background: ${safeTheme.assistantBubbleColor};
      border-radius: 18px;
      border-bottom-left-radius: 6px;
      width: fit-content;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
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
      padding: 14px 16px 16px;
      border-top: 1px solid rgba(0, 0, 0, 0.06);
      background: ${safeTheme.backgroundColor};
      flex-shrink: 0;
    }

    .rantai-input-form {
      display: flex;
      gap: 10px;
      align-items: flex-end;
    }

    .rantai-input-wrapper {
      flex: 1;
      position: relative;
      min-width: 0;
    }

    .rantai-input {
      width: 100%;
      padding: 12px 16px;
      padding-right: 14px;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 22px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
      resize: none;
      max-height: 120px;
      font-family: inherit;
      overflow-y: auto;
      background: ${safeTheme.backgroundColor};
    }

    .rantai-input:focus {
      border-color: ${safeTheme.primaryColor};
      box-shadow: 0 0 0 2px ${safeTheme.primaryColor}30;
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
      transition: filter 0.2s ease, transform 0.2s ease;
      flex-shrink: 0;
    }

    .rantai-send-btn:hover:not(:disabled) {
      filter: brightness(1.12);
      transform: scale(1.04);
    }

    .rantai-send-btn:active:not(:disabled) {
      transform: scale(0.96);
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
      padding: 8px 12px;
      font-size: 11px;
      color: #94a3b8;
      background: ${safeTheme.backgroundColor};
      border-top: 1px solid rgba(0, 0, 0, 0.05);
      flex-shrink: 0;
    }

    .rantai-powered a {
      color: ${safeTheme.primaryColor};
      text-decoration: none;
      font-weight: 500;
      opacity: 0.9;
    }

    .rantai-powered a:hover {
      text-decoration: underline;
      opacity: 1;
    }

    .rantai-error {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: #fef2f2;
      color: #dc2626;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      margin: 0 0 4px 0;
    }

    .rantai-error-text {
      flex: 1;
      min-width: 0;
      text-align: center;
    }

    .rantai-error-retry {
      flex-shrink: 0;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 500;
      color: #dc2626;
      background: transparent;
      border: 1px solid rgba(220, 38, 38, 0.4);
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.2s, border-color 0.2s;
    }

    .rantai-error-retry:hover {
      background: rgba(220, 38, 38, 0.08);
      border-color: #dc2626;
    }

    /* Custom scrollbar - messages area */
    .rantai-messages::-webkit-scrollbar {
      width: 6px;
    }

    .rantai-messages::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.04);
      border-radius: 3px;
    }

    .rantai-messages::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.18);
      border-radius: 3px;
    }

    .rantai-messages::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 0, 0, 0.28);
    }

    /* Custom scrollbar - input textarea */
    .rantai-input::-webkit-scrollbar {
      width: 5px;
    }

    .rantai-input::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.04);
      border-radius: 3px;
    }

    .rantai-input::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.16);
      border-radius: 3px;
    }

    .rantai-input::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 0, 0, 0.24);
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
