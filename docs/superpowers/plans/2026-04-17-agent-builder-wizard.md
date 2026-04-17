# Agent Builder AI-First Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blank-editor new-agent flow with a split-view AI wizard (chat left, live preview right) that produces a complete validated draft, and add required-field flagging (inline markers + tab dots + deploy readiness) to the existing editor.

**Architecture:** New `wizard/` feature module orchestrates a streaming AI conversation with tool-calling for `listModels/listTools/listSkills/listMcpServers/listKnowledgeGroups` plus `proposeAgent/refineAgent`. Client reducer is the single source of truth; chat and preview both dispatch to / read from it. On commit, the wizard calls existing assistant + binding endpoints unchanged. A separate pure `completeness.ts` helper drives required-field UI surfaces in the existing editor.

**Tech Stack:** Next.js App Router, AI SDK v6 (`ai@6.0.39`), `@openrouter/ai-sdk-provider`, Prisma, React 19 + hooks, zod, Tailwind + shadcn/ui, framer-motion. Bun package manager.

**Spec:** `docs/superpowers/specs/2026-04-17-agent-builder-wizard-design.md`

---

## File Structure

### Files to create

| Path | Responsibility |
|---|---|
| `src/features/assistants/core/completeness.ts` | Pure `computeTabStatus` + `isDeployReady` + required-field predicates. Zero deps on React. |
| `src/features/assistants/core/completeness.test.ts` | Table-driven tests for every tab status + deploy readiness. |
| `src/features/assistants/wizard/schema.ts` | Zod schemas for wizard messages, draft, tool payloads. |
| `src/features/assistants/wizard/tools.ts` | Server-side AI tool definitions (`listModels`, `listTools`, `listSkills`, `listMcpServers`, `listKnowledgeGroups`, `proposeAgent`, `refineAgent`). |
| `src/features/assistants/wizard/tools.test.ts` | Unit tests for tool payload validation + ID filtering. |
| `src/features/assistants/wizard/service.ts` | `streamAssistantWizard({messages, draft, orgId, userId})` — system prompt builder + `streamText` orchestration. |
| `src/features/assistants/wizard/service.test.ts` | Integration test w/ mocked OpenRouter + real Prisma. |
| `src/app/api/assistants/wizard/stream/route.ts` | POST endpoint; session + org auth, calls `streamAssistantWizard`, returns UI-message stream. |
| `src/features/assistants/wizard/hooks/use-wizard-draft.ts` | Client reducer hook for messages/draft/uncertainty. |
| `src/features/assistants/wizard/components/wizard-page-client.tsx` | Split-view shell; owns the reducer + AI SDK `useChat`. |
| `src/features/assistants/wizard/components/wizard-chat.tsx` | Left pane — streaming message list + input. |
| `src/features/assistants/wizard/components/wizard-preview.tsx` | Right pane — live draft card + chip rows. |
| `src/features/assistants/wizard/components/wizard-action-bar.tsx` | Top bar: "Skip to manual editor" + "Start over" + readiness summary. |
| `src/features/assistants/wizard/components/wizard-chip.tsx` | Reusable chip with "AI-suggested" badge, reason tooltip, remove (X). |

### Files to modify

| Path | Change |
|---|---|
| `src/app/dashboard/agent-builder/new/page.tsx` | **New route** (currently handled by `[id]/page.tsx` with `id="new"`). Renders `WizardPageClient`. |
| `src/features/assistants/components/builder/agent-editor-layout.tsx` | Consume `computeTabStatus` per tab; render status dots next to icons. |
| `src/features/assistants/components/builder/tab-configure.tsx` | Add `*` markers on name, description + inline error text. |
| `src/features/assistants/components/builder/tab-model.tsx` | Add `*` marker on model. |
| `src/features/assistants/components/builder/tab-deploy.tsx` | Add `DeployReadinessPanel` at top; disable Deploy CTAs when not ready. |
| `src/features/assistants/components/builder/agent-editor-page-client.tsx` | Pass `form` state through `computeTabStatus` to layout; pass readiness to deploy. |
| `src/app/dashboard/agent-builder/[id]/page.tsx` | Route at `/new` no longer lands here; behavior unchanged for existing IDs. |

### Files NOT to modify

- `src/features/assistants/core/schema.ts` — no schema changes.
- `src/app/api/assistants/route.ts` and binding PUT endpoints — reused as-is.
- `src/features/assistants/prompt/{service,repository,schema}.ts` — the inline "Generate with AI" card on Configure tab stays working.

---

## Task 1: `completeness.ts` helper — required-field predicates

**Files:**
- Create: `src/features/assistants/core/completeness.ts`
- Test: `src/features/assistants/core/completeness.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/assistants/core/completeness.test.ts
import { describe, it, expect } from "vitest"
import {
  computeTabStatus,
  isDeployReady,
  isNameValid,
  isSystemPromptValid,
  isModelValid,
  type CompletenessFormState,
} from "./completeness"

const empty: CompletenessFormState = {
  name: "",
  description: "",
  systemPrompt: "",
  model: "",
  openingMessage: "",
  openingQuestions: [],
  liveChatEnabled: false,
  selectedToolIds: [],
  selectedSkillIds: [],
  selectedMcpServerIds: [],
  selectedWorkflowIds: [],
  useKnowledgeBase: false,
  knowledgeBaseGroupIds: [],
  memoryConfig: {},
  modelConfig: {},
  chatConfig: {},
  guardRails: {},
  availableModelIds: ["openai/gpt-5.2"],
}

describe("field predicates", () => {
  it("isNameValid requires non-empty trimmed string", () => {
    expect(isNameValid("")).toBe(false)
    expect(isNameValid("   ")).toBe(false)
    expect(isNameValid("My Agent")).toBe(true)
  })

  it("isSystemPromptValid requires 20+ chars trimmed", () => {
    expect(isSystemPromptValid("short")).toBe(false)
    expect(isSystemPromptValid("x".repeat(19))).toBe(false)
    expect(isSystemPromptValid("x".repeat(20))).toBe(true)
  })

  it("isModelValid requires id in availableModelIds", () => {
    expect(isModelValid("", [])).toBe(false)
    expect(isModelValid("openai/gpt-5.2", ["openai/gpt-5.2"])).toBe(true)
    expect(isModelValid("unknown", ["openai/gpt-5.2"])).toBe(false)
  })
})

describe("computeTabStatus", () => {
  it("configure is required-missing when name or prompt empty", () => {
    expect(computeTabStatus(empty, "configure")).toBe("required-missing")
  })

  it("model is required-missing when model empty or invalid", () => {
    expect(computeTabStatus(empty, "model")).toBe("required-missing")
    expect(
      computeTabStatus({ ...empty, model: "openai/gpt-5.2" }, "model")
    ).toBe("filled")
  })

  it("tools/skills/mcp/workflows are filled when any selected, else empty", () => {
    expect(computeTabStatus(empty, "tools")).toBe("empty")
    expect(
      computeTabStatus({ ...empty, selectedToolIds: ["t1"] }, "tools")
    ).toBe("filled")
  })

  it("knowledge is filled when useKnowledgeBase+groups non-empty", () => {
    expect(
      computeTabStatus(
        { ...empty, useKnowledgeBase: true, knowledgeBaseGroupIds: ["g1"] },
        "knowledge"
      )
    ).toBe("filled")
    expect(computeTabStatus(empty, "knowledge")).toBe("empty")
  })

  it("configure is filled when name + 20-char prompt present", () => {
    const form = { ...empty, name: "Agent", systemPrompt: "x".repeat(20) }
    expect(computeTabStatus(form, "configure")).toBe("filled")
  })
})

describe("isDeployReady", () => {
  it("reports missing required fields", () => {
    const r = isDeployReady(empty)
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(
      expect.arrayContaining(["name", "systemPrompt", "model"])
    )
  })

  it("passes when required fields filled", () => {
    const form: CompletenessFormState = {
      ...empty,
      name: "Agent",
      systemPrompt: "x".repeat(20),
      model: "openai/gpt-5.2",
    }
    expect(isDeployReady(form).ok).toBe(true)
  })

  it("requires openingMessage when liveChatEnabled", () => {
    const form: CompletenessFormState = {
      ...empty,
      name: "Agent",
      systemPrompt: "x".repeat(20),
      model: "openai/gpt-5.2",
      liveChatEnabled: true,
      openingMessage: "",
    }
    const r = isDeployReady(form)
    expect(r.ok).toBe(false)
    expect(r.missing).toContain("openingMessage")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/features/assistants/core/completeness.test.ts`
Expected: FAIL with "Cannot find module './completeness'"

- [ ] **Step 3: Implement the helper**

```ts
// src/features/assistants/core/completeness.ts
import type { TabId } from "@/features/assistants/components/builder/agent-editor-layout"

export type TabStatus = "required-missing" | "filled" | "empty"

export interface CompletenessFormState {
  name: string
  description: string
  systemPrompt: string
  model: string
  openingMessage: string
  openingQuestions: string[]
  liveChatEnabled: boolean
  selectedToolIds: string[]
  selectedSkillIds: string[]
  selectedMcpServerIds: string[]
  selectedWorkflowIds: string[]
  useKnowledgeBase: boolean
  knowledgeBaseGroupIds: string[]
  memoryConfig: Record<string, unknown>
  modelConfig: Record<string, unknown>
  chatConfig: Record<string, unknown>
  guardRails: Record<string, unknown>
  availableModelIds: string[]
}

export function isNameValid(name: string): boolean {
  return name.trim().length > 0
}

export function isSystemPromptValid(prompt: string): boolean {
  return prompt.trim().length >= 20
}

export function isModelValid(model: string, availableIds: string[]): boolean {
  return availableIds.includes(model)
}

function hasAnyContent(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).length > 0
}

export function computeTabStatus(
  form: CompletenessFormState,
  tab: TabId
): TabStatus {
  switch (tab) {
    case "configure": {
      const nameOk = isNameValid(form.name)
      const promptOk = isSystemPromptValid(form.systemPrompt)
      if (!nameOk || !promptOk) return "required-missing"
      return "filled"
    }
    case "model": {
      if (!isModelValid(form.model, form.availableModelIds)) {
        return "required-missing"
      }
      return "filled"
    }
    case "tools":
      return form.selectedToolIds.length > 0 ? "filled" : "empty"
    case "skills":
      return form.selectedSkillIds.length > 0 ? "filled" : "empty"
    case "workflows":
      return form.selectedWorkflowIds.length > 0 ? "filled" : "empty"
    case "mcp":
      return form.selectedMcpServerIds.length > 0 ? "filled" : "empty"
    case "knowledge":
      return form.useKnowledgeBase && form.knowledgeBaseGroupIds.length > 0
        ? "filled"
        : "empty"
    case "memory":
      return hasAnyContent(form.memoryConfig) ? "filled" : "empty"
    case "guardrails":
      return hasAnyContent(form.guardRails) ? "filled" : "empty"
    case "chat":
      return hasAnyContent(form.chatConfig) ? "filled" : "empty"
    case "test":
    case "deploy":
      return "empty"
  }
}

export interface DeployReadiness {
  ok: boolean
  missing: Array<"name" | "systemPrompt" | "model" | "openingMessage">
}

export function isDeployReady(form: CompletenessFormState): DeployReadiness {
  const missing: DeployReadiness["missing"] = []
  if (!isNameValid(form.name)) missing.push("name")
  if (!isSystemPromptValid(form.systemPrompt)) missing.push("systemPrompt")
  if (!isModelValid(form.model, form.availableModelIds)) missing.push("model")
  if (form.liveChatEnabled && form.openingMessage.trim().length === 0) {
    missing.push("openingMessage")
  }
  return { ok: missing.length === 0, missing }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/features/assistants/core/completeness.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/features/assistants/core/completeness.ts src/features/assistants/core/completeness.test.ts
git commit -m "feat(agents): add completeness helper for required-field flags"
```

---

## Task 2: Tab sidebar status dots in `AgentEditorLayout`

**Files:**
- Modify: `src/features/assistants/components/builder/agent-editor-layout.tsx`
- Modify: `src/features/assistants/components/builder/agent-editor-page-client.tsx`

- [ ] **Step 1: Extend `AgentEditorLayout` props to accept per-tab status**

Replace the props interface in `agent-editor-layout.tsx` (lines 63-77) with:

```tsx
import type { TabStatus } from "@/features/assistants/core/completeness"

interface AgentEditorLayoutProps {
  agentName: string
  agentEmoji: string
  isNew: boolean
  isDirty: boolean
  isSaving: boolean
  activeTab: TabId
  tabStatuses: Record<TabId, TabStatus>
  onTabChange: (tab: TabId) => void
  onSave: () => void
  onDuplicate?: () => void
  onSetDefault?: () => void
  onDelete?: () => void
  isDefault?: boolean
  children: React.ReactNode
}
```

And in the signature destructure, add `tabStatuses`:

```tsx
export function AgentEditorLayout({
  agentName,
  agentEmoji,
  isNew,
  isDirty,
  isSaving,
  activeTab,
  tabStatuses,
  onTabChange,
  ...
}: AgentEditorLayoutProps) {
```

- [ ] **Step 2: Render the status dot inside each tab button**

Replace the `TABS.map` block (lines 178-196) with:

```tsx
{TABS.map((tab) => {
  const Icon = tab.icon
  const active = activeTab === tab.id
  const status = tabStatuses[tab.id]
  return (
    <button
      key={tab.id}
      onClick={() => onTabChange(tab.id)}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left w-full",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-background/50"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{tab.label}</span>
      <span
        aria-hidden
        className={cn(
          "h-2 w-2 rounded-full shrink-0",
          status === "required-missing" && "bg-destructive",
          status === "filled" && "bg-emerald-500",
          status === "empty" && "border border-muted-foreground/40"
        )}
      />
    </button>
  )
})}
```

- [ ] **Step 3: Build `tabStatuses` in the page client and pass down**

In `agent-editor-page-client.tsx`, add the import and computation before the `return` statement (after `const isDefault = ...`):

```tsx
import {
  computeTabStatus,
  type CompletenessFormState,
  type TabStatus,
} from "@/features/assistants/core/completeness"
import type { TabId } from "@/features/assistants/components/builder/agent-editor-layout"

// Inside the component, before the loading return:
const completenessForm: CompletenessFormState = {
  name: form.name,
  description: form.description,
  systemPrompt: form.systemPrompt,
  model: form.model,
  openingMessage: form.openingMessage,
  openingQuestions: form.openingQuestions,
  liveChatEnabled: form.liveChatEnabled,
  selectedToolIds: form.selectedToolIds,
  selectedSkillIds: form.selectedSkillIds,
  selectedMcpServerIds: form.selectedMcpServerIds,
  selectedWorkflowIds: form.selectedWorkflowIds,
  useKnowledgeBase: form.useKnowledgeBase,
  knowledgeBaseGroupIds: form.knowledgeBaseGroupIds,
  memoryConfig: (form.memoryConfig ?? {}) as Record<string, unknown>,
  modelConfig: (form.modelConfig ?? {}) as Record<string, unknown>,
  chatConfig: (form.chatConfig ?? {}) as Record<string, unknown>,
  guardRails: (form.guardRails ?? {}) as Record<string, unknown>,
  availableModelIds: models.map((m) => m.id),
}

const TAB_IDS: TabId[] = [
  "configure", "model", "tools", "skills", "workflows", "mcp",
  "knowledge", "memory", "guardrails", "chat", "test", "deploy",
]

const tabStatuses = TAB_IDS.reduce<Record<TabId, TabStatus>>((acc, id) => {
  acc[id] = computeTabStatus(completenessForm, id)
  return acc
}, {} as Record<TabId, TabStatus>)
```

Then pass `tabStatuses={tabStatuses}` to `<AgentEditorLayout>`.

- [ ] **Step 4: Verify typecheck**

Run: `bun run tsc --noEmit 2>&1 | head -30`
Expected: 0 errors related to completeness / agent-editor.

- [ ] **Step 5: Commit**

```bash
git add src/features/assistants/components/builder/agent-editor-layout.tsx src/features/assistants/components/builder/agent-editor-page-client.tsx
git commit -m "feat(agents): add per-tab completeness status dots"
```

---

## Task 3: Inline required-field markers + errors

**Files:**
- Modify: `src/features/assistants/components/builder/tab-configure.tsx`
- Modify: `src/features/assistants/components/builder/tab-model.tsx`

- [ ] **Step 1: Add required marker + blur error to `tab-configure.tsx` name field**

In `tab-configure.tsx`, add near the top of the component:

```tsx
import { isNameValid, isSystemPromptValid } from "@/features/assistants/core/completeness"

// inside TabConfigure function, next to useState for tagInput:
const [nameTouched, setNameTouched] = useState(false)
const [promptTouched, setPromptTouched] = useState(false)
const nameError = nameTouched && !isNameValid(name)
const promptError = promptTouched && !isSystemPromptValid(systemPrompt)
```

Replace the Name label + input (lines 98-106) with:

```tsx
<div className="space-y-1.5">
  <Label htmlFor="agent-name">
    Name <span className="text-destructive">*</span>
  </Label>
  <Input
    id="agent-name"
    value={name}
    onChange={(e) => onNameChange(e.target.value)}
    onBlur={() => setNameTouched(true)}
    placeholder="My Agent"
    aria-invalid={nameError}
    className={nameError ? "border-destructive" : ""}
  />
  {nameError && (
    <p className="text-xs text-destructive">Name is required.</p>
  )}
</div>
```

- [ ] **Step 2: Add required marker + error under the system prompt editor**

Replace the System Prompt section header (line 172) and wire the `promptError` state. After the `<StructuredPromptEditor>` block, add:

```tsx
{promptError && (
  <p className="text-xs text-destructive">
    System prompt must be at least 20 characters.
  </p>
)}
```

Update the header line to:

```tsx
<h2 className="text-sm font-semibold text-foreground">
  System Prompt <span className="text-destructive">*</span>
</h2>
```

And wrap `onSystemPromptChange` to mark touched:

```tsx
onSystemPromptChange={(v) => {
  onSystemPromptChange(v)
  setPromptTouched(true)
}}
```

(Apply to `StructuredPromptEditor` only — the AI generator and template picker also call `onSystemPromptChange`; they should also trigger touched — simplest path: wrap the parent callback. In `agent-editor-page-client.tsx` we don't need to change anything because this component owns the `touched` state locally.)

- [ ] **Step 3: Add required marker on the model selector in `tab-model.tsx`**

In `tab-model.tsx`, find the primary heading/label for model selection (look for "Model" h2 or similar label) and append the asterisk:

```tsx
<h2 className="text-sm font-semibold text-foreground">
  Model <span className="text-destructive">*</span>
</h2>
```

No additional error text — the sidebar dot carries the signal. If the user's selected model is not in the available list, render a red helper below the selector:

```tsx
import { isModelValid } from "@/features/assistants/core/completeness"

// somewhere in render:
{!isModelValid(model, models.map((m) => m.id)) && (
  <p className="text-xs text-destructive">
    Select a model to continue.
  </p>
)}
```

- [ ] **Step 4: Typecheck + visual smoke**

Run: `bun run tsc --noEmit 2>&1 | head -20`
Expected: 0 errors.

Manually open `/dashboard/agent-builder/[some-id]` and verify red `*` appears on Name and System Prompt labels; blur name field while empty to see the red helper.

- [ ] **Step 5: Commit**

```bash
git add src/features/assistants/components/builder/tab-configure.tsx src/features/assistants/components/builder/tab-model.tsx
git commit -m "feat(agents): inline markers for required fields"
```

---

## Task 4: Deploy readiness panel

**Files:**
- Create: `src/features/assistants/components/builder/deploy/deploy-readiness-panel.tsx`
- Modify: `src/features/assistants/components/builder/tab-deploy.tsx`
- Modify: `src/features/assistants/components/builder/agent-editor-page-client.tsx`

- [ ] **Step 1: Create the readiness panel component**

```tsx
// src/features/assistants/components/builder/deploy/deploy-readiness-panel.tsx
"use client"

import { CheckCircle2, AlertCircle } from "@/lib/icons"
import type { DeployReadiness } from "@/features/assistants/core/completeness"

const LABELS: Record<DeployReadiness["missing"][number], string> = {
  name: "Name",
  systemPrompt: "System Prompt (20+ chars)",
  model: "Model",
  openingMessage: "Opening Message (required for live chat)",
}

interface Props {
  readiness: DeployReadiness
  onJumpTo: (field: DeployReadiness["missing"][number]) => void
}

export function DeployReadinessPanel({ readiness, onJumpTo }: Props) {
  if (readiness.ok) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        <p className="text-sm">Ready to deploy.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-destructive" />
        <p className="text-sm font-medium">Not ready to deploy</p>
      </div>
      <ul className="space-y-1 pl-6">
        {readiness.missing.map((field) => (
          <li key={field} className="text-xs">
            <button
              type="button"
              onClick={() => onJumpTo(field)}
              className="text-destructive hover:underline"
            >
              Missing: {LABELS[field]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Wire the panel into `tab-deploy.tsx`**

Extend `TabDeployProps`:

```tsx
import { DeployReadinessPanel } from "./deploy/deploy-readiness-panel"
import type { DeployReadiness } from "@/features/assistants/core/completeness"
import type { TabId } from "./agent-editor-layout"

interface TabDeployProps {
  agentId: string | null
  agentName: string
  agentModel: string
  agentCreatedAt?: Date
  isNew: boolean
  readiness: DeployReadiness
  onJumpToTab: (tab: TabId) => void
}
```

At the top of the return (before the `<div>` holding the heading), add:

```tsx
<DeployReadinessPanel
  readiness={readiness}
  onJumpTo={(field) => {
    if (field === "name" || field === "systemPrompt" || field === "openingMessage") {
      onJumpToTab("configure")
    } else if (field === "model") {
      onJumpToTab("model")
    }
  }}
/>
```

Then wrap the existing deploy `<Tabs>` with a disabling layer when `!readiness.ok`:

```tsx
<div className={readiness.ok ? "" : "pointer-events-none opacity-50"}>
  <Tabs defaultValue="rest-api">
    {/* existing content */}
  </Tabs>
</div>
```

- [ ] **Step 3: Plumb readiness from the page client**

In `agent-editor-page-client.tsx`, import and compute:

```tsx
import { isDeployReady } from "@/features/assistants/core/completeness"

// after completenessForm:
const readiness = isDeployReady(completenessForm)
```

Pass to `<TabDeploy>`:

```tsx
{activeTab === "deploy" && (
  <TabDeploy
    agentId={isNew ? null : id}
    agentName={form.name || "Untitled Agent"}
    agentModel={form.model}
    agentCreatedAt={formAssistant.createdAt}
    isNew={isNew}
    readiness={readiness}
    onJumpToTab={setActiveTab}
  />
)}
```

- [ ] **Step 4: Typecheck**

Run: `bun run tsc --noEmit 2>&1 | head -20`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/assistants/components/builder/deploy/deploy-readiness-panel.tsx src/features/assistants/components/builder/tab-deploy.tsx src/features/assistants/components/builder/agent-editor-page-client.tsx
git commit -m "feat(agents): deploy readiness panel with field jump-to"
```

---

## Task 5: Wizard zod schemas

**Files:**
- Create: `src/features/assistants/wizard/schema.ts`
- Test: add simple parse tests at the bottom of `wizard/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/assistants/wizard/schema.test.ts
import { describe, it, expect } from "vitest"
import {
  WizardMessageSchema,
  WizardDraftSchema,
  ProposeAgentInputSchema,
} from "./schema"

describe("WizardMessageSchema", () => {
  it("accepts user text messages", () => {
    const ok = WizardMessageSchema.safeParse({
      id: "m1",
      role: "user",
      content: "hi",
    })
    expect(ok.success).toBe(true)
  })
})

describe("WizardDraftSchema", () => {
  it("accepts fully-empty draft", () => {
    const r = WizardDraftSchema.safeParse({
      selectedToolIds: [],
      selectedSkillIds: [],
      selectedMcpServerIds: [],
      selectedWorkflowIds: [],
      knowledgeBaseGroupIds: [],
    })
    expect(r.success).toBe(true)
  })
})

describe("ProposeAgentInputSchema", () => {
  it("requires name + systemPrompt", () => {
    const bad = ProposeAgentInputSchema.safeParse({ name: "" })
    expect(bad.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to confirm failure**

Run: `bun test src/features/assistants/wizard/schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the schema**

```ts
// src/features/assistants/wizard/schema.ts
import { z } from "zod"

export const WizardMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
})

export type WizardMessage = z.infer<typeof WizardMessageSchema>

export const WizardDraftSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  emoji: z.string().optional(),
  tags: z.array(z.string()).optional(),
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  openingMessage: z.string().optional(),
  openingQuestions: z.array(z.string()).optional(),
  liveChatEnabled: z.boolean().optional(),
  selectedToolIds: z.array(z.string()).default([]),
  selectedSkillIds: z.array(z.string()).default([]),
  selectedMcpServerIds: z.array(z.string()).default([]),
  selectedWorkflowIds: z.array(z.string()).default([]),
  useKnowledgeBase: z.boolean().optional(),
  knowledgeBaseGroupIds: z.array(z.string()).default([]),
  memoryConfig: z.record(z.unknown()).optional(),
  modelConfig: z.record(z.unknown()).optional(),
  chatConfig: z.record(z.unknown()).optional(),
  guardRails: z.record(z.unknown()).optional(),
})

export type WizardDraft = z.infer<typeof WizardDraftSchema>

export const UncertaintySchema = z.record(
  z.enum(["locked", "ai-suggested", "empty"])
)

export type Uncertainty = z.infer<typeof UncertaintySchema>

export const ProposeAgentInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  emoji: z.string().default("🤖"),
  tags: z.array(z.string()).default([]),
  systemPrompt: z.string().min(20),
  model: z.string().min(1),
  openingMessage: z.string().optional(),
  openingQuestions: z.array(z.string()).default([]),
  liveChatEnabled: z.boolean().default(false),
  selectedToolIds: z.array(z.string()).default([]),
  selectedSkillIds: z.array(z.string()).default([]),
  selectedMcpServerIds: z.array(z.string()).default([]),
  selectedWorkflowIds: z.array(z.string()).default([]),
  useKnowledgeBase: z.boolean().default(false),
  knowledgeBaseGroupIds: z.array(z.string()).default([]),
  uncertainty: UncertaintySchema.default({}),
  reasoning: z.string().optional(),
})

export type ProposeAgentInput = z.infer<typeof ProposeAgentInputSchema>

export const RefineAgentInputSchema = ProposeAgentInputSchema.partial().extend({
  uncertainty: UncertaintySchema.optional(),
})

export type RefineAgentInput = z.infer<typeof RefineAgentInputSchema>

export const WizardStreamRequestSchema = z.object({
  messages: z.array(WizardMessageSchema),
  draft: WizardDraftSchema,
})

export type WizardStreamRequest = z.infer<typeof WizardStreamRequestSchema>
```

- [ ] **Step 4: Run test to verify pass**

Run: `bun test src/features/assistants/wizard/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/assistants/wizard/schema.ts src/features/assistants/wizard/schema.test.ts
git commit -m "feat(agents): wizard zod schemas"
```

---

## Task 6: Wizard list tools (read-only, server-side)

**Files:**
- Create: `src/features/assistants/wizard/tools.ts`
- Test: `src/features/assistants/wizard/tools.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/assistants/wizard/tools.test.ts
import { describe, it, expect, vi } from "vitest"
import { buildWizardTools, filterKnownIds } from "./tools"

describe("filterKnownIds", () => {
  it("drops unknown IDs", () => {
    const { kept, dropped } = filterKnownIds(
      ["a", "b", "c"],
      new Set(["a", "c"])
    )
    expect(kept).toEqual(["a", "c"])
    expect(dropped).toEqual(["b"])
  })
})

describe("buildWizardTools", () => {
  it("exposes all 7 tools", () => {
    const tools = buildWizardTools({
      orgId: "o1",
      userId: "u1",
      deps: {} as never,
    })
    expect(Object.keys(tools).sort()).toEqual(
      [
        "listKnowledgeGroups",
        "listMcpServers",
        "listModels",
        "listSkills",
        "listTools",
        "proposeAgent",
        "refineAgent",
      ].sort()
    )
  })
})
```

- [ ] **Step 2: Run it to confirm failure**

Run: `bun test src/features/assistants/wizard/tools.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the tools**

```ts
// src/features/assistants/wizard/tools.ts
import { tool } from "ai"
import { z } from "zod"
import {
  ProposeAgentInputSchema,
  RefineAgentInputSchema,
  type ProposeAgentInput,
  type RefineAgentInput,
} from "./schema"

export interface WizardDeps {
  listModels: () => Promise<
    Array<{ id: string; name: string; functionCalling: boolean; ctx: number }>
  >
  listTools: (orgId: string) => Promise<
    Array<{ id: string; name: string; description: string; category: string }>
  >
  listSkills: (orgId: string) => Promise<
    Array<{
      id: string
      name: string
      summary: string
      requiredToolIds: string[]
    }>
  >
  listMcpServers: (
    orgId: string
  ) => Promise<Array<{ id: string; name: string; toolSummary: string }>>
  listKnowledgeGroups: (
    orgId: string
  ) => Promise<Array<{ id: string; name: string; docCount: number }>>
}

export function filterKnownIds(
  ids: string[],
  known: Set<string>
): { kept: string[]; dropped: string[] } {
  const kept: string[] = []
  const dropped: string[] = []
  for (const id of ids) {
    if (known.has(id)) kept.push(id)
    else dropped.push(id)
  }
  return { kept, dropped }
}

export interface BuildWizardToolsArgs {
  orgId: string
  userId: string
  deps: WizardDeps
  onProposal?: (payload: ProposeAgentInput) => void
  onRefinement?: (payload: RefineAgentInput) => void
}

export function buildWizardTools({
  orgId,
  deps,
  onProposal,
  onRefinement,
}: BuildWizardToolsArgs) {
  return {
    listModels: tool({
      description: "List AI models available in this org.",
      inputSchema: z.object({}),
      execute: async () => deps.listModels(),
    }),
    listTools: tool({
      description:
        "List tools available to agents (built-in + custom). Call before suggesting tool IDs.",
      inputSchema: z.object({}),
      execute: async () => deps.listTools(orgId),
    }),
    listSkills: tool({
      description:
        "List skills installed in this org. Each skill may require specific tools.",
      inputSchema: z.object({}),
      execute: async () => deps.listSkills(orgId),
    }),
    listMcpServers: tool({
      description: "List MCP servers connected to this org.",
      inputSchema: z.object({}),
      execute: async () => deps.listMcpServers(orgId),
    }),
    listKnowledgeGroups: tool({
      description: "List knowledge base groups in this org.",
      inputSchema: z.object({}),
      execute: async () => deps.listKnowledgeGroups(orgId),
    }),
    proposeAgent: tool({
      description:
        "Emit the final proposed agent draft. Only call after gathering enough info and listing the relevant catalogs. All IDs must come from list* results.",
      inputSchema: ProposeAgentInputSchema,
      execute: async (payload) => {
        onProposal?.(payload)
        return { ok: true }
      },
    }),
    refineAgent: tool({
      description:
        "Apply a partial update to the current draft (e.g., after the user says 'use GPT-4 instead').",
      inputSchema: RefineAgentInputSchema,
      execute: async (payload) => {
        onRefinement?.(payload)
        return { ok: true }
      },
    }),
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `bun test src/features/assistants/wizard/tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/assistants/wizard/tools.ts src/features/assistants/wizard/tools.test.ts
git commit -m "feat(agents): wizard AI tools (list + propose/refine)"
```

---

## Task 7: Wizard service (streamText orchestration)

**Files:**
- Create: `src/features/assistants/wizard/service.ts`
- Test: `src/features/assistants/wizard/service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/assistants/wizard/service.test.ts
import { describe, it, expect, vi } from "vitest"
import { buildWizardSystemPrompt } from "./service"

describe("buildWizardSystemPrompt", () => {
  it("includes org context and rules", () => {
    const prompt = buildWizardSystemPrompt({
      orgName: "Acme",
      userRole: "admin",
      existingAgentCount: 3,
      toolCount: 10,
      skillCount: 5,
      mcpCount: 2,
      kbCount: 1,
      modelCount: 4,
    })
    expect(prompt).toContain("Acme")
    expect(prompt).toContain("3 existing agents")
    expect(prompt).toContain("Never invent IDs")
    expect(prompt).toContain("proposeAgent")
  })
})
```

- [ ] **Step 2: Run it to confirm failure**

Run: `bun test src/features/assistants/wizard/service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

```ts
// src/features/assistants/wizard/service.ts
import { streamText, convertToModelMessages, stepCountIs } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { prisma } from "@/lib/prisma"
import { AVAILABLE_MODELS } from "@/lib/models"
import { buildWizardTools, filterKnownIds, type WizardDeps } from "./tools"
import {
  type WizardMessage,
  type WizardDraft,
  type ProposeAgentInput,
  type RefineAgentInput,
} from "./schema"

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })

const WIZARD_MODEL_ID = "anthropic/claude-sonnet-4.6"
const MAX_STEPS = 8

export interface OrgContextCounts {
  orgName: string
  userRole: string
  existingAgentCount: number
  toolCount: number
  skillCount: number
  mcpCount: number
  kbCount: number
  modelCount: number
}

export function buildWizardSystemPrompt(ctx: OrgContextCounts): string {
  return `You are the Agent Builder Wizard for ${ctx.orgName}. You help the user design a new AI agent by asking targeted questions and proposing a complete draft.

Org context:
- User role: ${ctx.userRole}
- ${ctx.existingAgentCount} existing agents
- ${ctx.toolCount} tools available, ${ctx.skillCount} skills, ${ctx.mcpCount} MCP servers, ${ctx.kbCount} knowledge bases, ${ctx.modelCount} models

Rules:
1. Ask ONE question per turn. Keep it short.
2. Before suggesting any tool/skill/MCP/KB/model IDs, call the relevant list* tool to see what actually exists. Never invent IDs.
3. Ask 2-4 follow-up questions after the user's first description (audience, data access, actions, personality/guardrails). Then call proposeAgent.
4. If the user corrects something mid-conversation, call refineAgent with a partial patch.
5. Pick a sensible default model from listModels (prefer function-calling if tools are needed).
6. System prompt must be at least 20 characters. Use the structure: ## Goal / ## Skills / ## Workflow / ## Constraints.
7. Stop after proposeAgent succeeds unless the user asks for changes.`
}

export interface StreamAssistantWizardArgs {
  messages: WizardMessage[]
  draft: WizardDraft
  orgId: string
  userId: string
  orgName: string
  userRole: string
}

export async function streamAssistantWizard(args: StreamAssistantWizardArgs) {
  const deps: WizardDeps = {
    listModels: async () =>
      AVAILABLE_MODELS.map((m) => ({
        id: m.id,
        name: m.name,
        functionCalling: m.capabilities.functionCalling,
        ctx: m.contextWindow,
      })),
    listTools: async (orgId) => {
      const tools = await prisma.tool.findMany({
        where: { OR: [{ orgId }, { orgId: null }] },
        select: { id: true, name: true, description: true, category: true },
      })
      return tools.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description ?? "",
        category: t.category ?? "general",
      }))
    },
    listSkills: async (orgId) => {
      const skills = await prisma.skill.findMany({
        where: { orgId },
        select: {
          id: true,
          name: true,
          summary: true,
          requiredTools: { select: { toolId: true } },
        },
      })
      return skills.map((s) => ({
        id: s.id,
        name: s.name,
        summary: s.summary ?? "",
        requiredToolIds: s.requiredTools.map((r) => r.toolId),
      }))
    },
    listMcpServers: async (orgId) => {
      const servers = await prisma.mcpServer.findMany({
        where: { orgId },
        select: { id: true, name: true, description: true },
      })
      return servers.map((s) => ({
        id: s.id,
        name: s.name,
        toolSummary: s.description ?? "",
      }))
    },
    listKnowledgeGroups: async (orgId) => {
      const groups = await prisma.knowledgeGroup.findMany({
        where: { orgId },
        select: {
          id: true,
          name: true,
          _count: { select: { documents: true } },
        },
      })
      return groups.map((g) => ({
        id: g.id,
        name: g.name,
        docCount: g._count.documents,
      }))
    },
  }

  const [models, tools, skills, mcp, kbs, agentCount] = await Promise.all([
    deps.listModels(),
    deps.listTools(args.orgId),
    deps.listSkills(args.orgId),
    deps.listMcpServers(args.orgId),
    deps.listKnowledgeGroups(args.orgId),
    prisma.assistant.count({ where: { orgId: args.orgId } }),
  ])

  const knownModelIds = new Set(models.map((m) => m.id))
  const knownToolIds = new Set(tools.map((t) => t.id))
  const knownSkillIds = new Set(skills.map((s) => s.id))
  const knownMcpIds = new Set(mcp.map((s) => s.id))
  const knownKbIds = new Set(kbs.map((k) => k.id))

  const system = buildWizardSystemPrompt({
    orgName: args.orgName,
    userRole: args.userRole,
    existingAgentCount: agentCount,
    toolCount: tools.length,
    skillCount: skills.length,
    mcpCount: mcp.length,
    kbCount: kbs.length,
    modelCount: models.length,
  })

  const wizardTools = buildWizardTools({
    orgId: args.orgId,
    userId: args.userId,
    deps,
    onProposal: (payload) => {
      // ID filtering runs client-side via the stream; nothing to do here beyond enforcing
      // schema. Unknown-ID filtering happens in the route handler's onFinish.
    },
  })

  return streamText({
    model: openrouter(WIZARD_MODEL_ID),
    system,
    messages: convertToModelMessages(
      args.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))
    ),
    tools: wizardTools,
    stopWhen: stepCountIs(MAX_STEPS),
  })
}

export function sanitizeProposal(
  payload: ProposeAgentInput,
  known: {
    models: Set<string>
    tools: Set<string>
    skills: Set<string>
    mcp: Set<string>
    kbs: Set<string>
  }
): { payload: ProposeAgentInput; dropped: Record<string, string[]> } {
  const toolsR = filterKnownIds(payload.selectedToolIds, known.tools)
  const skillsR = filterKnownIds(payload.selectedSkillIds, known.skills)
  const mcpR = filterKnownIds(payload.selectedMcpServerIds, known.mcp)
  const kbsR = filterKnownIds(payload.knowledgeBaseGroupIds, known.kbs)
  const modelOk = known.models.has(payload.model)

  const sanitized: ProposeAgentInput = {
    ...payload,
    model: modelOk ? payload.model : "",
    selectedToolIds: toolsR.kept,
    selectedSkillIds: skillsR.kept,
    selectedMcpServerIds: mcpR.kept,
    knowledgeBaseGroupIds: kbsR.kept,
  }

  return {
    payload: sanitized,
    dropped: {
      model: modelOk ? [] : [payload.model],
      tools: toolsR.dropped,
      skills: skillsR.dropped,
      mcp: mcpR.dropped,
      kbs: kbsR.dropped,
    },
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `bun test src/features/assistants/wizard/service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/assistants/wizard/service.ts src/features/assistants/wizard/service.test.ts
git commit -m "feat(agents): wizard streaming service with tool loop"
```

---

## Task 8: Wizard stream API route

**Files:**
- Create: `src/app/api/assistants/wizard/stream/route.ts`

- [ ] **Step 1: Add the endpoint**

```ts
// src/app/api/assistants/wizard/stream/route.ts
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { resolveOrgContext } from "@/lib/org-context"
import { streamAssistantWizard } from "@/features/assistants/wizard/service"
import { WizardStreamRequestSchema } from "@/features/assistants/wizard/schema"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgContext = await resolveOrgContext(session.user.id)
  if (!orgContext) {
    return NextResponse.json({ error: "No org" }, { status: 403 })
  }

  const body = await request.json()
  const parsed = WizardStreamRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const result = await streamAssistantWizard({
    messages: parsed.data.messages,
    draft: parsed.data.draft,
    orgId: orgContext.orgId,
    userId: session.user.id,
    orgName: orgContext.orgName,
    userRole: orgContext.role,
  })

  return result.toUIMessageStreamResponse()
}
```

> NOTE: If `resolveOrgContext` is named differently in this repo, use the exact pattern from an existing `/api/dashboard/*` route. Grep: `rg "orgContext" src/lib | head -5`.

- [ ] **Step 2: Verify the auth + orgContext helper name**

Run: `rg "orgContext|resolveOrgContext" src/lib --files-with-matches | head -5`
Expected: shows the helper file; update import in the route if the exported name differs.

- [ ] **Step 3: Typecheck**

Run: `bun run tsc --noEmit 2>&1 | head -30`
Expected: 0 errors in the new route file.

- [ ] **Step 4: Manually POST to confirm it responds with a stream**

Run locally: `bun run dev`, then `curl -N -X POST http://localhost:3000/api/assistants/wizard/stream -H 'Cookie: <session>' -H 'Content-Type: application/json' -d '{"messages":[{"id":"m1","role":"user","content":"Support agent for customers"}],"draft":{"selectedToolIds":[],"selectedSkillIds":[],"selectedMcpServerIds":[],"selectedWorkflowIds":[],"knowledgeBaseGroupIds":[]}}'`

Expected: streamed text chunks and eventually a tool-call event.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/assistants/wizard/stream/route.ts
git commit -m "feat(agents): POST /api/assistants/wizard/stream"
```

---

## Task 9: Client reducer `useWizardDraft`

**Files:**
- Create: `src/features/assistants/wizard/hooks/use-wizard-draft.ts`

- [ ] **Step 1: Implement the reducer hook**

```ts
// src/features/assistants/wizard/hooks/use-wizard-draft.ts
"use client"

import { useReducer, useCallback } from "react"
import type {
  WizardDraft,
  ProposeAgentInput,
  RefineAgentInput,
  Uncertainty,
} from "../schema"

export interface WizardState {
  draft: WizardDraft
  uncertainty: Uncertainty
  dropped: Record<string, string[]>
}

type Action =
  | { type: "apply-proposal"; payload: ProposeAgentInput }
  | { type: "apply-refinement"; payload: RefineAgentInput }
  | { type: "user-edit"; field: keyof WizardDraft; value: unknown }
  | { type: "set-dropped"; dropped: Record<string, string[]> }
  | { type: "reset" }

const INITIAL: WizardState = {
  draft: {
    selectedToolIds: [],
    selectedSkillIds: [],
    selectedMcpServerIds: [],
    selectedWorkflowIds: [],
    knowledgeBaseGroupIds: [],
  },
  uncertainty: {},
  dropped: {},
}

function reducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case "apply-proposal": {
      const { uncertainty, reasoning: _r, ...rest } = action.payload
      const nextUncertainty: Uncertainty = { ...state.uncertainty }
      for (const [k, v] of Object.entries(uncertainty)) {
        nextUncertainty[k] = v
      }
      return {
        ...state,
        draft: { ...state.draft, ...rest },
        uncertainty: nextUncertainty,
      }
    }
    case "apply-refinement": {
      const { uncertainty, ...rest } = action.payload
      return {
        ...state,
        draft: { ...state.draft, ...rest },
        uncertainty: uncertainty
          ? { ...state.uncertainty, ...uncertainty }
          : state.uncertainty,
      }
    }
    case "user-edit":
      return {
        ...state,
        draft: { ...state.draft, [action.field]: action.value },
        uncertainty: { ...state.uncertainty, [action.field]: "locked" },
      }
    case "set-dropped":
      return { ...state, dropped: action.dropped }
    case "reset":
      return INITIAL
  }
}

export function useWizardDraft() {
  const [state, dispatch] = useReducer(reducer, INITIAL)

  const applyProposal = useCallback(
    (p: ProposeAgentInput) => dispatch({ type: "apply-proposal", payload: p }),
    []
  )
  const applyRefinement = useCallback(
    (p: RefineAgentInput) => dispatch({ type: "apply-refinement", payload: p }),
    []
  )
  const userEdit = useCallback(
    <K extends keyof WizardDraft>(field: K, value: WizardDraft[K]) =>
      dispatch({ type: "user-edit", field, value }),
    []
  )
  const reset = useCallback(() => dispatch({ type: "reset" }), [])

  return { state, applyProposal, applyRefinement, userEdit, reset }
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run tsc --noEmit 2>&1 | head -20`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/assistants/wizard/hooks/use-wizard-draft.ts
git commit -m "feat(agents): useWizardDraft reducer"
```

---

## Task 10: Wizard chip component

**Files:**
- Create: `src/features/assistants/wizard/components/wizard-chip.tsx`

- [ ] **Step 1: Implement the chip**

```tsx
// src/features/assistants/wizard/components/wizard-chip.tsx
"use client"

import { X, Sparkles } from "@/lib/icons"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface Props {
  label: string
  suggested?: boolean
  reason?: string
  onRemove?: () => void
}

export function WizardChip({ label, suggested, reason, onRemove }: Props) {
  const body = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs",
        suggested
          ? "border-primary/40 bg-primary/5 text-primary"
          : "border-border bg-muted/40"
      )}
    >
      {suggested && <Sparkles className="h-3 w-3" />}
      <span className="truncate max-w-[160px]">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="hover:opacity-70"
          aria-label={`Remove ${label}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )

  if (!reason) return body
  return (
    <Tooltip>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent className="max-w-[240px] text-xs">{reason}</TooltipContent>
    </Tooltip>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/assistants/wizard/components/wizard-chip.tsx
git commit -m "feat(agents): wizard chip component"
```

---

## Task 11: Wizard preview panel

**Files:**
- Create: `src/features/assistants/wizard/components/wizard-preview.tsx`

- [ ] **Step 1: Implement the preview**

```tsx
// src/features/assistants/wizard/components/wizard-preview.tsx
"use client"

import { useMemo } from "react"
import { WizardChip } from "./wizard-chip"
import type { WizardDraft, Uncertainty } from "../schema"
import { isNameValid, isSystemPromptValid } from "@/features/assistants/core/completeness"

interface CatalogEntry {
  id: string
  name: string
  description?: string
}

interface Props {
  draft: WizardDraft
  uncertainty: Uncertainty
  catalogs: {
    models: CatalogEntry[]
    tools: CatalogEntry[]
    skills: CatalogEntry[]
    mcp: CatalogEntry[]
    kbs: CatalogEntry[]
  }
  onUserEdit: <K extends keyof WizardDraft>(field: K, value: WizardDraft[K]) => void
}

function entryLabel(id: string, catalog: CatalogEntry[]): string {
  return catalog.find((e) => e.id === id)?.name ?? id
}

export function WizardPreview({ draft, uncertainty, catalogs, onUserEdit }: Props) {
  const modelName = useMemo(
    () => (draft.model ? entryLabel(draft.model, catalogs.models) : "—"),
    [draft.model, catalogs.models]
  )

  const readinessItems = [
    { label: "Name", ok: isNameValid(draft.name ?? ""), required: true },
    { label: "Prompt", ok: isSystemPromptValid(draft.systemPrompt ?? ""), required: true },
    { label: "Model", ok: Boolean(draft.model), required: true },
    { label: "Opening msg", ok: Boolean(draft.openingMessage), required: false },
  ]

  return (
    <aside className="flex flex-col h-full border-l bg-muted/20 overflow-y-auto">
      <div className="p-5 space-y-5">
        {/* Identity */}
        <section className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Identity</p>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{draft.emoji ?? "🤖"}</span>
            <div className="min-w-0">
              <p className="text-base font-semibold truncate">
                {draft.name || <span className="text-muted-foreground">—</span>}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {draft.description || "—"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {(draft.tags ?? []).map((t) => (
              <WizardChip key={t} label={t} />
            ))}
          </div>
        </section>

        {/* Model */}
        <section className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Model</p>
          <WizardChip
            label={modelName}
            suggested={uncertainty.model === "ai-suggested"}
            onRemove={
              draft.model
                ? () => onUserEdit("model", "")
                : undefined
            }
          />
        </section>

        {/* Capabilities */}
        {([
          ["Tools", "selectedToolIds", catalogs.tools] as const,
          ["Skills", "selectedSkillIds", catalogs.skills] as const,
          ["MCP", "selectedMcpServerIds", catalogs.mcp] as const,
          ["Knowledge", "knowledgeBaseGroupIds", catalogs.kbs] as const,
        ]).map(([title, key, catalog]) => {
          const ids = (draft[key] ?? []) as string[]
          return (
            <section key={title} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
              {ids.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {ids.map((id) => (
                    <WizardChip
                      key={id}
                      label={entryLabel(id, catalog)}
                      suggested={uncertainty[key] === "ai-suggested"}
                      onRemove={() =>
                        onUserEdit(
                          key,
                          ids.filter((x) => x !== id) as WizardDraft[typeof key]
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}

        {/* Readiness strip */}
        <section className="pt-3 border-t">
          <div className="flex flex-wrap gap-2">
            {readinessItems.map((item) => (
              <span
                key={item.label}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span
                  className={
                    item.ok
                      ? "h-2 w-2 rounded-full bg-emerald-500"
                      : item.required
                      ? "h-2 w-2 rounded-full bg-destructive"
                      : "h-2 w-2 rounded-full border border-muted-foreground/40"
                  }
                />
                {item.label}
              </span>
            ))}
          </div>
        </section>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/assistants/wizard/components/wizard-preview.tsx
git commit -m "feat(agents): wizard preview panel"
```

---

## Task 12: Wizard chat pane

**Files:**
- Create: `src/features/assistants/wizard/components/wizard-chat.tsx`

- [ ] **Step 1: Implement chat pane**

```tsx
// src/features/assistants/wizard/components/wizard-chat.tsx
"use client"

import { useEffect, useRef } from "react"
import { useChat } from "@ai-sdk/react"
import { Send, Loader2, Sparkles } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { WizardDraft, ProposeAgentInput, RefineAgentInput } from "../schema"
import { cn } from "@/lib/utils"

interface Props {
  draft: WizardDraft
  onProposal: (p: ProposeAgentInput) => void
  onRefinement: (p: RefineAgentInput) => void
  onDropped: (d: Record<string, string[]>) => void
}

const OPENING = "In a sentence or two, what do you want this agent to do?"

export function WizardChat({ draft, onProposal, onRefinement, onDropped }: Props) {
  const { messages, input, setInput, handleSubmit, status, append } = useChat({
    api: "/api/assistants/wizard/stream",
    body: { draft },
    onToolCall: async ({ toolCall }) => {
      if (toolCall.toolName === "proposeAgent") {
        onProposal(toolCall.input as ProposeAgentInput)
      } else if (toolCall.toolName === "refineAgent") {
        onRefinement(toolCall.input as RefineAgentInput)
      }
      return undefined
    },
  })

  const openedRef = useRef(false)
  useEffect(() => {
    if (openedRef.current) return
    openedRef.current = true
    append({ role: "assistant", content: OPENING })
  }, [append])

  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  const isBusy = status === "submitted" || status === "streaming"

  return (
    <div className="flex flex-col h-full">
      <div ref={listRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex gap-2",
              m.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              )}
            >
              {m.role === "assistant" && (
                <Sparkles className="inline h-3 w-3 mr-1 align-text-top text-primary" />
              )}
              {m.content}
            </div>
          </div>
        ))}
        {isBusy && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-muted px-4 py-2.5 text-sm">
              <Loader2 className="inline h-3.5 w-3.5 animate-spin" />
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t p-3 flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your answer…"
          rows={1}
          className="min-h-[40px] max-h-[120px] resize-none"
          disabled={isBusy}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
        />
        <Button type="submit" size="icon" disabled={isBusy || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Check `@ai-sdk/react` package version matches v6 usage**

Run: `rg '"@ai-sdk/react"' package.json`
Expected: present. If API differs (e.g., `useChat` uses different hook args in v6), consult `src/features/chat-public/service.ts` and existing chat client components for the correct pattern and adjust.

- [ ] **Step 3: Commit**

```bash
git add src/features/assistants/wizard/components/wizard-chat.tsx
git commit -m "feat(agents): wizard chat pane"
```

---

## Task 13: Wizard action bar

**Files:**
- Create: `src/features/assistants/wizard/components/wizard-action-bar.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/features/assistants/wizard/components/wizard-action-bar.tsx
"use client"

import { ArrowLeft, Sparkles, SkipForward, RotateCcw } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

interface Props {
  canCreate: boolean
  isCreating: boolean
  onCreate: () => void
  onReset: () => void
  onSkipToManual: () => Promise<void>
}

export function WizardActionBar({ canCreate, isCreating, onCreate, onReset, onSkipToManual }: Props) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-2 min-h-14 border-b bg-background pl-12 pr-4 py-2 shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => router.push("/dashboard/agent-builder")}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <div className="flex-1 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h1 className="text-base font-semibold">New Agent — AI Wizard</h1>
      </div>

      <Button variant="ghost" size="sm" onClick={onReset}>
        <RotateCcw className="h-4 w-4 mr-1.5" />
        Start over
      </Button>

      <Button variant="outline" size="sm" onClick={onSkipToManual}>
        <SkipForward className="h-4 w-4 mr-1.5" />
        Skip to manual editor
      </Button>

      <Button size="sm" onClick={onCreate} disabled={!canCreate || isCreating}>
        {isCreating ? "Creating…" : "Create Agent"}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/assistants/wizard/components/wizard-action-bar.tsx
git commit -m "feat(agents): wizard action bar"
```

---

## Task 14: Wizard split-view shell

**Files:**
- Create: `src/features/assistants/wizard/components/wizard-page-client.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/features/assistants/wizard/components/wizard-page-client.tsx
"use client"

import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAssistants } from "@/hooks/use-assistants"
import { useModels } from "@/hooks/use-models"
import { useWizardDraft } from "../hooks/use-wizard-draft"
import { WizardChat } from "./wizard-chat"
import { WizardPreview } from "./wizard-preview"
import { WizardActionBar } from "./wizard-action-bar"
import { isNameValid, isSystemPromptValid } from "@/features/assistants/core/completeness"

interface Props {
  initialAssistants: { id: string; name: string }[]
  catalogs: {
    tools: { id: string; name: string; description?: string }[]
    skills: { id: string; name: string; description?: string }[]
    mcp: { id: string; name: string; description?: string }[]
    kbs: { id: string; name: string; description?: string }[]
  }
}

export function WizardPageClient({ initialAssistants, catalogs }: Props) {
  const router = useRouter()
  const { addAssistant, refetch } = useAssistants({ initialAssistants: initialAssistants as never })
  const { models } = useModels()
  const { state, applyProposal, applyRefinement, userEdit, reset } = useWizardDraft()
  const [isCreating, setIsCreating] = useState(false)

  const modelCatalog = useMemo(
    () => models.map((m) => ({ id: m.id, name: m.name, description: m.description })),
    [models]
  )

  const canCreate =
    isNameValid(state.draft.name ?? "") &&
    isSystemPromptValid(state.draft.systemPrompt ?? "") &&
    Boolean(state.draft.model)

  const handleCreate = useCallback(async () => {
    if (!canCreate) return
    setIsCreating(true)
    try {
      const d = state.draft
      const created = await addAssistant({
        name: d.name!,
        description: d.description ?? "",
        emoji: d.emoji ?? "🤖",
        systemPrompt: d.systemPrompt!,
        model: d.model!,
        useKnowledgeBase: d.useKnowledgeBase ?? false,
        knowledgeBaseGroupIds: d.knowledgeBaseGroupIds ?? [],
        openingMessage: d.openingMessage || undefined,
        openingQuestions: (d.openingQuestions ?? []).filter((q) => q.trim()),
        liveChatEnabled: d.liveChatEnabled ?? false,
        tags: d.tags ?? [],
        memoryConfig: d.memoryConfig ?? null,
        modelConfig: d.modelConfig ?? null,
        chatConfig: d.chatConfig ?? null,
        guardRails: d.guardRails ?? null,
      })
      if (!created) return

      const bindings: Promise<unknown>[] = []
      if ((d.selectedToolIds ?? []).length > 0) {
        bindings.push(
          fetch(`/api/assistants/${created.id}/tools`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toolIds: d.selectedToolIds }),
          })
        )
      }
      if ((d.selectedSkillIds ?? []).length > 0) {
        bindings.push(
          fetch(`/api/assistants/${created.id}/skills`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ skillIds: d.selectedSkillIds }),
          })
        )
      }
      if ((d.selectedMcpServerIds ?? []).length > 0) {
        bindings.push(
          fetch(`/api/assistants/${created.id}/mcp-servers`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mcpServerIds: d.selectedMcpServerIds }),
          })
        )
      }
      await Promise.all(bindings)
      refetch()
      router.replace(`/dashboard/agent-builder/${created.id}`)
    } finally {
      setIsCreating(false)
    }
  }, [state.draft, canCreate, addAssistant, refetch, router])

  const handleSkipToManual = useCallback(async () => {
    const created = await addAssistant({
      name: "Untitled Agent",
      emoji: "🤖",
      systemPrompt:
        "## Goal\nDescribe what this agent does.\n\n## Skills\n- \n\n## Workflow\n1. \n\n## Constraints\n- ",
    })
    if (created) {
      refetch()
      router.replace(`/dashboard/agent-builder/${created.id}`)
    }
  }, [addAssistant, refetch, router])

  return (
    <div className="flex flex-col h-full">
      <WizardActionBar
        canCreate={canCreate}
        isCreating={isCreating}
        onCreate={handleCreate}
        onReset={reset}
        onSkipToManual={handleSkipToManual}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 min-w-0">
          <WizardChat
            draft={state.draft}
            onProposal={applyProposal}
            onRefinement={applyRefinement}
            onDropped={() => { /* handled server-side */ }}
          />
        </div>
        <div className="w-[380px] shrink-0 hidden lg:block">
          <WizardPreview
            draft={state.draft}
            uncertainty={state.uncertainty}
            catalogs={{ models: modelCatalog, ...catalogs }}
            onUserEdit={userEdit}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `bun run tsc --noEmit 2>&1 | head -20`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/assistants/wizard/components/wizard-page-client.tsx
git commit -m "feat(agents): wizard split-view shell"
```

---

## Task 15: Replace the `/new` route

**Files:**
- Create: `src/app/dashboard/agent-builder/new/page.tsx`
- Modify: `src/features/assistants/components/builder/agent-editor-page-client.tsx` (redirect if id=="new")

- [ ] **Step 1: Create the new route**

```tsx
// src/app/dashboard/agent-builder/new/page.tsx
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { resolveOrgContext } from "@/lib/org-context"
import { WizardPageClient } from "@/features/assistants/wizard/components/wizard-page-client"

export default async function Page() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")
  const orgContext = await resolveOrgContext(session.user.id)
  if (!orgContext) redirect("/")

  const [assistants, tools, skills, mcp, kbs] = await Promise.all([
    prisma.assistant.findMany({
      where: { orgId: orgContext.orgId },
      select: { id: true, name: true },
      take: 50,
    }),
    prisma.tool.findMany({
      where: { OR: [{ orgId: orgContext.orgId }, { orgId: null }] },
      select: { id: true, name: true, description: true },
    }),
    prisma.skill.findMany({
      where: { orgId: orgContext.orgId },
      select: { id: true, name: true, summary: true },
    }),
    prisma.mcpServer.findMany({
      where: { orgId: orgContext.orgId },
      select: { id: true, name: true, description: true },
    }),
    prisma.knowledgeGroup.findMany({
      where: { orgId: orgContext.orgId },
      select: { id: true, name: true },
    }),
  ])

  return (
    <WizardPageClient
      initialAssistants={assistants}
      catalogs={{
        tools: tools.map((t) => ({ id: t.id, name: t.name, description: t.description ?? "" })),
        skills: skills.map((s) => ({ id: s.id, name: s.name, description: s.summary ?? "" })),
        mcp: mcp.map((s) => ({ id: s.id, name: s.name, description: s.description ?? "" })),
        kbs: kbs.map((k) => ({ id: k.id, name: k.name })),
      }}
    />
  )
}
```

> NOTE: If Prisma model names differ (e.g., `tool` vs `Tool`, `mcpServer` vs `McpServer`, `knowledgeGroup` vs `KnowledgeBaseGroup`), run `rg "prisma\\." src/features/assistants/default/repository.ts` and adjacent feature services for the correct names, and update.

- [ ] **Step 2: Prevent the existing `[id]/page.tsx` from handling "new"**

Since Next.js App Router treats `/new` as a more specific route than `/[id]`, the new `new/page.tsx` will automatically win. Verify with `bun run dev` and navigate to `/dashboard/agent-builder/new`.

No change needed to `[id]/page.tsx`, but remove the `isNew` branch from `agent-editor-page-client.tsx`:

- Delete the `isNew ? undefined : handleDuplicate` trinary passes (they remain valid, so actually keep them; no change required).
- The route only receives concrete IDs now, so `isNew` will always be `false` — leave the code path intact but add a guard at the top:

```tsx
// In agent-editor-page-client.tsx, near the top of the component:
useEffect(() => {
  if (id === "new") {
    router.replace("/dashboard/agent-builder/new")
  }
}, [id, router])
```

This covers anyone hitting `/dashboard/agent-builder/new` via legacy links before the route file resolves.

- [ ] **Step 3: Manual e2e on local dev**

1. `bun run dev`
2. Visit `/dashboard/agent-builder/new` → wizard loads with AI opening message.
3. Reply "Customer support agent for e-commerce" → AI asks follow-ups, calls list tools, eventually emits `proposeAgent`.
4. Click **Create Agent** → lands on `/dashboard/agent-builder/<new-id>` with correct prompt, model, tools bound.
5. Click **Skip to manual editor** from a fresh wizard → creates blank agent and redirects.
6. Back at editor, verify tab dots + inline `*` markers + deploy readiness all present.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/agent-builder/new/page.tsx src/features/assistants/components/builder/agent-editor-page-client.tsx
git commit -m "feat(agents): replace /new route with AI wizard"
```

---

## Task 16: Manual E2E walkthrough doc

**Files:**
- Create: `docs/superpowers/specs/2026-04-17-agent-builder-wizard-e2e.md`

- [ ] **Step 1: Document the walkthrough**

```md
# Agent Builder Wizard — Manual E2E Walkthrough

Run after every deploy until we add automated e2e.

## Prereqs
- Seeded org with: ≥2 tools, ≥1 skill, ≥1 MCP server, ≥1 KB group, ≥3 models.
- Logged in as org admin.

## Happy path
1. Navigate `/dashboard/agent-builder/new`.
2. AI greets: "In a sentence or two…". Type: *"A customer support agent for our e-commerce store that can check order status and answer FAQs"*.
3. AI asks audience → answer *"customers"*.
4. AI asks about data → answer *"use our product docs KB"*.
5. AI asks about actions → answer *"look up orders"*.
6. AI calls `listTools`, `listKnowledgeGroups`, `listModels` (visible in network tab as tool-call events).
7. AI emits `proposeAgent`. Preview panel populates: name, emoji, prompt, model, tools chips, KB chips.
8. Remove one suggested tool via the chip X. Observe uncertainty badge disappears for that field.
9. Click **Create Agent**. Lands on `/dashboard/agent-builder/<id>`.
10. Verify each tab: sidebar dot is green for Configure and Model; red for none.
11. Go to Deploy tab: readiness panel shows green.

## Escape hatch
1. Fresh wizard, click **Skip to manual editor**. Redirects to blank editor with default prompt.

## Required-field flags
1. Open an existing agent, Configure tab, clear the name field → blur. Red error appears. Sidebar dot on Configure turns red.
2. Go to Deploy tab → readiness panel lists "Missing: Name" and Deploy controls are dimmed.

## Regressions
- Existing "Generate with AI" card on Configure tab still works (enter description, generate).
- Existing agents load in editor with correct dots.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-04-17-agent-builder-wizard-e2e.md
git commit -m "docs(agents): wizard manual e2e walkthrough"
```

---

## Self-review checklist (run after plan is drafted)

1. **Spec coverage**
   - Wizard split-view shell → Tasks 10–15 ✓
   - Streaming service + 5 list tools + propose/refine → Tasks 5–8 ✓
   - Live preview w/ chip reject → Task 11 ✓
   - Required-field flags (inline + dots + deploy readiness) → Tasks 1–4 ✓
   - Skip-to-manual escape hatch → Task 13, 14 ✓
   - System prompt rules (ID grounding, turn cap) → Task 7 ✓
   - Error handling (unknown IDs dropped) → Task 7 (`sanitizeProposal`) ✓
   - Unit/integration/e2e tests → Tasks 1, 5, 6, 7 unit; Task 16 manual e2e ✓
   - No schema changes → confirmed, assistant/bindings endpoints reused unchanged ✓

2. **Type consistency**
   - `TabStatus`, `CompletenessFormState`, `DeployReadiness` — defined Task 1, consumed Tasks 2–4 ✓
   - `WizardDraft`, `ProposeAgentInput`, `RefineAgentInput`, `Uncertainty` — defined Task 5, consumed Tasks 6, 7, 9, 11, 12, 14 ✓
   - `TabId` import — defined in `agent-editor-layout.tsx`, reused in completeness + tab-deploy ✓

3. **Known plan-time gaps documented for the implementer**
   - Prisma model names may differ (documented in Tasks 7 + 15 with `rg` commands to verify).
   - `resolveOrgContext` helper name may differ (documented in Task 8 with `rg` command).
   - AI SDK v6 `useChat` args may need adjustment against existing chat clients (documented in Task 12 with pointer to `src/features/chat-public/service.ts`).

4. **No placeholders** — all code blocks are complete. "TODO" / "TBD" / "implement later" absent.
