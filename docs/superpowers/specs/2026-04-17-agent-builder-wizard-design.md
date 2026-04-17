# Agent Builder AI-First Wizard — Design

**Date:** 2026-04-17
**Status:** Design (awaiting user review)
**Phase:** 1 of 2 (Phase 2 = editor-tab collapse, separate spec)

## Problem

The current Agent Builder at `/dashboard/agent-builder/[id]` is too hard for new users:

1. **Twelve tabs** — Configure, Model, Tools, Skills, Workflows, MCP, Knowledge, Memory, Guard Rails, Chat, Test, Deploy.
2. **No AI help during creation.** The only AI assist is an inline "Generate with AI" card on the Configure tab that generates a system prompt (+ name/emoji) from a one-line description. It does not touch model, tools, skills, MCP, KB, memory, guardrails, chat prefs, opening message, or live-chat toggle.
3. **No flag on required fields.** Schema requires `name` and `systemPrompt`, but nothing in the UI surfaces this until a save error — and there is no visual signal of per-tab completeness or deploy readiness.

## Goals

- Replace the blank-editor new-agent flow with an AI-first conversational wizard that produces a complete, valid draft.
- Let users watch the draft form in real time and reject or edit any AI suggestion before committing.
- Surface required fields explicitly (in the wizard preview *and* the existing editor).
- Zero schema migration — wizard output must be structurally identical to manual output.

## Non-Goals (Phase 2)

- Collapsing or rethinking the 12 tabs in the editor. Out of scope; Phase 2 will be informed by Phase 1 usage data.
- Replacing the existing inline "Generate with AI" card on the Configure tab. It stays for editing flows.

## Approach

Split-view wizard at `/dashboard/agent-builder/new`:

- **Left pane:** streaming chat with the wizard AI.
- **Right pane:** live draft preview that updates as the AI calls its tools.
- **Conversation shape:** AI asks 2–4 targeted follow-ups after the user's first description. The AI uses tool-calling to retrieve real org-available resources (models, tools, skills, MCP servers, KB groups) before proposing IDs — no hallucinated references.
- **Commit:** user clicks **Create Agent** once satisfied. The same save path the manual editor uses runs (`addAssistant` → bindings PUTs). User lands on `/dashboard/agent-builder/[newId]`.
- **Escape hatch:** "Skip to manual editor" at the top of the wizard creates a blank assistant and redirects.

## Architecture

### Routes

| Route | Change |
|---|---|
| `/dashboard/agent-builder/new` | **Replaced.** Renders the new split-view wizard. The blank-editor entry point is gone for new agents. |
| `/dashboard/agent-builder/[id]` | **Unchanged layout.** Gains the required-field flagging layer (inline markers + tab dots + deploy readiness). |

### Module layout (new)

```
src/features/assistants/wizard/
├── service.ts                         # orchestrates AI conversation (streaming + tool loop)
├── tools.ts                           # wizard tool definitions (server-side)
├── schema.ts                          # zod types for draft state, messages, proposals
└── components/
    ├── wizard-page-client.tsx         # split-view shell
    ├── wizard-chat.tsx                # streaming chat pane (left)
    ├── wizard-preview.tsx             # live draft card + chip lists (right)
    └── wizard-action-bar.tsx          # Create / Skip-to-manual / Start over
```

### Client state

A single reducer `useWizardDraft()` owns:

```ts
type WizardState = {
  messages: ChatMessage[]
  draft: Partial<Assistant> & {
    selectedToolIds: string[]
    selectedSkillIds: string[]
    selectedMcpServerIds: string[]
    selectedWorkflowIds: string[]
    knowledgeBaseGroupIds: string[]
  }
  uncertainty: Record<string, "locked" | "ai-suggested" | "empty">
  isStreaming: boolean
  error?: string
}
```

`uncertainty` drives chip visuals:

- `locked` — user explicitly set or confirmed. No badge.
- `ai-suggested` — AI filled it. Shows "AI-suggested" badge with reason on hover.
- `empty` — not set. Required fields render red dot; optional render muted.

Draft lives only in memory until user clicks **Create Agent**.

### Conversation design

**Opening turn (auto-sent on mount):**

> *"In a sentence or two, what do you want this agent to do?"*

**Follow-ups (AI picks 2–4 based on first answer):**

1. **Audience** — who talks to it? (internal team / customers / public)
2. **Data** — does it need access to specific knowledge? (triggers `listKnowledgeGroups`)
3. **Actions** — does it need to take actions in other systems? (triggers `listTools`, `listMcpServers`)
4. **Personality / guardrails** — any tone or off-limits topics?

**Cap:** 8 total AI turns (each "turn" = one AI response, whether text-only or containing tool calls). Typical flow is 1 opener + 2–4 follow-ups + 1 propose = 4–6 turns. If no `proposeAgent` call by turn 6, the system prompt nudges the AI to propose with current info. At turn 8, the client force-closes the stream and surfaces a "Create Agent" button with whatever draft exists.

### AI tools (wizard-only, server-side)

| Tool | Purpose | Returns |
|---|---|---|
| `listModels` | org-available models | `{id, name, functionCalling, ctxWindow}[]` |
| `listTools` | built-in + custom tools | `{id, name, description, category}[]` |
| `listSkills` | installed skills | `{id, name, summary, requiredToolIds}[]` |
| `listMcpServers` | connected MCP servers | `{id, name, toolSummary}[]` |
| `listKnowledgeGroups` | KB groups | `{id, name, docCount}[]` |
| `proposeAgent` | emits final structured draft | full `CreateAssistantInput` + bindings + `uncertainty` patch |
| `refineAgent` | partial update mid-conversation | partial draft patch + `uncertainty` patch |

Every `proposeAgent` / `refineAgent` call streams through to the client reducer and updates the live preview in real time. Skill selections auto-enable required tools (reuse existing `autoEnableToolIds` logic in `handleToggleSkill`).

### System prompt rules

The wizard system prompt lives in `wizard/service.ts`. Key rules:

- Ship an org context block (org name, user role, existing agent count, count of available tools/skills/MCP/KB — not the full list) at the start of every turn.
- Always call the relevant `listX` tool *before* suggesting IDs. Never invent IDs.
- Ask one question per turn.
- Stop after `proposeAgent` unless user asks for changes.

### Live preview panel (right pane)

Sticky on large screens; collapses to a tab on mobile. Sections:

- **Identity card** — emoji + name + description + tags. Empty fields show `—`.
- **Model chip** — model name + "AI-suggested" badge when `uncertainty=ai-suggested`. Click to open popover and change.
- **Capability chips** — 4 rows: Tools / Skills / MCP / Knowledge. Each chip removable (X), reason shown on hover. "Add" button opens existing pickers (`marketplace-picker-sheet`, skill picker, etc. — reused).
- **Advanced (collapsible)** — memory, guardrails, chat prefs, opening message/questions, live-chat toggle. Edit in place.
- **Readiness strip (bottom)** — `● Name ● Prompt ● Model ○ Opening msg`. Green when filled, muted when optional/empty, red for required-but-empty.

### API

**New endpoint:** `POST /api/assistants/wizard/stream`

- **Request:** `{ messages: ChatMessage[], draft: WizardDraft }`
- **Response:** AI SDK v6 UI-message stream (`toUIMessageStreamResponse()`, per project memory re: v6 API).
- **Auth:** session + orgContext, standard `/api/dashboard/*` pattern.
- **Tools:** executed server-side. The wizard service calls Prisma directly for `listX` tools (auth handled once, system prompt + tools bounded in one service).

**Existing endpoints:**

- `POST /api/assistants` — unchanged. Accepts wizard output as-is.
- `POST /api/assistants/generate-prompt` — kept, used from the editor's inline card when editing an existing prompt.
- `PUT /api/assistants/[id]/{tools,skills,mcp-servers,workflows}` — unchanged. Wizard uses them identically to manual flow.

**No schema changes.** Wizard output = `CreateAssistantInput` (existing schema in `src/features/assistants/core/schema.ts`).

## Required-field flags (ships in Phase 1)

Applies to both the wizard preview and the existing editor.

### Required set (Phase 1 definition)

- `name` — non-empty, trimmed
- `systemPrompt` — ≥ 20 characters
- `model` — must resolve to an available model

Additionally: if `liveChatEnabled=true`, a non-empty `openingMessage` is required (deploy gate only, not save gate).

Everything else is optional for save.

### UI surfaces

1. **Inline markers** — red `*` after the label on required fields. Below-field error text appears only after first blur or save attempt (no errors on pristine fields).
2. **Sidebar tab dots** — each of the 12 tabs in `AgentEditorLayout` shows a status dot:
   - `!` red — tab has a required-but-empty field
   - `●` solid — tab has user-filled non-default content
   - `○` hollow — tab is at defaults / empty (non-required)
3. **Deploy readiness panel** — new panel at top of the Deploy tab. Checklist of required fields; Deploy CTA disabled until all green. Save stays always-enabled.

### Implementation

- New pure helper `src/features/assistants/core/completeness.ts`:
  ```ts
  export type TabStatus = "required-missing" | "filled" | "empty"
  export function computeTabStatus(form: FormState, tab: TabId): TabStatus
  export function isDeployReady(form: FormState): { ok: boolean; missing: string[] }
  ```
- `agent-editor-layout.tsx` consumes `computeTabStatus` per tab.
- `tab-deploy.tsx` gains the readiness panel using `isDeployReady`.
- `tab-configure.tsx`, `tab-model.tsx` gain inline `*` markers on required fields.

## Data flow (wizard)

```
User types message
  ↓
POST /api/assistants/wizard/stream { messages, draft }
  ↓
Server: wizard/service.ts
  → build system prompt (org context)
  → streamText with tools (listX, proposeAgent, refineAgent)
  → AI SDK v6 tool loop, stopWhen: stepCountIs(8)
  ↓
Stream events (UI-message stream)
  → text chunks  → append to chat
  → tool-call    → surface "AI is checking <Tools>…" in chat
  → tool-result  → dispatch to reducer, update preview
  → proposeAgent → full draft merge, "Create Agent" enables
  ↓
User clicks Create Agent
  ↓
POST /api/assistants   (existing)
PUT  /api/assistants/{id}/tools        (existing)
PUT  /api/assistants/{id}/skills       (existing)
PUT  /api/assistants/{id}/mcp-servers  (existing)
PUT  /api/assistants/{id}/workflows    (existing)
  ↓
router.replace(`/dashboard/agent-builder/${newId}`)
```

## Error handling

| Failure | Handling |
|---|---|
| AI proposes unknown tool/skill/MCP/KB ID | Server validator filters unknown IDs from `proposeAgent` payload before streaming to client. Dropped IDs surface as a chat warning: *"I suggested X but couldn't find it — skipping."* |
| Streaming connection drops | Client shows reconnect banner; messages + draft preserved in reducer; user can retry last turn. |
| `POST /api/assistants` fails at commit | Keep wizard state, show inline error above Create button, allow retry. No data loss. |
| Rate limit on model | 429 from wizard stream → chat shows *"AI is busy, try again in a moment."* |
| User wants to abandon | "Skip to manual editor" creates blank assistant via existing POST and redirects; wizard state discarded. |

## Testing

- **Unit — `completeness.ts`:** table-driven tests for `computeTabStatus` and `isDeployReady` across form variations (all empty, required-only, fully filled, live-chat-enabled without opening message, etc.).
- **Unit — `wizard/service.ts` tool loop:** mock the AI SDK model, fixture conversations. Assert:
  - AI calls `listX` tools before emitting IDs in `proposeAgent`.
  - Unknown IDs in `proposeAgent` are filtered server-side.
  - Tool loop terminates by step 8.
- **Integration — `POST /api/assistants/wizard/stream`:** real DB, mocked OpenRouter. Fixture description → assert streamed `proposeAgent` payload validates against `CreateAssistantSchema`.
- **E2E (manual, documented in the plan):** fresh wizard run → land on editor with correct bindings → Deploy tab readiness flips green.

Per project memory: integration tests hit a real database, no Prisma or auth mocking.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| AI proposes unknown IDs | Tool-loop rule + server-side ID validator. Unknown IDs dropped with user-visible warning. |
| Streaming + tool-call cost spikes | Conversation capped at 8 turns. System prompt nudges propose by turn 6. |
| User prefers manual flow | "Skip to manual editor" escape hatch at top of wizard. |
| Live-preview desync with chat | Single reducer is source of truth; chat events dispatch to it, preview reads from it. |
| Phase 1 + required-field changes touch the same files as Phase 2 | Phase 2 will rewrite the tab sidebar anyway; the `computeTabStatus` helper is additive and pure, so it survives the later refactor. |

## Open questions (to resolve in plan)

- Exact model used for the wizard agent (Opus vs Sonnet tradeoff — likely Sonnet 4.6 for latency; confirm during plan).
- Whether `listTools` should include skill-bound required tools inline or require a second call.
- Mobile breakpoint behavior for the split view (tab switcher vs stack).

## Phase boundaries

**Phase 1 (this spec):**

1. Wizard route + split-view shell
2. Streaming wizard service + 5 list tools + `proposeAgent` / `refineAgent`
3. Live preview panel with chip-level reject
4. Required-field flagging (inline + tab dots + deploy readiness) in existing editor
5. "Skip to manual editor" escape hatch

**Phase 2 (future, separate spec):** collapse the 12 tabs in the editor, informed by Phase 1 usage data.
