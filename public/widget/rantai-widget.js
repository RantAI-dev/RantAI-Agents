"use strict";var RantAIWidget=(()=>{var h=Object.defineProperty;var k=Object.getOwnPropertyDescriptor;var C=Object.getOwnPropertyNames;var $=Object.prototype.hasOwnProperty;var M=(r,t)=>{for(var a in t)h(r,a,{get:t[a],enumerable:!0})},T=(r,t,a,e)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of C(t))!$.call(r,i)&&i!==a&&h(r,i,{get:()=>t[i],enumerable:!(e=k(t,i))||e.enumerable});return r};var W=r=>T(h({},"__esModule",{value:!0}),r);var E={};M(E,{RantAIWidgetInstance:()=>c,initWidget:()=>b});var p=class{constructor(t,a){this.apiKey=t,this.baseUrl=a}async getConfig(){let t=await fetch(`${this.baseUrl}/api/widget/config?key=${encodeURIComponent(this.apiKey)}`);if(!t.ok){let a=await t.json().catch(()=>({error:"Failed to load config"}));throw new Error(a.error||`HTTP ${t.status}`)}return t.json()}async sendMessage(t,a){let e=await fetch(`${this.baseUrl}/api/widget/chat`,{method:"POST",headers:{"Content-Type":"application/json","X-Widget-Api-Key":this.apiKey},body:JSON.stringify({messages:t.map(n=>({role:n.role,content:n.content}))})});if(!e.ok){let n=await e.json().catch(()=>({error:"Failed to send message"}));throw new Error(n.error||`HTTP ${e.status}`)}let i=e.body?.getReader();if(!i)throw new Error("No response body");let s=new TextDecoder,o="";for(;;){let{done:n,value:l}=await i.read();if(n)break;let g=s.decode(l,{stream:!0});o+=g,a(o)}return o}async uploadFile(t){let a=new FormData;a.append("file",t);let e=await fetch(`${this.baseUrl}/api/widget/upload`,{method:"POST",headers:{"X-Widget-Api-Key":this.apiKey},body:a});if(!e.ok){let i=await e.json().catch(()=>({error:"Upload failed"}));throw new Error(i.error||`HTTP ${e.status}`)}return e.json()}};function d(r,t){return!r||typeof r!="string"?t:/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(r)||/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+))?\s*\)$/.test(r)||["white","black","red","green","blue","gray","transparent"].includes(r.toLowerCase())?r:t}function f(r){let{theme:t,position:a}=r,e={primaryColor:d(t.primaryColor,"#3b82f6"),backgroundColor:d(t.backgroundColor,"#ffffff"),textColor:d(t.textColor,"#1f2937"),userBubbleColor:d(t.userBubbleColor,"#3b82f6"),assistantBubbleColor:d(t.assistantBubbleColor,"#f3f4f6")},i={"bottom-right":"bottom: 20px; right: 20px;","bottom-left":"bottom: 20px; left: 20px;","top-right":"top: 20px; right: 20px;","top-left":"top: 20px; left: 20px;"},s={"bottom-right":"bottom: 80px; right: 0;","bottom-left":"bottom: 80px; left: 0;","top-right":"top: 80px; right: 0;","top-left":"top: 80px; left: 0;"};return`
    .rantai-widget-container {
      position: fixed;
      z-index: 999999;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ${i[a]}
    }

    .rantai-launcher {
      width: 60px;
      height: 60px;
      border-radius: 30px;
      background: ${e.primaryColor};
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
      background: ${e.backgroundColor};
      border-radius: 20px;
      border: 1px solid rgba(0, 0, 0, 0.06);
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15), 0 8px 20px rgba(0, 0, 0, 0.06);
      overflow: hidden;
      position: absolute;
      ${s[a]}
    }

    .rantai-chat-window.open {
      display: flex;
    }

    .rantai-header {
      background: ${e.primaryColor};
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
      background: ${e.backgroundColor};
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
      color: ${e.primaryColor};
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
      background: ${e.assistantBubbleColor};
      color: ${e.textColor};
      border-bottom-left-radius: 6px;
    }

    .rantai-message.user .rantai-message-bubble {
      background: ${e.userBubbleColor};
      color: white;
      border-bottom-right-radius: 6px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    }

    .rantai-typing {
      display: flex;
      gap: 5px;
      padding: 14px 18px;
      background: ${e.assistantBubbleColor};
      border-radius: 18px;
      border-bottom-left-radius: 6px;
      width: fit-content;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }

    .rantai-typing span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${e.textColor};
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
      background: ${e.backgroundColor};
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
      background: ${e.backgroundColor};
    }

    .rantai-input:focus {
      border-color: ${e.primaryColor};
      box-shadow: 0 0 0 2px ${e.primaryColor}30;
    }

    .rantai-input::placeholder {
      color: #9ca3af;
    }

    .rantai-send-btn {
      width: 44px;
      height: 44px;
      padding: 0;
      background: ${e.primaryColor};
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
      background: ${e.backgroundColor};
      border-top: 1px solid rgba(0, 0, 0, 0.05);
      flex-shrink: 0;
    }

    .rantai-powered a {
      color: ${e.primaryColor};
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
  `}var x=`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="rantai-launcher-icon">
  <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/>
</svg>
`,w=`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
  <path d="M18 6 6 18"/>
  <path d="m6 6 12 12"/>
</svg>
`,v=`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="rantai-send-icon">
  <path d="m22 2-7 20-4-9-9-4Z"/>
  <path d="M22 2 11 13"/>
</svg>
`;var c=class{constructor(t,a){this.config=null;this.container=null;this.chatWindow=null;this.messagesContainer=null;this.input=null;this.sendButton=null;this.state={isOpen:!1,isLoading:!1,messages:[],error:null};this.api=new p(t,a)}async init(){try{this.config=await this.api.getConfig(),this.injectStyles(),this.createUI(),this.addMessage("assistant",this.config.config.welcomeMessage),console.log("[RantAI Widget] Initialized successfully")}catch(t){throw console.error("[RantAI Widget] Failed to initialize:",t),t}}injectStyles(){if(!this.config)return;let t="rantai-widget-styles";if(document.getElementById(t))return;let a=document.createElement("style");a.id=t,a.textContent=f(this.config.config),document.head.appendChild(a)}createUI(){if(!this.config)return;this.container=document.createElement("div"),this.container.id="rantai-widget",this.container.className=`rantai-widget-container ${this.config.config.customCssClass||""}`;let t=document.createElement("button");t.className="rantai-launcher",t.setAttribute("aria-label","Open chat"),t.innerHTML=x,t.onclick=()=>this.toggle(),this.chatWindow=document.createElement("div"),this.chatWindow.className="rantai-chat-window",this.chatWindow.innerHTML=this.createChatWindowHTML(),this.container.appendChild(t),this.container.appendChild(this.chatWindow),document.body.appendChild(this.container),this.messagesContainer=this.chatWindow.querySelector(".rantai-messages"),this.input=this.chatWindow.querySelector(".rantai-input"),this.sendButton=this.chatWindow.querySelector(".rantai-send-btn"),this.bindEvents()}createChatWindowHTML(){if(!this.config)return"";let{config:t,assistantName:a,assistantEmoji:e}=this.config,i=t.avatar||e,s=y=>y.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[m]||m),o=this.escapeHtml(t.headerTitle||a),n=s(t.placeholderText);return`
      <div class="rantai-header">
        <div class="rantai-header-info">
          <div class="rantai-header-avatar">${i.startsWith("http://")||i.startsWith("https://")?`<img src="${s(i)}" alt="" style="width: 100%; height: 100%; border-radius: 50%;">`:this.escapeHtml(i)}</div>
          <div>
            <div class="rantai-header-title">${o}</div>
            <div class="rantai-header-subtitle">Online</div>
          </div>
        </div>
        <button class="rantai-close" aria-label="Close chat">${w}</button>
      </div>

      <div class="rantai-messages"></div>

      <div class="rantai-input-area">
        <form class="rantai-input-form">
          <div class="rantai-input-wrapper">
            <textarea
              class="rantai-input"
              placeholder="${n}"
              rows="1"
              aria-label="Message input"
            ></textarea>
          </div>
          <button type="submit" class="rantai-send-btn" aria-label="Send message">
            ${v}
          </button>
        </form>
      </div>

      <div class="rantai-powered">
        Powered by <a href="https://rantai.dev" target="_blank" rel="noopener">RantAI</a>
      </div>
    `}bindEvents(){if(!this.chatWindow||!this.input)return;let t=this.chatWindow.querySelector(".rantai-close");t&&t.addEventListener("click",()=>this.close());let a=this.chatWindow.querySelector(".rantai-input-form");a&&a.addEventListener("submit",e=>{e.preventDefault(),this.sendMessage()}),this.input.addEventListener("input",()=>{this.input&&(this.input.style.height="auto",this.input.style.height=Math.min(this.input.scrollHeight,120)+"px")}),this.input.addEventListener("keydown",e=>{e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),this.sendMessage())})}toggle(){this.state.isOpen?this.close():this.open()}open(){this.state.isOpen=!0,this.container?.classList.add("rantai-chat-open"),this.chatWindow?.classList.add("open"),this.input?.focus()}close(){this.state.isOpen=!1,this.container?.classList.remove("rantai-chat-open"),this.chatWindow?.classList.remove("open")}addMessage(t,a){let e={id:`msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,role:t,content:a,timestamp:new Date};return this.state.messages.push(e),this.renderMessage(e),this.scrollToBottom(),e}renderMessage(t,a){if(!this.messagesContainer)return;let e=document.createElement("div");e.className=`rantai-message ${t.role}`,e.id=t.id;let s=a?.isThinking&&t.role==="assistant"&&!t.content.trim()?'<div class="rantai-typing"><span></span><span></span><span></span></div>':this.formatMessageContent(t.content);e.innerHTML=`<div class="rantai-message-bubble">${s}</div>`,this.messagesContainer.appendChild(e)}updateMessage(t,a){let e=document.getElementById(t);if(!e)return;let i=e.querySelector(".rantai-message-bubble");i&&(i.innerHTML=this.formatMessageContent(a))}showError(t){if(!this.messagesContainer)return;let a=this.messagesContainer.querySelector(".rantai-error");a&&a.remove();let e=document.createElement("div");e.className="rantai-error";let i=document.createElement("span");i.className="rantai-error-text",i.textContent=t,e.appendChild(i);let s=document.createElement("button");s.type="button",s.className="rantai-error-retry",s.textContent="Try again",s.addEventListener("click",()=>{e.remove(),this.input?.focus()}),e.appendChild(s),this.messagesContainer.appendChild(e),this.scrollToBottom(),setTimeout(()=>e.remove(),8e3)}scrollToBottom(){this.messagesContainer&&(this.messagesContainer.scrollTop=this.messagesContainer.scrollHeight)}async sendMessage(){if(!this.input||this.state.isLoading)return;let t=this.input.value.trim();if(!t)return;this.input.value="",this.input.style.height="auto",this.addMessage("user",t),this.state.isLoading=!0,this.sendButton&&(this.sendButton.disabled=!0),this.input&&(this.input.disabled=!0);let a={id:`msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,role:"assistant",content:"",timestamp:new Date};this.state.messages.push(a),this.renderMessage(a,{isThinking:!0});try{await this.api.sendMessage(this.state.messages.slice(0,-1),e=>{a.content=e,this.updateMessage(a.id,e),this.scrollToBottom()})}catch(e){console.error("[RantAI Widget] Send message error:",e),this.state.messages.pop();let i=document.getElementById(a.id);i&&i.remove(),this.showError(e instanceof Error?e.message:"Failed to send message")}finally{this.state.isLoading=!1,this.sendButton&&(this.sendButton.disabled=!1),this.input&&(this.input.disabled=!1),this.updateMessage(a.id,a.content)}}escapeHtml(t){let a=document.createElement("div");return a.textContent=t,a.innerHTML}safeLinkHref(t){let a=t.trim();return!a.startsWith("http://")&&!a.startsWith("https://")?"#":a.replace(/"/g,"&quot;")}formatMessageContent(t){if(!t)return"";let a=[],e=o=>{let n=a.length;return a.push(o),`\0B${n}\0`},i=t.replace(/```(\w*)\n?([\s\S]*?)```/g,(o,n,l)=>e(`<pre><code class="language-${n||"text"}">${this.escapeHtml(l.trim())}</code></pre>`));i=i.replace(/`([^`]+?)`/g,(o,n)=>e(`<code>${this.escapeHtml(n)}</code>`)),i=this.escapeHtml(i);let s=[[/^### (.+)$/gm,"<h3>$1</h3>"],[/^## (.+)$/gm,"<h2>$1</h2>"],[/^# (.+)$/gm,"<h1>$1</h1>"],[/^&gt; (.+)$/gm,"<blockquote>$1</blockquote>"],[/^[*-] (.+)$/gm,"\0L$1\0"],[/^\d+\. (.+)$/gm,"\0L$1\0"]];for(let[o,n]of s)i=i.replace(o,n);return i=i.replace(/(\x00L[^\x00]+\x00(?:\n?))+/g,o=>`<ul>${o.split(/\x00L|\x00/).filter(Boolean).map(l=>l.trim()).filter(Boolean).map(l=>`<li>${l}</li>`).join("")}</ul>`),i=i.replace(/\*\*([^*]+?)\*\*/g,"<strong>$1</strong>"),i=i.replace(/__([^_]+?)__/g,"<strong>$1</strong>"),i=i.replace(/\*([^*\n]+?)\*/g,"<em>$1</em>"),i=i.replace(/_([^_\n]+?)_/g,"<em>$1</em>"),i=i.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g,(o,n,l)=>`<a href="${this.safeLinkHref(l)}" target="_blank" rel="noopener noreferrer">${n}</a>`),i=i.replace(/\n/g,"<br/>"),i.replace(/\x00B(\d+)\x00/g,(o,n)=>a[parseInt(n,10)]??"")}},u=null;function b(){if(u){console.warn("[RantAI Widget] Already initialized");return}let r=document.getElementsByTagName("script"),t=null,a="";for(let e=0;e<r.length;e++){let i=r[e];if(i.src.includes("rantai-widget")){t=i.getAttribute("data-api-key"),a=new URL(i.src).origin;break}}if(!t){console.error("[RantAI Widget] Missing data-api-key attribute");return}u=new c(t,a),u.init().catch(e=>{console.error("[RantAI Widget] Initialization failed:",e)})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",b):b();return W(E);})();
