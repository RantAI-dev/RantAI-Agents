"use strict";var RantAIWidget=(()=>{var p=Object.defineProperty;var C=Object.getOwnPropertyDescriptor;var k=Object.getOwnPropertyNames;var M=Object.prototype.hasOwnProperty;var T=(n,t)=>{for(var i in t)p(n,i,{get:t[i],enumerable:!0})},$=(n,t,i,e)=>{if(t&&typeof t=="object"||typeof t=="function")for(let a of k(t))!M.call(n,a)&&a!==i&&p(n,a,{get:()=>t[a],enumerable:!(e=C(t,a))||e.enumerable});return n};var W=n=>$(p({},"__esModule",{value:!0}),n);var E={};T(E,{RantAIWidgetInstance:()=>c,initWidget:()=>g});var l=class{constructor(t,i){this.apiKey=t,this.baseUrl=i}async getConfig(){let t=await fetch(`${this.baseUrl}/api/widget/config?key=${encodeURIComponent(this.apiKey)}`);if(!t.ok){let i=await t.json().catch(()=>({error:"Failed to load config"}));throw new Error(i.error||`HTTP ${t.status}`)}return t.json()}async sendMessage(t,i){let e=await fetch(`${this.baseUrl}/api/widget/chat`,{method:"POST",headers:{"Content-Type":"application/json","X-Widget-Api-Key":this.apiKey},body:JSON.stringify({messages:t.map(r=>({role:r.role,content:r.content}))})});if(!e.ok){let r=await e.json().catch(()=>({error:"Failed to send message"}));throw new Error(r.error||`HTTP ${e.status}`)}let a=e.body?.getReader();if(!a)throw new Error("No response body");let s=new TextDecoder,o="";for(;;){let{done:r,value:u}=await a.read();if(r)break;let m=s.decode(u,{stream:!0});o+=m,i(o)}return o}async uploadFile(t){let i=new FormData;i.append("file",t);let e=await fetch(`${this.baseUrl}/api/widget/upload`,{method:"POST",headers:{"X-Widget-Api-Key":this.apiKey},body:i});if(!e.ok){let a=await e.json().catch(()=>({error:"Upload failed"}));throw new Error(a.error||`HTTP ${e.status}`)}return e.json()}};function d(n,t){return!n||typeof n!="string"?t:/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(n)||/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+))?\s*\)$/.test(n)||["white","black","red","green","blue","gray","transparent"].includes(n.toLowerCase())?n:t}function b(n){let{theme:t,position:i}=n,e={primaryColor:d(t.primaryColor,"#3b82f6"),backgroundColor:d(t.backgroundColor,"#ffffff"),textColor:d(t.textColor,"#1f2937"),userBubbleColor:d(t.userBubbleColor,"#3b82f6"),assistantBubbleColor:d(t.assistantBubbleColor,"#f3f4f6")},a={"bottom-right":"bottom: 20px; right: 20px;","bottom-left":"bottom: 20px; left: 20px;","top-right":"top: 20px; right: 20px;","top-left":"top: 20px; left: 20px;"},s={"bottom-right":"bottom: 80px; right: 0;","bottom-left":"bottom: 80px; left: 0;","top-right":"top: 80px; right: 0;","top-left":"top: 80px; left: 0;"};return`
    .rantai-widget-container {
      position: fixed;
      z-index: 999999;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ${a[i]}
    }

    .rantai-launcher {
      width: 60px;
      height: 60px;
      border-radius: 30px;
      background: ${e.primaryColor};
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
      background: ${e.backgroundColor};
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      overflow: hidden;
      position: absolute;
      ${s[i]}
    }

    .rantai-chat-window.open {
      display: flex;
    }

    .rantai-header {
      background: ${e.primaryColor};
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
      background: ${e.backgroundColor};
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
      background: ${e.assistantBubbleColor};
      color: ${e.textColor};
      border-bottom-left-radius: 4px;
    }

    .rantai-message.user .rantai-message-bubble {
      background: ${e.userBubbleColor};
      color: white;
      border-bottom-right-radius: 4px;
    }

    .rantai-typing {
      display: flex;
      gap: 4px;
      padding: 12px 16px;
      background: ${e.assistantBubbleColor};
      border-radius: 16px;
      border-bottom-left-radius: 4px;
      width: fit-content;
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
      padding: 12px 16px;
      border-top: 1px solid #e5e7eb;
      background: ${e.backgroundColor};
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
      border-color: ${e.primaryColor};
      box-shadow: 0 0 0 3px ${e.primaryColor}20;
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
      background: ${e.backgroundColor};
      border-top: 1px solid #f3f4f6;
      flex-shrink: 0;
    }

    .rantai-powered a {
      color: ${e.primaryColor};
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
`;var c=class{constructor(t,i){this.config=null;this.container=null;this.chatWindow=null;this.messagesContainer=null;this.input=null;this.state={isOpen:!1,isLoading:!1,messages:[],error:null};this.api=new l(t,i)}async init(){try{this.config=await this.api.getConfig(),this.injectStyles(),this.createUI(),this.addMessage("assistant",this.config.config.welcomeMessage),console.log("[RantAI Widget] Initialized successfully")}catch(t){throw console.error("[RantAI Widget] Failed to initialize:",t),t}}injectStyles(){if(!this.config)return;let t="rantai-widget-styles";if(document.getElementById(t))return;let i=document.createElement("style");i.id=t,i.textContent=b(this.config.config),document.head.appendChild(i)}createUI(){if(!this.config)return;this.container=document.createElement("div"),this.container.id="rantai-widget",this.container.className=`rantai-widget-container ${this.config.config.customCssClass||""}`;let t=document.createElement("button");t.className="rantai-launcher",t.setAttribute("aria-label","Open chat"),t.innerHTML=x,t.onclick=()=>this.toggle(),this.chatWindow=document.createElement("div"),this.chatWindow.className="rantai-chat-window",this.chatWindow.innerHTML=this.createChatWindowHTML(),this.container.appendChild(t),this.container.appendChild(this.chatWindow),document.body.appendChild(this.container),this.messagesContainer=this.chatWindow.querySelector(".rantai-messages"),this.input=this.chatWindow.querySelector(".rantai-input"),this.bindEvents()}createChatWindowHTML(){if(!this.config)return"";let{config:t,assistantName:i,assistantEmoji:e}=this.config,a=t.avatar||e,s=y=>y.replace(/[&<>"']/g,f=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[f]||f),o=this.escapeHtml(t.headerTitle||i),r=s(t.placeholderText);return`
      <div class="rantai-header">
        <div class="rantai-header-info">
          <div class="rantai-header-avatar">${a.startsWith("http://")||a.startsWith("https://")?`<img src="${s(a)}" alt="" style="width: 100%; height: 100%; border-radius: 50%;">`:this.escapeHtml(a)}</div>
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
              placeholder="${r}"
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
    `}bindEvents(){if(!this.chatWindow||!this.input)return;let t=this.chatWindow.querySelector(".rantai-close");t&&t.addEventListener("click",()=>this.close());let i=this.chatWindow.querySelector(".rantai-input-form");i&&i.addEventListener("submit",e=>{e.preventDefault(),this.sendMessage()}),this.input.addEventListener("input",()=>{this.input&&(this.input.style.height="auto",this.input.style.height=Math.min(this.input.scrollHeight,120)+"px")}),this.input.addEventListener("keydown",e=>{e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),this.sendMessage())})}toggle(){this.state.isOpen?this.close():this.open()}open(){this.state.isOpen=!0,this.chatWindow?.classList.add("open"),this.input?.focus()}close(){this.state.isOpen=!1,this.chatWindow?.classList.remove("open")}addMessage(t,i){let e={id:`msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,role:t,content:i,timestamp:new Date};return this.state.messages.push(e),this.renderMessage(e),this.scrollToBottom(),e}renderMessage(t){if(!this.messagesContainer)return;let i=document.createElement("div");i.className=`rantai-message ${t.role}`,i.id=t.id,i.innerHTML=`
      <div class="rantai-message-bubble">${this.escapeHtml(t.content)}</div>
    `,this.messagesContainer.appendChild(i)}updateMessage(t,i){let e=document.getElementById(t);if(!e)return;let a=e.querySelector(".rantai-message-bubble");a&&(a.textContent=i)}showTypingIndicator(){if(!this.messagesContainer)return document.createElement("div");let t=document.createElement("div");return t.className="rantai-message assistant",t.id="rantai-typing",t.innerHTML=`
      <div class="rantai-typing">
        <span></span><span></span><span></span>
      </div>
    `,this.messagesContainer.appendChild(t),this.scrollToBottom(),t}hideTypingIndicator(){let t=document.getElementById("rantai-typing");t&&t.remove()}showError(t){if(!this.messagesContainer)return;let i=this.messagesContainer.querySelector(".rantai-error");i&&i.remove();let e=document.createElement("div");e.className="rantai-error",e.textContent=t,this.messagesContainer.appendChild(e),this.scrollToBottom(),setTimeout(()=>e.remove(),5e3)}scrollToBottom(){this.messagesContainer&&(this.messagesContainer.scrollTop=this.messagesContainer.scrollHeight)}async sendMessage(){if(!this.input||this.state.isLoading)return;let t=this.input.value.trim();if(t){this.input.value="",this.input.style.height="auto",this.addMessage("user",t),this.state.isLoading=!0,this.showTypingIndicator();try{let i={id:`msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,role:"assistant",content:"",timestamp:new Date};this.hideTypingIndicator(),this.state.messages.push(i),this.renderMessage(i),await this.api.sendMessage(this.state.messages.slice(0,-1),e=>{i.content=e,this.updateMessage(i.id,e),this.scrollToBottom()})}catch(i){this.hideTypingIndicator(),console.error("[RantAI Widget] Send message error:",i),this.showError(i instanceof Error?i.message:"Failed to send message")}finally{this.state.isLoading=!1}}}escapeHtml(t){let i=document.createElement("div");return i.textContent=t,i.innerHTML}},h=null;function g(){if(h){console.warn("[RantAI Widget] Already initialized");return}let n=document.getElementsByTagName("script"),t=null,i="";for(let e=0;e<n.length;e++){let a=n[e];if(a.src.includes("rantai-widget")){t=a.getAttribute("data-api-key"),i=new URL(a.src).origin;break}}if(!t){console.error("[RantAI Widget] Missing data-api-key attribute");return}h=new c(t,i),h.init().catch(e=>{console.error("[RantAI Widget] Initialization failed:",e)})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",g):g();return W(E);})();
