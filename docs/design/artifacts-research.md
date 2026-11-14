# Artifacts: quality, design as artifact, share links, comments on a part

Research, 2026-11-14. It covers what the market does, what we have (chat artifacts in this repo, and
the design studio in agents-cloud), and a proposed direction. Market claims cite their source;
**unverified** marks claims that rest on third-party write-ups only. Code claims cite `file:line`.

## 0. Fix before anything else (security, live today)

| # | Where | Problem | Fix |
|---|---|---|---|
| 1 | agents-cloud `app/design/share/[token]/page.tsx:182` | The public share iframe uses `sandbox="allow-scripts allow-same-origin"` and is served from the **app's own origin** with no CSP. A shared design's scripts run as the app, so they can call our API with a logged-in viewer's cookies (QA TC-1643). | Remove `allow-same-origin` now. Then serve shares from a separate user-content origin (§3). |
| 2 | `src/app/api/dashboard/files/[id]/raw/route.ts:50-56` | It streams any `Document` with an `s3Key`, artifacts included, `inline`, with the stored MIME type and no CSP. An SVG artifact (`image/svg+xml`) is stored XSS on the app origin (QA TC-1633/1648 class). | Send `Content-Security-Policy: sandbox` plus `Content-Disposition: attachment` for active types. Refuse artifact rows here. |
| 3 | `chat/artifacts/renderers/r3f-renderer.tsx:585-589` | The 3D iframe has **no** sandbox ("WebGL needs it"). | Use `sandbox="allow-scripts"`, which permits WebGL, and load it from the user-content origin. |

## 1. What the leading products do

| Product | Comment or edit on a part | Share as link | Design and chat |
|---|---|---|---|
| **Claude** | Comment mode: select an element, slide or artboard, then comment. A **"Send to Claude"** checkbox turns the comment into an edit request ([support](https://support.claude.com/en/articles/17457950-use-artifacts-with-a-keyboard-or-screen-reader)). Claude Design has inline comments, direct text edits and generated sliders ([Anthropic](https://www.anthropic.com/news/claude-design-anthropic-labs)). For Motion, I found no evidence of commenting on a frame or time range. | Private by default. Shared by org, "anyone with the link" (no account needed), or invite, with Viewer, Commenter and Editor roles. Org owners control external sharing. Embeds work only on domains you list. Unpublishing deletes the stored artifact ([support](https://support.claude.com/en/articles/9547008-publish-and-share-artifacts)). | Claude Design launched as a separate product on 2026-04-17 ([TechCrunch](https://techcrunch.com/2026/04/17/anthropic-launches-claude-design-a-new-product-for-creating-quick-visuals/)) and **moved into chat on 2026-09-16**, with each piece at one shareable link ([blog](https://claude.com/blog/cowork-is-now-claude)). Motion is code-based animation with MP4 export ([article](https://claude.com/resources/articles/dashboards-and-motion)). |
| **v0** | Design Mode: select an element, then edit visually or by prompt. "Apply" writes the change back to source as a new chat version ([docs](https://v0.app/docs/quickstart)). | Publish to Vercel with a chosen visibility and domain | Every edit is a version of the chat |
| **Lovable** | Select one or more elements; they attach to the prompt. There are also annotate and comment modes ([docs](https://docs.lovable.dev/features/visual-edit)). Compile-time element ids map a selection exactly to code ([blog](https://lovable.dev/blog/visual-edits)). | — | — |
| **Figma Make** | Point at an element and prompt. A comment pins to the element **and stores a screenshot of its state at the time** ([help](https://help.figma.com/hc/en-us/articles/38701587731735-Add-comments-in-Figma-Make)). | Publish to `figma.site`; admins can turn publishing off ([FAQ](https://help.figma.com/hc/en-us/articles/31722591905559-Figma-Make-FAQs)) | — |
| **Bolt** | A select tool that walks the element tree. Visual edits are batched ([docs](https://support.bolt.new/building/visual-edits)). | Free hosting on `*.bolt.host` | — |
| **ChatGPT, Gemini** | Canvas: highlight a passage, then edit it. ChatGPT also has margin "suggest edits". | Share links, with "copy canvas" to make your own copy | **unverified**: third-party sources say ChatGPT Canvas was retired in 2026 |
| **Frame.io** (video) | Comments on one frame or on an in/out range ([help](https://support.frame.io/en/articles/3331455-commenting)) | — | — |

**A lesson from Claude's own bug:** a Claude Design issue reports that comment anchors are CSS
selectors computed in the host page. The host page cannot see inside the sandboxed preview iframe,
so every comment pins to the same piece of editor toolbar
([issue #88710](https://github.com/anthropics/claude-code/issues/88710)). **Compute the anchor inside
the sandbox and pass it out by `postMessage`.**

## 2. What we have

### Chat artifacts (this repo, about 28k lines, not yet ported to Rust)
- **12 types** (`chat/artifacts/registry.ts:64-174`): html, react, svg, mermaid, markdown, document,
  code, sheet, latex, slides, python, 3d. Each has its own prompt (3,662 lines) and validator
  (`_validate-artifact.ts`, 2,679 lines).
- **Editing:** `update_artifact` **rewrites the whole artifact** (`update-artifact.ts:34,46`). There is
  no retry loop beyond the model reading the validator's error. "Fix with AI" exists only for 3D.
  There is no model dedicated to artifacts: they use the chat model, by default `rantai/nano`
  (`chat-public/service.ts:398`).
- **Storage:** an artifact is a `Document` row plus an S3 object. Up to 20 versions are kept as
  `{key}.v{N}`. They are indexed for RAG.
- **Sharing:** no public link, no embed and no comments. Chat sharing (S5) shares the whole session
  with logged-in users.
- **Rendering:** srcdoc iframes with `allow-scripts` (html, react, slides). SVG, Mermaid and LaTeX
  are rendered into the app's own page. Only `text/document` is rendered on the server
  (docx → PDF → PNG).

### The design studio (agents-cloud, about 330k lines, an Apache-2.0 port of [Open Design](https://github.com/nexu-io/open-design))
- **Real and valuable:**
  - projects of multiple files in S3, with a run loop over SSE (`server/gateway.ts`)
  - design systems and tokens
  - a template catalogue
  - **element comments** (`web/comments.ts`: file, element, selector, position, slide index)
  - a **draw and annotate overlay with a screenshot** (`PreviewDrawOverlay.tsx`)
  - **click to edit, writing back to source** (`edit-mode/bridge.ts`, `source-patches.ts`)
  - **critique** ("Design Jury", `OdCritiqueRun`)
  - **revideo motion → MP4** (`revideo-render.ts`)
  - snapshot share links
- **Stubs**, which return empty or fixed data: live-artifacts, memory, skills, MCP, connectors,
  marketplaces, templates, prompt-templates, brands (POST is 501), deploy, routines (no scheduler),
  and the analytics and community chrome.
- **Duplicates chat:** its own conversations and messages (`OdConversation`/`OdMessage`), its own
  artifact concept, and named copies of memory, skills, MCP and agents. Since `NOTICE.md:18-19`, by
  design it does not reuse the chat artifact engine.
- **Gaps:**
  - No version history: files are overwritten, and the manifest always says `version: 1`.
  - The share has no expiry and has the sandbox hole in §0.
  - The video timeline can only play and scrub.
  - Output is `<artifact>` blocks in the reply text, not tool calls.

So two systems each have half of what we want. Chat has types, versions, tools, sessions and the
new RBAC and sharing. The studio has design systems, comments, visual edits, critique and motion.

## 3. Proposal

### 3.1 One artifact, one workspace
- **One `Artifact` model**, owned by a session:
  - immutable **versions**, each a set of files (a single-file artifact is the one-file case)
  - a `kind`: today's 12 types plus the studio's `page`, `prototype`, `deck`, `wireframe`, `motion`
  - an optional `designSystemId`
- **A design project is a chat session** whose artifact opens in an expanded **studio mode**: the canvas
  goes full width, the conversation becomes a rail, and the studio tools (design system, templates,
  critique, visual edit, timeline) sit in the canvas chrome. This is the same arrangement Claude
  reached by merging Design into chat.
- **Port the studio's working parts into the unified workspace:** comments, draw overlay, click-to-edit
  with source patches, critique, design systems, templates and revideo. **Drop the stubs.** Delete
  `OdConversation`/`OdMessage` in favour of sessions, and migrate existing `OdProject`s to sessions
  plus artifacts.
- **Port the backend to Rust** together with the conversations/artifacts work, the largest area not
  ported yet, so the artifact system is built once.

### 3.2 Comments on a part ("Send to agent")
- **The anchor is computed inside the sandbox** and sent out by `postMessage`, never computed by the
  host page. It holds:
  - `versionId` and `file`
  - a **stable source id**: a `data-rid` injected into each element when the artifact is built, mapped
    to an AST node or a source range (the Lovable approach)
  - a CSS selector, and a **text quote with prefix and suffix** (the W3C Web Annotation fallback)
  - a bounding box, and a **screenshot of the element** (Figma's approach, so the comment still reads
    well after the design changes)
  - by medium: `slideIndex` for decks; a text range for documents; **a frame number or an in/out time
    range** for motion and video (Frame.io's model, which Claude does not appear to offer)
- **A comment is either a note or an edit request.** "Send to agent" turns it into a **targeted
  patch** turn: the agent receives the anchor, the source range and the screenshot, and edits only
  that range.
- **Comments survive new versions:**
  - re-anchor by source id, then selector, then text quote
  - if none matches, mark the comment "outdated" and keep it, with its screenshot
  - resolve and reopen; threads; @mentions
- **Roles reuse the IAM work:** Viewer, Commenter and Editor on an artifact, granted to a user, a unit
  or the org, with the same unit inheritance as chat shares.

### 3.3 Share as a link
- **A separate user-content origin**, e.g. `<artifactId>.usercontent.<domain>`. Every response sends a
  `Content-Security-Policy: sandbox …` header. Iframes never use `allow-same-origin`. App cookies
  never reach that origin.
- **Publishing creates an immutable snapshot of one version.** The owner can choose "follow latest"
  instead. Unpublishing revokes the link and deletes the snapshot.
- **Access levels:**
  - private
  - org, unit or user (reusing grants and shares; login required)
  - **anyone with the link**: a token, optional expiry, optional password
  - An **org admin policy** can turn off public links; this matters for client deployments.
- **Embeds** work only on domains the owner lists. Views are audited. "Copy to my workspace" forks a
  copy, as chat shares already do.

### 3.4 Quality
Ranked by evidence (sources: research notes, `arena.ai` WebDev leaderboards):
1. **A builder model for artifacts**: route `create_artifact`, `update_artifact` and studio runs to a
   strong coding model, while chat stays on the cheaper model. The cloud plan decides which.
2. **A sandbox that runs and checks**: each session gets a microVM (CubeSandbox self-hosted, or E2B
   behind the same API; see the sandbox note in the chat log). It holds Node, Python and Chromium.
   Every artifact is built, rendered and screenshotted. Runtime errors, blank renders and overflow go
   back to the agent automatically. Real files come from real libraries (xlsx, pptx, docx, pdf, mp4).
3. **Screenshot critique, then one revision**: reuse the studio's Design Jury.
4. **Design systems and examples instead of long rule lists.** Today's prompts are 3,662 lines.
5. **Patch edits instead of full rewrites**: this falls out of §3.2's source ids.
6. **Evals**: about 60 prompts across the kinds, scored for "renders without error", rubric scores
   from screenshots, size and time. Run on every model or prompt change, like `scripts/eval-rag`.

## 4. Slices (proposed)

| # | Slice | Depends on |
|---|---|---|
| A0 | **Security fixes in §0** (TypeScript hotfix in both repos) | — |
| A1 | Artifact evals harness and baseline scores | — |
| A2 | Sandbox service behind an E2B-compatible interface. Spike: CubeSandbox on shiro (it has `/dev/kvm`) vs hosted E2B. | — |
| A3 | Unified `Artifact` and `ArtifactVersion` schema and Rust store; migrate `Document` artifacts and `OdProject`s | — |
| A4 | Rust artifact routes and tools (create, patch, versions), ported from TypeScript with parity | A3 |
| A5 | Run-and-check loop and the builder model | A2, A4 |
| A6 | User-content origin, publishing, link access, embeds | A3 |
| A7 | Comments: anchors inside the sandbox, `data-rid` injection, re-anchoring, "Send to agent" patch turns | A4 |
| A8 | Studio mode in the chat workspace; port design systems, templates, critique, visual edit, draw overlay; retire the `/design` SPA | A4, A7 |
| A9 | Motion: revideo in the sandbox, timeline with frame and range comments | A2, A7, A8 |

## 5. Decisions for the owner

1. **Studio code in the OSS repo?** Open Design is Apache-2.0, so moving its pieces into
   `rantai-agents` is allowed with NOTICE attribution. Alternatively, keep studio mode cloud-only
   behind a plug-in point.
2. **Public links on by default**, or off until an org admin enables them? Off is the safer default
   for client deployments.
3. **Sandbox backend for the cloud:** start on hosted E2B, or self-host CubeSandbox from day one?
