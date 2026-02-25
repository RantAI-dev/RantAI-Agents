# RantAI Agents — Skill & Tool System Upgrade Plan

## Final Architecture (Implemented)

> This section documents the actual implemented architecture, which evolved from the brainstorming below.

### Key Decisions

1. **Community GitHub repo** (`rantai-skills`) — users submit tools/skills via PR
2. **Separated `tools/` and `skills/`** in the community repo
   - `tools/` = shared reusable atomic tools (can be used by multiple skills)
   - `skills/` = bundles (shared + own tools + SKILL.md prompt + configSchema)
3. **Code lives in community repo, bundled as npm package** (`@rantai/community-skills`)
4. **DB stores install records + user config only** — never code
5. **PR review = security gate** — no sandbox, no eval, no isolated-vm needed
6. **Tools are first-class DB entities** — community tools get `category: "community"` in the `Tool` table, independently assignable to assistants
7. **Skills produce Tool records on install** — same `AssistantTool` mechanism

### Architecture

```
Community Repo (@rantai/community-skills)
  tools/yahoo-finance/     → shared tools, reusable
  tools/google-sheets/
  skills/neko-finance/     → bundles shared + own tools + SKILL.md
    tools/underdog-scan.ts
    SKILL.md
    skill.yaml

Main App (RantAI-Agents)
  lib/skill-sdk/         → shared types (CommunityToolDefinition, CommunitySkillDefinition)
  lib/skills/gateway.ts  → registry that loads @rantai/community-skills at startup
  lib/tools/registry.ts  → resolves community tools alongside builtin/http/mcp
  lib/marketplace/       → install creates InstalledSkill + Tool + Skill DB records

DB (what gets stored)
  InstalledSkill → per-org install record with userConfig
  Tool (category="community") → per-tool record with JSON Schema params
  Skill (source="community") → SKILL.md content for prompt injection
  AssistantTool → which tools are on which assistant
  AssistantSkill → which skill prompts are active
```

### Install Flow

```
User clicks Install → config form (if configSchema) → backend:
  1. Verify skill exists in gateway registry
  2. Create InstalledSkill { orgId, name, userConfig, skillPrompt }
  3. Create Skill record for prompt injection
  4. Create Tool records for each tool in skill (category="community")
  5. Create MarketplaceInstall record
→ Tools appear in org's tool library, assignable to assistants
```

### New Files Created
- `lib/skill-sdk/types.ts` — CommunityToolDefinition, CommunitySkillDefinition, CommunityRegistry
- `lib/skill-sdk/schema.ts` — Zod → JSON Schema converters
- `lib/skill-sdk/index.ts` — re-exports
- `lib/skills/gateway.ts` — community package registry gateway
- `types/community-skills.d.ts` — type declaration for npm package
- `scripts/seed-community.ts` — seeds CatalogItem records from community package

### Modified Files
- `prisma/schema.prisma` — InstalledSkill model, Tool.installedSkillId FK, CatalogItem community fields
- `lib/tools/types.ts` — added "community" to category union
- `lib/tools/registry.ts` — community tool resolution + execution
- `lib/marketplace/installer.ts` — community skill/tool install + uninstall
- `lib/marketplace/types.ts` — community fields on MarketplaceCatalogItem
- `lib/marketplace/catalog.ts` — maps community fields from DB
- `app/api/dashboard/marketplace/route.ts` — passes community fields to frontend
- `app/api/dashboard/marketplace/install/route.ts` — accepts config param
- `app/dashboard/agent-builder/_components/tab-tools.tsx` — "Community" category
- `app/dashboard/marketplace/_components/marketplace-card.tsx` — "Community" badge
- `hooks/use-tools.ts` — updated category type
- `hooks/use-marketplace.ts` — community fields on MarketplaceItem

---

## Original Brainstorming (below)

## Current State Analysis

### What RantAI already has

| Component | Status | How it works |
|-----------|--------|--------------|
| **Tools** | Working | TypeScript + Zod schema, 3 types: builtin (12), OpenAPI (HTTP), MCP (external) |
| **Skills** | Partial | Markdown files with YAML frontmatter — docs only, NOT executable |
| **Marketplace** | Partial | Catalog items, installer creates DB records, tracks installs |
| **Tool execution** | Working | Vercel AI SDK `streamText()` → CoreTool → execute handler |
| **Tool registry** | Working | Database-driven via Prisma (`Tool`, `AssistantTool`, `ToolExecution`) |
| **MCP** | Working | Client/server with stdio + SSE transport, tool adapter to CoreTool |
| **Function calling** | Working | Vercel AI SDK handles natively, tools logged to `ToolExecution` |

### The gaps

1. **Skills are just docs** — `lib/skills/parser.ts` extracts YAML frontmatter + markdown body but skills don't *do* anything. They're instruction text, not tool bundles.
2. **No skill = tool bundle concept** — A skill like "neko-finance" (20 tools) can't exist. Each tool is independently registered. No grouping.
3. **Builtin tools are hardcoded** — `BUILTIN_TOOLS` is a static constant. Adding new tools = code change + deploy.
4. **No dynamic tool loading** — Can't drop a new skill package and have its tools appear. Must create DB records manually.
5. **No tool routing** — All assistant tools sent to LLM every call, regardless of relevance. Works now with <20 tools, breaks at scale.
6. **Marketplace is catalog-only** — Installs create DB records but don't load executable code. OpenAPI tools work (just HTTP config) but no native TS tool execution from packages.

---

## Target Architecture

### Core concept: Skill = installable package of tools

```
skill-package/
  skill.yaml          # metadata, config schema, battery deps
  SKILL.md            # AI system prompt injection (when/how to use)
  tools.ts            # @tool decorated functions (the actual code)
  lib/                # internal helpers (optional)
  index.ts            # exports tool class
```

When a user installs a skill from the marketplace:
1. Skill package is loaded into the runtime
2. `@tool` functions are registered as tools for that organization
3. `SKILL.md` is injected into assistant system prompts that enable the skill
4. User-specific config (API keys, etc.) is stored per-org in DB

### Architecture diagram

```
┌──────────────────────────────────────────────────────────┐
│                    RantAI Agents App                      │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Chat API (app/api/chat/route.ts)                    │ │
│  │                                                     │ │
│  │  User msg → Skill Router → Load relevant tools     │ │
│  │           → Build system prompt (+ SKILL.md)        │ │
│  │           → streamText() with selected tools        │ │
│  │           → Tool execution → Response               │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │                                │
│  ┌──────────────────────▼──────────────────────────────┐ │
│  │ Skill Gateway (lib/skills/gateway.ts)       NEW     │ │
│  │                                                     │ │
│  │  loadSkill()     → import tools.ts, register fns    │ │
│  │  getToolSchemas() → CoreTool[] for selected skills  │ │
│  │  execute()        → call tool fn with context       │ │
│  │  getPrompt()      → SKILL.md content                │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │                                │
│  ┌──────────────────────▼──────────────────────────────┐ │
│  │ Skill Packages (skills/)                            │ │
│  │                                                     │ │
│  │  skills/                                            │ │
│  │    neko-finance/   → 20 tools, finance data         │ │
│  │    web-scraper/    → 3 tools, cheerio-based         │ │
│  │    code-runner/    → 2 tools, sandboxed exec        │ │
│  │    ...marketplace packages...                       │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Existing (unchanged)                                │ │
│  │  Builtin tools (12) — calculator, web search, etc.  │ │
│  │  MCP tools — external servers                       │ │
│  │  OpenAPI tools — HTTP endpoint tools                │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Skill SDK (`lib/skill-sdk/`)

The foundation — what skill authors use to define tools.

#### 1.1 `@tool` decorator + types

**File: `lib/skill-sdk/types.ts`**

```typescript
export interface ToolParamSpec {
  type: "string" | "number" | "boolean" | "array" | "object"
  description?: string
  required?: boolean
  default?: any
  enum?: any[]
  items?: ToolParamSpec         // for array type
  properties?: Record<string, ToolParamSpec>  // for object type
}

export interface ToolMeta {
  name: string
  description: string
  params: Record<string, ToolParamSpec>
  tags?: string[]
  longRunning?: boolean         // if true, show progress to user
  cacheTtl?: number             // cache result for N seconds
}

export interface ToolContext {
  organizationId: string
  userId: string
  sessionId: string
  assistantId: string
  config: Record<string, any>   // user-specific skill config (API keys, etc.)
}

export interface SkillManifest {
  name: string
  displayName: string
  description: string
  version: string
  author: string
  category: string
  icon?: string
  batteries: string[]           // platform dep groups used
  configSchema?: Record<string, ToolParamSpec>  // user config fields
  tags?: string[]
}
```

**File: `lib/skill-sdk/decorator.ts`**

```typescript
export function tool(meta: Omit<ToolMeta, "name">) {
  return function<T extends (...args: any[]) => any>(
    originalMethod: T,
    context: ClassMethodDecoratorContext
  ): T {
    const wrapped = originalMethod as T & { _toolMeta: ToolMeta }
    wrapped._toolMeta = { ...meta, name: String(context.name) }
    return wrapped
  }
}
```

**File: `lib/skill-sdk/schema.ts`**

Converts `ToolMeta.params` → Zod schema (for Vercel AI SDK compatibility) and → JSON Schema (for LLM function calling).

```typescript
import { z } from "zod"
import { jsonSchema } from "ai"

export function paramsToZod(params: Record<string, ToolParamSpec>): z.ZodObject<any> { ... }
export function paramsToJsonSchema(params: Record<string, ToolParamSpec>): object { ... }
export function toolMetaToCoreToolDef(skillName: string, meta: ToolMeta): object { ... }
```

**File: `lib/skill-sdk/index.ts`**

Re-exports everything. This is what skill authors import:
```typescript
import { tool, type ToolContext } from "@rantai/skill-sdk"
```

#### 1.2 Batteries system

**File: `lib/skill-sdk/batteries.ts`**

Declares platform-provided dependency groups. Not installed per-skill — pre-bundled in the app.

```typescript
export const BATTERIES = {
  http:     [],                        // fetch is built into Bun
  finance:  ["yahoo-finance2"],
  sheets:   ["googleapis"],
  scraping: ["cheerio"],
  data:     ["lodash"],
  db:       [],                        // Prisma already available
  charts:   [],                        // return data, frontend renders
  crypto:   ["ccxt"],
  ai:       [],                        // @ai-sdk already available
  email:    ["nodemailer"],
  schedule: ["cron"],
} as const

export type BatteryName = keyof typeof BATTERIES

export function validateBatteries(requested: string[]): { valid: boolean; unknown: string[] } {
  const unknown = requested.filter(b => !(b in BATTERIES))
  return { valid: unknown.length === 0, unknown }
}
```

Battery deps are added to the app's root `package.json` — they're always available. The `batteries` field in `skill.yaml` is for documentation and validation, not installation.

---

### Phase 2: Skill Gateway (`lib/skills/gateway.ts`)

The runtime that loads skill packages and routes tool calls.

#### 2.1 Skill loader

**File: `lib/skills/gateway.ts`**

```typescript
class SkillGateway {
  private skills: Map<string, LoadedSkill>

  // Load a skill package from filesystem
  async loadSkill(skillDir: string): Promise<void>

  // Load all skills from a base directory
  async loadAll(baseDir: string): Promise<void>

  // Get CoreTool[] for Vercel AI SDK (for selected skills only)
  getToolSchemas(skillNames: string[], ctx: ToolContext): CoreTool[]

  // Execute a namespaced tool call: "neko-finance__quote"
  async execute(namespacedName: string, args: Record<string, any>, ctx: ToolContext): Promise<any>

  // Get SKILL.md prompt for selected skills
  getPrompts(skillNames: string[]): string

  // List all loaded skills and their tools
  listSkills(): SkillSummary[]

  // Reload a specific skill (hot reload for dev)
  async reloadSkill(skillName: string): Promise<void>
}

// Singleton
export const skillGateway = new SkillGateway()
```

**Loading process:**
1. Read `skill.yaml` → parse manifest
2. Validate batteries against platform
3. Dynamic import `tools.ts` (or `index.ts`)
4. Scan exported class for `_toolMeta` decorated methods
5. Register in memory map: `skillName → { manifest, tools, prompt, instance }`

#### 2.2 Integration with existing tool registry

The gateway produces CoreTool objects that plug directly into the existing `resolveTools()` pipeline in `lib/tools/registry.ts`.

**Modify: `lib/tools/registry.ts`**

Add a 4th tool category: `skill` (alongside `builtin`, `mcp`, `custom`).

```typescript
// Existing categories:
// - builtin  → BUILTIN_TOOLS constant
// - mcp      → MCP adapter
// - custom   → OpenAPI HTTP calls

// New category:
// - skill    → SkillGateway.getToolSchemas()
```

When resolving tools for an assistant:
1. Query `AssistantTool` where category = "skill"
2. Get skill names from the join
3. Call `skillGateway.getToolSchemas(skillNames, ctx)`
4. Merge with builtin + mcp + custom tools
5. Pass to `streamText()`

#### 2.3 Tool execution logging

Skill tool executions go through the same `ToolExecution` logging as existing tools. The gateway wraps each call:

```typescript
async execute(name: string, args: Record<string, any>, ctx: ToolContext) {
  const start = Date.now()
  try {
    const result = await toolFn(args, ctx)
    await logToolExecution(ctx, name, "success", Date.now() - start, args, result)
    return result
  } catch (err) {
    await logToolExecution(ctx, name, "error", Date.now() - start, args, err.message)
    throw err
  }
}
```

---

### Phase 3: Skill Router (`lib/skills/router.ts`)

Smart tool selection — don't send all tools to the LLM every time.

#### 3.1 Embedding-based routing

**File: `lib/skills/router.ts`**

```typescript
export class SkillRouter {
  private embeddings: Map<string, number[]>  // skillName → embedding vector

  // Pre-compute embeddings for installed skills (on install/startup)
  async indexSkill(skillName: string, manifest: SkillManifest): Promise<void>

  // Given user message, return top-k relevant skills
  async route(message: string, installedSkills: string[], k?: number): Promise<string[]>
}
```

**How it works:**
1. On skill install: embed `description + tool descriptions + tags` → store vector
2. On each user message: embed message → cosine similarity → top-k skills
3. Only those skills' tools get injected into the LLM call

**Embedding reuse:** The app already uses `generateEmbedding()` from `lib/rag/embeddings.ts` (OpenAI text-embedding-3-small via OpenRouter). Reuse the same function.

#### 3.2 Fallback: keyword matching

For environments without embedding API, simple keyword fallback:

```typescript
function keywordRoute(message: string, skills: Map<string, SkillManifest>): string[] {
  // Match against skill tags + tool names + description keywords
  // Fast, zero API calls, good enough for <30 skills
}
```

#### 3.3 Always-on skills

Some skills should always be active for an assistant (configured in assistant settings):

```typescript
// Assistant config in DB
{
  alwaysOnSkills: ["neko-finance"],   // always injected
  autoRouteSkills: true,               // use router for the rest
}
```

---

### Phase 4: Database Schema Changes

#### 4.1 New/modified Prisma models

```prisma
// Skill package metadata (already exists, needs fields)
model Skill {
  id              String   @id @default(cuid())
  organizationId  String
  name            String                    // "neko-finance"
  displayName     String                    // "Neko Finance"
  description     String
  version         String                    // "1.0.0"
  author          String
  category        String
  icon            String?
  batteries       String[]                  // NEW: ["finance", "data", "sheets"]
  configSchema    Json?                     // NEW: user config fields
  skillPath       String?                   // NEW: filesystem path to skill package
  promptContent   String?     @db.Text      // NEW: SKILL.md content cached
  embedding       Float[]?                  // NEW: for skill routing
  status          SkillStatus @default(ACTIVE)   // NEW
  source          SkillSource @default(LOCAL)     // NEW: LOCAL, MARKETPLACE, GIT
  sourceUrl       String?                   // NEW: marketplace URL or git repo

  // Relations
  organization    Organization @relation(...)
  tools           SkillTool[]               // NEW: tools belonging to this skill
  assistants      AssistantSkill[]
  installations   MarketplaceInstall[]

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([organizationId, name])
}

// Individual tool within a skill (for granular enable/disable)
model SkillTool {
  id              String   @id @default(cuid())
  skillId         String
  name            String                    // "quote", "underdog_scan"
  displayName     String
  description     String
  paramsSchema    Json                      // JSON Schema of parameters
  tags            String[]
  enabled         Boolean  @default(true)   // can disable individual tools

  skill           Skill    @relation(...)

  @@unique([skillId, name])
}

enum SkillStatus {
  ACTIVE
  DISABLED
  ERROR
}

enum SkillSource {
  LOCAL           // filesystem skill package
  MARKETPLACE     // installed from marketplace
  GIT             // cloned from git repo
}

// Extend existing AssistantSkill to track config
model AssistantSkill {
  // ... existing fields ...
  alwaysOn        Boolean  @default(false)  // NEW: skip routing, always active
  userConfig      Json?                     // NEW: per-assistant skill config
}
```

#### 4.2 Migration strategy

- Existing `Skill` model gets new fields (additive, non-breaking)
- New `SkillTool` model created
- Existing marketplace installs continue working
- `Tool` model stays as-is for builtin/mcp/openapi tools

---

### Phase 5: Chat API Integration

#### 5.1 Modify `app/api/chat/route.ts`

The chat route already has a tool resolution step. Add skill tools to it:

```typescript
// CURRENT (simplified):
const tools = await resolveTools(assistantId)
const response = await streamText({ tools, ... })

// NEW:
// 1. Resolve standard tools (builtin, mcp, openapi)
const standardTools = await resolveTools(assistantId)

// 2. Get installed skills for this assistant
const installedSkills = await getAssistantSkills(assistantId)
const alwaysOn = installedSkills.filter(s => s.alwaysOn).map(s => s.name)

// 3. Route: which skills are relevant to this message?
const routed = await skillRouter.route(userMessage, installedSkills.map(s => s.name), 3)
const activeSkills = [...new Set([...alwaysOn, ...routed])]

// 4. Get skill tools + prompts
const skillTools = skillGateway.getToolSchemas(activeSkills, toolContext)
const skillPrompts = skillGateway.getPrompts(activeSkills)

// 5. Merge
const allTools = { ...standardTools, ...skillTools }
const enhancedSystemPrompt = baseSystemPrompt + "\n\n" + skillPrompts

// 6. Call LLM
const response = await streamText({
  tools: allTools,
  system: enhancedSystemPrompt,
  ...
})
```

#### 5.2 Tool execution handler

When the LLM calls a skill tool (namespaced like `neko_finance__quote`):

```typescript
// In tool execution loop
if (toolName.includes("__")) {
  // Skill tool — route to gateway
  result = await skillGateway.execute(toolName, args, toolContext)
} else {
  // Standard tool — existing handler
  result = await existingToolHandler(toolName, args)
}
```

---

### Phase 6: Marketplace Upgrade

#### 6.1 Skill package format for marketplace

What skill authors submit:

```
my-skill/
  skill.yaml          # required: metadata + config schema
  SKILL.md            # required: AI instructions
  tools.ts            # required: @tool decorated class
  lib/                # optional: internal helpers
  index.ts            # required: exports tool class as default
  README.md           # required: marketplace listing (human docs)
  icon.png            # optional: marketplace icon
  examples/           # optional: example conversations
    basic.md
```

**`skill.yaml` full spec:**

```yaml
name: neko-finance
displayName: Neko Finance
description: Complete financial analysis toolkit — portfolio tracking, stock screening, technical analysis, and emerging tech discovery
version: 1.0.0
author: shiro
category: finance
tags: [stocks, portfolio, trading, crypto, budget]

batteries:
  - finance       # yahoo-finance2
  - data          # lodash
  - sheets        # googleapis
  - scraping      # cheerio

# Config the user fills in on install
config:
  sheetId:
    type: string
    required: true
    displayName: Google Sheet ID
    description: The spreadsheet ID from your Google Sheets URL
  googleAccount:
    type: string
    required: true
    displayName: Google Account
    description: Gmail address for Sheets access
```

#### 6.2 Marketplace install flow

```
User clicks "Install" on marketplace
         │
         ▼
   Show config form (from skill.yaml configSchema)
   User fills in: Sheet ID, Google account, etc.
         │
         ▼
   Backend:
   1. Download/clone skill package → skills/{org}/{name}/
   2. Validate: skill.yaml, tools.ts exist, batteries valid
   3. skillGateway.loadSkill(path)
   4. Create Skill + SkillTool records in DB
   5. Compute embedding for routing
   6. Create MarketplaceInstall record
         │
         ▼
   User can now enable skill on any assistant
```

#### 6.3 Marketplace review pipeline

Before a skill is published:

```
Author submits skill package
         │
         ▼
   Automated checks:
   ├── skill.yaml valid + all required fields
   ├── tools.ts compiles without errors
   ├── All imports are from batteries or lib/ (no rogue deps)
   ├── No filesystem access outside skill dir
   ├── No process.exit, child_process, eval, or dangerous APIs
   ├── No network calls outside tool execution (no phone-home)
   ├── SKILL.md exists and non-empty
   └── README.md exists
         │
         ▼
   Manual review:
   ├── Code quality check
   ├── Tool descriptions accurate
   ├── No data exfiltration patterns
   ├── Config schema makes sense
   └── Test run with mock context
         │
         ▼
   Published to marketplace catalog
```

#### 6.4 Skill updates

```yaml
# Author bumps version in skill.yaml
version: 1.1.0
```

Marketplace shows update available. User clicks update:
1. Download new package
2. `skillGateway.reloadSkill(name)` — hot reload
3. Update DB records (new tools, changed schemas)
4. Re-compute embedding if description changed
5. User config preserved

---

### Phase 7: Skill Router Enhancement (scaling)

#### 7.1 Caching layer

```typescript
// Cache routing decisions per conversation
// Same conversation likely needs same skills
const routeCache = new Map<string, { skills: string[]; expiresAt: number }>()

function getCachedRoute(conversationId: string): string[] | null {
  const cached = routeCache.get(conversationId)
  if (cached && cached.expiresAt > Date.now()) return cached.skills
  return null
}
```

#### 7.2 Usage-based ranking

Track which skills are used most per-assistant → boost their routing score:

```sql
-- Top skills for assistant X in last 7 days
SELECT skill_name, COUNT(*) as uses
FROM tool_execution
WHERE assistant_id = ? AND created_at > NOW() - INTERVAL '7 days'
AND tool_name LIKE '%__%'  -- skill tools have __ separator
GROUP BY skill_name
ORDER BY uses DESC
```

Blend: 70% embedding similarity + 30% usage frequency.

---

## File Changes Summary

### New files

| File | Purpose |
|------|---------|
| `lib/skill-sdk/types.ts` | Core types: ToolMeta, ToolContext, SkillManifest |
| `lib/skill-sdk/decorator.ts` | `@tool` decorator |
| `lib/skill-sdk/schema.ts` | Param spec → Zod / JSON Schema converters |
| `lib/skill-sdk/batteries.ts` | Platform dependency groups |
| `lib/skill-sdk/index.ts` | Public exports |
| `lib/skills/gateway.ts` | Skill loader + tool executor |
| `lib/skills/router.ts` | Embedding-based skill routing |

### Modified files

| File | Change |
|------|--------|
| `lib/tools/registry.ts` | Add "skill" category, merge skill tools into resolution |
| `app/api/chat/route.ts` | Add skill routing + prompt injection + skill tool execution |
| `prisma/schema.prisma` | Extend Skill model, add SkillTool model, extend AssistantSkill |
| `lib/marketplace/installer.ts` | Handle skill package install (load + register + embed) |
| `lib/skills/parser.ts` | Extend to parse `skill.yaml` alongside markdown (or replace) |

### Unchanged

Everything else stays as-is. Builtin tools, MCP, OpenAPI, workflows, RAG, memory — all untouched. The skill system is purely additive.

---

## Implementation Order

```
Phase 1: Skill SDK (types + decorator + schema)     ~ foundation
   ↓
Phase 2: Skill Gateway (loader + executor)           ~ core runtime
   ↓
Phase 3: Skill Router (embedding + keyword)          ~ smart selection
   ↓
Phase 4: DB Schema (Prisma migration)                ~ persistence
   ↓
Phase 5: Chat API integration                        ~ plug it in
   ↓
Phase 6: Marketplace upgrade                         ~ distribution
   ↓
Phase 7: Router optimization (cache + usage rank)    ~ scale
```

Phases 1-5 are the MVP — skills work end-to-end.
Phase 6 is marketplace distribution.
Phase 7 is optimization for scale.

---

## Example: Porting neko-finance to RantAI Skill

```typescript
// skills/neko-finance/tools.ts

import { tool, type ToolContext } from "@rantai/skill-sdk"
import yahooFinance from "yahoo-finance2"

export default class NekoFinanceTools {
  @tool({
    description: "Get single ticker price quote for IDX, US, crypto, or FX",
    params: {
      ticker: { type: "string", required: true, description: "e.g. BBCA.JK, SPY, BTC-USD, IDR=X" },
    },
  })
  async quote(ticker: string, ctx: ToolContext) {
    const result = await yahooFinance.quote(ticker)
    return {
      ticker,
      price: result.regularMarketPrice,
      change: result.regularMarketChange,
      changePct: result.regularMarketChangePercent,
      volume: result.regularMarketVolume,
      previousClose: result.regularMarketPreviousClose,
    }
  }

  @tool({
    description: "Full market overview: IDX, S&P500, NASDAQ, crypto, FX rates",
    params: {},
  })
  async marketOverview(ctx: ToolContext) {
    const indices = ["^JKSE", "^GSPC", "^IXIC", "^DJI"]
    const crypto = ["BTC-USD", "ETH-USD"]
    const fx = ["IDR=X"]
    // batch fetch and return
    ...
  }

  @tool({
    description: "Scan US tech market for emerging/underdog high-growth opportunities",
    params: {
      sort:      { type: "string", enum: ["score", "growth", "discount"], default: "score" },
      top:       { type: "number", default: 15 },
      maxMcap:   { type: "number", default: 50e9, description: "Max market cap USD" },
      minGrowth: { type: "number", default: 0, description: "Min revenue growth %" },
      sector:    { type: "string", description: "Filter by Yahoo industry keyword" },
    },
  })
  async underdogScan(
    sort = "score", top = 15, maxMcap = 50e9, minGrowth = 0, sector?: string,
    ctx?: ToolContext
  ) {
    // discovery → filter → score pipeline
    ...
  }

  // ... 17 more tools
}
```

```yaml
# skills/neko-finance/skill.yaml
name: neko-finance
displayName: Neko Finance
description: Complete financial toolkit — portfolio sync, technical analysis, stock screening, emerging tech scanner, budget tracking, fair value, stress testing
version: 1.0.0
author: shiro
category: Finance & Trading
tags: [stocks, portfolio, trading, crypto, budget, idx, us-market, technical-analysis]
batteries: [finance, data, sheets, scraping]
config:
  sheetId:
    type: string
    required: true
    displayName: Google Sheet ID
  googleAccount:
    type: string
    required: true
    displayName: Google Account Email
```

```markdown
# skills/neko-finance/SKILL.md

Use these tools for ANY finance question — prices, portfolio, analysis, trading ideas.

## When to use what

- "Harga BBCA?" → quote(ticker: "BBCA.JK")
- "Market gimana?" → marketOverview()
- "Ada underdog tech?" → underdogScan(sort: "growth", minGrowth: 25)
- "Portfolio gw?" → syncPortfolio() then portfolioAnalytics()
...
```

This skill installs with 2 clicks, user fills in Sheet ID + Google account, and immediately has 20 finance tools available to any assistant they enable it on.
