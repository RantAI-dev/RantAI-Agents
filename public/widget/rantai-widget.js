"use strict";var RantAIWidget=(()=>{var f=Object.defineProperty;var M=Object.getOwnPropertyDescriptor;var H=Object.getOwnPropertyNames;var A=Object.prototype.hasOwnProperty;var B=(s,t)=>{for(var e in t)f(s,e,{get:t[e],enumerable:!0})},P=(s,t,e,a)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of H(t))!A.call(s,i)&&i!==e&&f(s,i,{get:()=>t[i],enumerable:!(a=M(t,i))||a.enumerable});return s};var W=s=>P(f({},"__esModule",{value:!0}),s);var L={};B(L,{RantAIWidgetInstance:()=>m,initWidget:()=>x});var u=class{constructor(t,e){this.apiKey=t,this.baseUrl=e}async getConfig(){let t=await fetch(`${this.baseUrl}/api/widget/config?key=${encodeURIComponent(this.apiKey)}`);if(!t.ok){let e=await t.json().catch(()=>({error:"Failed to load config"}));throw new Error(e.error||`HTTP ${t.status}`)}return t.json()}async sendMessage(t,e,a,i){let r=await fetch(`${this.baseUrl}/api/widget/chat`,{method:"POST",headers:{"Content-Type":"application/json","X-Widget-Api-Key":this.apiKey},body:JSON.stringify({messages:t.map(c=>({role:c.role,content:c.content})),visitorId:a,threadId:i})});if(!r.ok){let c=await r.json().catch(()=>({error:"Failed to send message"}));throw new Error(c.error||`HTTP ${r.status}`)}let o=r.body?.getReader();if(!o)throw new Error("No response body");let l=new TextDecoder,n="";for(;;){let{done:c,value:h}=await o.read();if(c)break;let I=l.decode(h,{stream:!0});n+=I;let v=n.indexOf(`

---SOURCES---
`);e(v>=0?n.substring(0,v):n)}let g=n.indexOf(`

---SOURCES---
`);return g>=0?n.substring(0,g):n}async requestHandoff(t){let e=await fetch(`${this.baseUrl}/api/widget/handoff`,{method:"POST",headers:{"Content-Type":"application/json","X-Widget-Api-Key":this.apiKey},body:JSON.stringify(t)});if(!e.ok){let a=await e.json().catch(()=>({error:"Handoff request failed"}));throw new Error(a.error||`HTTP ${e.status}`)}return e.json()}async pollHandoff(t,e){let a=new URLSearchParams({conversationId:t});e&&a.set("after",e);let i=await fetch(`${this.baseUrl}/api/widget/handoff?${a.toString()}`,{headers:{"X-Widget-Api-Key":this.apiKey}});if(!i.ok){let r=await i.json().catch(()=>({error:"Poll failed"}));throw new Error(r.error||`HTTP ${i.status}`)}return i.json()}async sendHandoffMessage(t,e){let a=await fetch(`${this.baseUrl}/api/widget/handoff/message`,{method:"POST",headers:{"Content-Type":"application/json","X-Widget-Api-Key":this.apiKey},body:JSON.stringify({conversationId:t,content:e})});if(!a.ok){let i=await a.json().catch(()=>({error:"Send failed"}));throw new Error(i.error||`HTTP ${a.status}`)}return a.json()}async uploadFile(t){let e=new FormData;e.append("file",t);let a=await fetch(`${this.baseUrl}/api/widget/upload`,{method:"POST",headers:{"X-Widget-Api-Key":this.apiKey},body:e});if(!a.ok){let i=await a.json().catch(()=>({error:"Upload failed"}));throw new Error(i.error||`HTTP ${a.status}`)}return a.json()}};function p(s,t){return!s||typeof s!="string"?t:/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(s)||/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+))?\s*\)$/.test(s)||["white","black","red","green","blue","gray","transparent"].includes(s.toLowerCase())?s:t}function w(s){let{theme:t,position:e}=s,a={primaryColor:p(t.primaryColor,"#3b82f6"),backgroundColor:p(t.backgroundColor,"#ffffff"),textColor:p(t.textColor,"#1f2937"),userBubbleColor:p(t.userBubbleColor,"#3b82f6"),assistantBubbleColor:p(t.assistantBubbleColor,"#f3f4f6")},i={"bottom-right":"bottom: 20px; right: 20px;","bottom-left":"bottom: 20px; left: 20px;","top-right":"top: 20px; right: 20px;","top-left":"top: 20px; left: 20px;"},r={"bottom-right":"bottom: 80px; right: 0;","bottom-left":"bottom: 80px; left: 0;","top-right":"top: 80px; right: 0;","top-left":"top: 80px; left: 0;"};return`
    .rantai-widget-container {
      position: fixed;
      z-index: 999999;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ${i[e]}
    }

    .rantai-launcher {
      width: 60px;
      height: 60px;
      border-radius: 30px;
      background: ${a.primaryColor};
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
      background: ${a.backgroundColor};
      border-radius: 20px;
      border: 1px solid rgba(0, 0, 0, 0.06);
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15), 0 8px 20px rgba(0, 0, 0, 0.06);
      overflow: hidden;
      position: absolute;
      ${r[e]}
    }

    .rantai-chat-window.open {
      display: flex;
    }

    .rantai-header {
      background: ${a.primaryColor};
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
      background: ${a.backgroundColor};
      scroll-behavior: smooth;
    }

    .rantai-message {
      display: flex;
      gap: 8px;
      max-width: 88%;
      animation: rantai-fade-in 0.25s ease-out;
      align-items: flex-start;
    }

    .rantai-msg-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 2px;
      overflow: hidden;
    }

    .rantai-msg-avatar svg {
      width: 14px;
      height: 14px;
    }

    .rantai-msg-avatar-emoji {
      font-size: 16px;
      line-height: 1;
    }

    .rantai-msg-avatar-assistant {
      background: rgba(0, 0, 0, 0.06);
      color: ${a.textColor};
    }

    .rantai-msg-avatar-agent {
      background: #059669;
      color: white;
    }

    .rantai-msg-avatar-user {
      background: ${a.userBubbleColor};
      color: white;
    }

    .rantai-msg-content {
      flex: 1;
      min-width: 0;
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
      color: ${a.primaryColor};
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
      background: ${a.assistantBubbleColor};
      color: ${a.textColor};
      border-bottom-left-radius: 6px;
    }

    .rantai-message.user .rantai-message-bubble {
      background: ${a.userBubbleColor};
      color: white;
      border-bottom-right-radius: 6px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    }

    .rantai-typing {
      display: flex;
      gap: 5px;
      padding: 14px 18px;
      background: ${a.assistantBubbleColor};
      border-radius: 18px;
      border-bottom-left-radius: 6px;
      width: fit-content;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }

    .rantai-typing span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${a.textColor};
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
      background: ${a.backgroundColor};
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
      background: ${a.backgroundColor};
    }

    .rantai-input:focus {
      border-color: ${a.primaryColor};
      box-shadow: 0 0 0 2px ${a.primaryColor}30;
    }

    .rantai-input::placeholder {
      color: #9ca3af;
    }

    .rantai-send-btn {
      width: 44px;
      height: 44px;
      padding: 0;
      background: ${a.primaryColor};
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
      background: ${a.backgroundColor};
      border-top: 1px solid rgba(0, 0, 0, 0.05);
      flex-shrink: 0;
    }

    .rantai-powered a {
      color: ${a.primaryColor};
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

    /* Live Chat Handoff styles */
    .rantai-handoff-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: fit-content;
      margin: 8px auto;
      padding: 10px 20px;
      background: ${a.primaryColor};
      color: white;
      border: none;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: filter 0.2s, transform 0.2s;
      animation: rantai-fade-in 0.25s ease-out;
    }

    .rantai-handoff-btn:hover {
      filter: brightness(1.1);
      transform: scale(1.03);
    }

    .rantai-handoff-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .rantai-waiting-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 16px;
      margin: 4px auto;
      font-size: 13px;
      color: ${a.textColor};
      opacity: 0.7;
      animation: rantai-fade-in 0.25s ease-out;
    }

    .rantai-waiting-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${a.primaryColor};
      animation: rantai-pulse 1.4s infinite;
    }

    @keyframes rantai-pulse {
      0%, 100% { opacity: 0.4; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.3); }
    }

    .rantai-agent-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 14px;
      margin: 6px 0;
      background: rgba(16, 185, 129, 0.08);
      color: #059669;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 500;
      animation: rantai-fade-in 0.25s ease-out;
    }

    .rantai-agent-banner.resolved {
      background: rgba(107, 114, 128, 0.08);
      color: #6b7280;
    }

    .rantai-message.agent .rantai-message-bubble {
      background: #ecfdf5;
      color: ${a.textColor};
      border-bottom-left-radius: 6px;
    }

    .rantai-message.agent {
      max-width: 88%;
    }

    .rantai-agent-label {
      font-size: 11px;
      color: #059669;
      font-weight: 500;
      margin-bottom: 2px;
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
  `}var y=`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="rantai-launcher-icon">
  <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/>
</svg>
`,k=`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
  <path d="M18 6 6 18"/>
  <path d="m6 6 12 12"/>
</svg>
`,C=`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="rantai-send-icon">
  <path d="m22 2-7 20-4-9-9-4Z"/>
  <path d="M22 2 11 13"/>
</svg>
`,E=`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
  <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>
</svg>
`,S=`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
  <circle cx="12" cy="7" r="4"/>
</svg>
`,T=`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
  <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>
</svg>
`,$=`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
  <path d="M12 8V4H8"/>
  <rect width="16" height="12" x="4" y="8" rx="2"/>
  <path d="M2 14h2"/>
  <path d="M20 14h2"/>
  <path d="M15 13v2"/>
  <path d="M9 13v2"/>
</svg>
`;var d=class d{constructor(t,e){this.config=null;this.container=null;this.chatWindow=null;this.messagesContainer=null;this.input=null;this.sendButton=null;this.pollInterval=null;this.lastPollTimestamp=null;this.state={isOpen:!1,isLoading:!1,messages:[],error:null,handoffState:"idle",conversationId:null,visitorId:"",threadId:""};this.api=new u(t,e)}generateId(t){return`${t}_${Date.now().toString(36)}_${Math.random().toString(36).substr(2,8)}`}loadOrCreateVisitorId(){try{let t=localStorage.getItem(d.STORAGE_KEY_VISITOR);if(t)return t;let e=this.generateId("vis");return localStorage.setItem(d.STORAGE_KEY_VISITOR,e),e}catch{return this.generateId("vis")}}loadOrCreateThreadId(){try{let t=localStorage.getItem(d.STORAGE_KEY_THREAD);if(t)return t;let e=this.generateId("thread");return localStorage.setItem(d.STORAGE_KEY_THREAD,e),e}catch{return this.generateId("thread")}}resetThreadId(){let t=this.generateId("thread");try{localStorage.setItem(d.STORAGE_KEY_THREAD,t)}catch{}return t}persistMessages(){try{let t=this.state.messages.slice(-d.MAX_PERSISTED_MESSAGES).map(e=>({id:e.id,role:e.role,content:e.content,timestamp:e.timestamp}));localStorage.setItem(d.STORAGE_KEY_MESSAGES,JSON.stringify(t))}catch{}}loadPersistedMessages(){try{let t=localStorage.getItem(d.STORAGE_KEY_MESSAGES);if(!t)return!1;let e=JSON.parse(t);if(!e.length)return!1;for(let a of e)a.timestamp=new Date(a.timestamp),this.state.messages.push(a),this.renderMessage(a);return this.scrollToBottom(),!0}catch{return!1}}async init(){try{this.state.visitorId=this.loadOrCreateVisitorId(),this.state.threadId=this.loadOrCreateThreadId(),this.config=await this.api.getConfig(),this.injectStyles(),this.createUI(),this.loadPersistedMessages()||this.addMessage("assistant",this.config.config.welcomeMessage),console.log(`[RantAI Widget] Initialized (visitor: ${this.state.visitorId}, thread: ${this.state.threadId})`)}catch(t){throw console.error("[RantAI Widget] Failed to initialize:",t),t}}injectStyles(){if(!this.config)return;let t="rantai-widget-styles";if(document.getElementById(t))return;let e=document.createElement("style");e.id=t,e.textContent=w(this.config.config),document.head.appendChild(e)}createUI(){if(!this.config)return;this.container=document.createElement("div"),this.container.id="rantai-widget",this.container.className=`rantai-widget-container ${this.config.config.customCssClass||""}`;let t=document.createElement("button");t.className="rantai-launcher",t.setAttribute("aria-label","Open chat"),t.innerHTML=y,t.onclick=()=>this.toggle(),this.chatWindow=document.createElement("div"),this.chatWindow.className="rantai-chat-window",this.chatWindow.innerHTML=this.createChatWindowHTML(),this.container.appendChild(t),this.container.appendChild(this.chatWindow),document.body.appendChild(this.container),this.messagesContainer=this.chatWindow.querySelector(".rantai-messages"),this.input=this.chatWindow.querySelector(".rantai-input"),this.sendButton=this.chatWindow.querySelector(".rantai-send-btn"),this.bindEvents()}createChatWindowHTML(){if(!this.config)return"";let{config:t,assistantName:e,assistantEmoji:a}=this.config,i=t.avatar||a,r=c=>c.replace(/[&<>"']/g,h=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[h]||h),o=this.escapeHtml(t.headerTitle||e),l=r(t.placeholderText);return`
      <div class="rantai-header">
        <div class="rantai-header-info">
          <div class="rantai-header-avatar">${i.startsWith("http://")||i.startsWith("https://")?`<img src="${r(i)}" alt="" style="width: 100%; height: 100%; border-radius: 50%;">`:this.escapeHtml(i)}</div>
          <div>
            <div class="rantai-header-title">${o}</div>
            <div class="rantai-header-subtitle">Online</div>
          </div>
        </div>
        <button class="rantai-close" aria-label="Close chat">${k}</button>
      </div>

      <div class="rantai-messages"></div>

      <div class="rantai-input-area">
        <form class="rantai-input-form">
          <div class="rantai-input-wrapper">
            <textarea
              class="rantai-input"
              placeholder="${l}"
              rows="1"
              aria-label="Message input"
            ></textarea>
          </div>
          <button type="submit" class="rantai-send-btn" aria-label="Send message">
            ${C}
          </button>
        </form>
      </div>

    `}bindEvents(){if(!this.chatWindow||!this.input)return;let t=this.chatWindow.querySelector(".rantai-close");t&&t.addEventListener("click",()=>this.close());let e=this.chatWindow.querySelector(".rantai-input-form");e&&e.addEventListener("submit",a=>{a.preventDefault(),this.sendMessage()}),this.input.addEventListener("input",()=>{this.input&&(this.input.style.height="auto",this.input.style.height=Math.min(this.input.scrollHeight,120)+"px")}),this.input.addEventListener("keydown",a=>{a.key==="Enter"&&!a.shiftKey&&(a.preventDefault(),this.sendMessage())})}toggle(){this.state.isOpen?this.close():this.open()}open(){this.state.isOpen=!0,this.container?.classList.add("rantai-chat-open"),this.chatWindow?.classList.add("open"),this.input?.focus()}close(){this.state.isOpen=!1,this.container?.classList.remove("rantai-chat-open"),this.chatWindow?.classList.remove("open")}addMessage(t,e,a){let i={id:a||`msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,role:t,content:e,timestamp:new Date};return this.state.messages.push(i),this.renderMessage(i),this.scrollToBottom(),this.persistMessages(),i}renderMessage(t,e){if(!this.messagesContainer)return;let a=document.createElement("div");a.className=`rantai-message ${t.role}`,a.id=t.id;let r=e?.isThinking&&t.role==="assistant"&&!t.content.trim()?'<div class="rantai-typing"><span></span><span></span><span></span></div>':this.formatMessageContent(t.content),o="";if(t.role==="assistant"){let n=this.config?.config.avatar||this.config?.assistantEmoji||"";o=`<div class="rantai-msg-avatar rantai-msg-avatar-assistant">${n.startsWith("http://")||n.startsWith("https://")?`<img src="${n}" alt="" style="width: 100%; height: 100%; border-radius: 50%;">`:n?`<span class="rantai-msg-avatar-emoji">${this.escapeHtml(n)}</span>`:$}</div>`}else t.role==="agent"?o=`<div class="rantai-msg-avatar rantai-msg-avatar-agent">${T}</div>`:t.role==="user"&&(o=`<div class="rantai-msg-avatar rantai-msg-avatar-user">${S}</div>`);let l=t.role==="agent"?'<div class="rantai-agent-label">Agent</div>':"";a.innerHTML=`${o}<div class="rantai-msg-content">${l}<div class="rantai-message-bubble">${r}</div></div>`,this.messagesContainer.appendChild(a)}updateMessage(t,e){let a=document.getElementById(t);if(!a)return;let i=a.querySelector(".rantai-message-bubble");i&&(i.innerHTML=this.formatMessageContent(e))}showError(t){if(!this.messagesContainer)return;let e=this.messagesContainer.querySelector(".rantai-error");e&&e.remove();let a=document.createElement("div");a.className="rantai-error";let i=document.createElement("span");i.className="rantai-error-text",i.textContent=t,a.appendChild(i);let r=document.createElement("button");r.type="button",r.className="rantai-error-retry",r.textContent="Try again",r.addEventListener("click",()=>{a.remove(),this.input?.focus()}),a.appendChild(r),this.messagesContainer.appendChild(a),this.scrollToBottom(),setTimeout(()=>a.remove(),8e3)}scrollToBottom(){this.messagesContainer&&(this.messagesContainer.scrollTop=this.messagesContainer.scrollHeight)}async sendMessage(){if(!this.input||this.state.isLoading)return;let t=this.input.value.trim();if(!t)return;if(this.input.value="",this.input.style.height="auto",this.state.handoffState==="connected"&&this.state.conversationId){this.addMessage("user",t);try{await this.api.sendHandoffMessage(this.state.conversationId,t)}catch(a){console.error("[RantAI Widget] Handoff message error:",a),this.showError("Failed to send message to agent")}return}this.addMessage("user",t),this.state.isLoading=!0,this.sendButton&&(this.sendButton.disabled=!0),this.input&&(this.input.disabled=!0);let e={id:`msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,role:"assistant",content:"",timestamp:new Date};this.state.messages.push(e),this.renderMessage(e,{isThinking:!0});try{await this.api.sendMessage(this.state.messages.slice(0,-1),i=>{e.content=i;let r=i.replace(/\[AGENT_HANDOFF\]/g,"").trim();this.updateMessage(e.id,r),this.scrollToBottom()},this.state.visitorId,this.state.threadId);let a=e.content;a.includes("[AGENT_HANDOFF]")&&(e.content=a.replace(/\[AGENT_HANDOFF\]/g,"").trim(),this.updateMessage(e.id,e.content),this.config?.liveChatEnabled&&this.showHandoffButton())}catch(a){console.error("[RantAI Widget] Send message error:",a),this.state.messages.pop();let i=document.getElementById(e.id);i&&i.remove(),this.showError(a instanceof Error?a.message:"Failed to send message")}finally{this.state.isLoading=!1,this.sendButton&&(this.sendButton.disabled=!1),this.input&&(this.input.disabled=!1),this.updateMessage(e.id,e.content),this.persistMessages()}}showHandoffButton(){if(!this.messagesContainer)return;let t=document.createElement("button");t.className="rantai-handoff-btn",t.innerHTML=`${E} Connect with Agent`,t.addEventListener("click",()=>{t.remove(),this.requestHandoff()}),this.messagesContainer.appendChild(t),this.scrollToBottom()}async requestHandoff(){if(!this.messagesContainer)return;this.state.handoffState="requesting";let t=document.createElement("div");t.className="rantai-waiting-indicator",t.id="rantai-waiting",t.innerHTML='<div class="rantai-waiting-dot"></div> Waiting for an agent...',this.messagesContainer.appendChild(t),this.scrollToBottom();try{let e=this.state.messages.filter(i=>i.role==="user"||i.role==="assistant").map(i=>({role:i.role,content:i.content})),a=await this.api.requestHandoff({chatHistory:e,visitorId:this.state.visitorId});this.state.conversationId=a.conversationId,this.state.handoffState="waiting",this.startPolling()}catch(e){console.error("[RantAI Widget] Handoff request error:",e),this.state.handoffState="idle";let a=document.getElementById("rantai-waiting");a&&a.remove(),this.showError("Failed to connect with an agent. Please try again.")}}startPolling(){this.pollInterval||(this.lastPollTimestamp=null,this.pollInterval=setInterval(async()=>{if(this.state.conversationId)try{let t=await this.api.pollHandoff(this.state.conversationId,this.lastPollTimestamp||void 0);if(t.status==="AGENT_CONNECTED"&&this.state.handoffState!=="connected"){this.state.handoffState="connected";let e=document.getElementById("rantai-waiting");e&&e.remove(),this.showBanner(`${t.agentName||"An agent"} joined the chat`)}t.status==="RESOLVED"&&this.state.handoffState!=="resolved"&&(this.state.handoffState="resolved",this.stopPolling(),this.showBanner("Conversation resolved",!0),setTimeout(()=>this.resetToFreshChat(),3e3));for(let e of t.messages)this.state.messages.some(a=>a.id===e.id)||e.role!=="system"&&e.role==="agent"&&this.addMessage("agent",e.content,e.id);t.messages.length>0&&(this.lastPollTimestamp=t.messages[t.messages.length-1].timestamp)}catch(t){console.error("[RantAI Widget] Poll error:",t)}},3e3))}stopPolling(){this.pollInterval&&(clearInterval(this.pollInterval),this.pollInterval=null)}resetToFreshChat(){this.state.messages=[],this.state.handoffState="idle",this.state.conversationId=null,this.state.isLoading=!1,this.state.error=null,this.state.threadId=this.resetThreadId(),this.lastPollTimestamp=null;try{localStorage.removeItem(d.STORAGE_KEY_MESSAGES)}catch{}this.messagesContainer&&(this.messagesContainer.innerHTML=""),this.config&&this.addMessage("assistant",this.config.config.welcomeMessage)}showBanner(t,e){if(!this.messagesContainer)return;let a=document.createElement("div");a.className=`rantai-agent-banner${e?" resolved":""}`,a.textContent=t,this.messagesContainer.appendChild(a),this.scrollToBottom()}escapeHtml(t){let e=document.createElement("div");return e.textContent=t,e.innerHTML}safeLinkHref(t){let e=t.trim();return!e.startsWith("http://")&&!e.startsWith("https://")?"#":e.replace(/"/g,"&quot;")}formatMessageContent(t){if(!t)return"";let e=[],a=o=>{let l=e.length;return e.push(o),`\0B${l}\0`},i=t.replace(/```(\w*)\n?([\s\S]*?)```/g,(o,l,n)=>a(`<pre><code class="language-${l||"text"}">${this.escapeHtml(n.trim())}</code></pre>`));i=i.replace(/`([^`]+?)`/g,(o,l)=>a(`<code>${this.escapeHtml(l)}</code>`)),i=this.escapeHtml(i);let r=[[/^### (.+)$/gm,"<h3>$1</h3>"],[/^## (.+)$/gm,"<h2>$1</h2>"],[/^# (.+)$/gm,"<h1>$1</h1>"],[/^&gt; (.+)$/gm,"<blockquote>$1</blockquote>"],[/^[*-] (.+)$/gm,"\0L$1\0"],[/^\d+\. (.+)$/gm,"\0L$1\0"]];for(let[o,l]of r)i=i.replace(o,l);return i=i.replace(/(\x00L[^\x00]+\x00(?:\n?))+/g,o=>`<ul>${o.split(/\x00L|\x00/).filter(Boolean).map(n=>n.trim()).filter(Boolean).map(n=>`<li>${n}</li>`).join("")}</ul>`),i=i.replace(/\*\*([^*]+?)\*\*/g,"<strong>$1</strong>"),i=i.replace(/__([^_]+?)__/g,"<strong>$1</strong>"),i=i.replace(/\*([^*\n]+?)\*/g,"<em>$1</em>"),i=i.replace(/_([^_\n]+?)_/g,"<em>$1</em>"),i=i.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g,(o,l,n)=>`<a href="${this.safeLinkHref(n)}" target="_blank" rel="noopener noreferrer">${l}</a>`),i=i.replace(/\n/g,"<br/>"),i.replace(/\x00B(\d+)\x00/g,(o,l)=>e[parseInt(l,10)]??"")}};d.STORAGE_KEY_VISITOR="rantai_visitor_id",d.STORAGE_KEY_THREAD="rantai_thread_id",d.STORAGE_KEY_MESSAGES="rantai_messages",d.MAX_PERSISTED_MESSAGES=50;var m=d,b=null;function x(){if(b){console.warn("[RantAI Widget] Already initialized");return}let s=document.getElementsByTagName("script"),t=null,e="";for(let a=0;a<s.length;a++){let i=s[a];if(i.src.includes("rantai-widget")){t=i.getAttribute("data-api-key"),e=new URL(i.src).origin;break}}if(!t){console.error("[RantAI Widget] Missing data-api-key attribute");return}b=new m(t,e),b.init().catch(a=>{console.error("[RantAI Widget] Initialization failed:",a)})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",x):x();return W(L);})();
