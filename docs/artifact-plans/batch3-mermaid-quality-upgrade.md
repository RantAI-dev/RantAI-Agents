# Batch 3 — Mermaid Artifact Quality Upgrade

> **Goal:** Bring `application/mermaid` artifact output to the same production-grade quality bar as HTML/React (Batch 1) and SVG (Batch 2) by rewriting its LLM instruction to teach diagram type selection, per-type syntax, renderer constraints, and readability rules — and extending the server-side validation pipeline with Mermaid-specific structural checks.

---

## 1. Context & Current State

### 1.1 Current instruction (verbatim)

**Source:** [src/lib/prompts/artifacts/mermaid.ts:6-7](../../src/lib/prompts/artifacts/mermaid.ts#L6-L7)

> **application/mermaid — Diagrams**
> Use Mermaid syntax for flowcharts, sequence diagrams, entity-relationship diagrams, state diagrams, Gantt charts, etc. Keep labels concise. Use proper node shapes ([] for process, {} for decision, () for rounded). Apply meaningful edge labels. Structure diagrams for readability with clear directional flow.

Two sentences. No diagram type selection guidance, no per-type syntax reference, no renderer awareness, no readability budget, no anti-patterns, no examples. The LLM is essentially guessing which of Mermaid's 20+ diagram types to use and often mixes syntax from different types.

### 1.2 Renderer ground truth

**Source:** [src/features/conversations/components/chat/artifacts/renderers/mermaid-renderer.tsx](../../src/features/conversations/components/chat/artifacts/renderers/mermaid-renderer.tsx)

```ts
const mermaid = (await import("mermaid")).default
mermaid.initialize({
  startOnLoad: false,
  theme: resolvedTheme === "dark" ? "dark" : "default",
  securityLevel: "strict",
  fontFamily: "system-ui, -apple-system, sans-serif",
})

const isValid = await mermaid.parse(content, { suppressErrors: true })
if (!isValid) { /* show error UI */ return }
const { svg } = await mermaid.render(idRef.current, content)
```

**Package:** `mermaid ^11.12.2` ([package.json:140](../../package.json#L140)) — dynamic import, loaded on demand.

**Init config implications:**

| Setting | Value | What it means for the prompt |
|---|---|---|
| `theme` | `"dark"` / `"default"` | Auto-syncs with `next-themes`. **Prompt must NOT bake a theme into `%%{init:...}%%`** or it will break dark-mode switching. |
| `securityLevel` | `"strict"` | **Disables click handlers and HTML labels.** `click NodeId href "..."` callbacks are silently blocked. `<br/>` in labels works; raw HTML tags do not. |
| `fontFamily` | `"system-ui, ..."` | Already set. Prompt must not override. |
| `startOnLoad` | `false` | Rendered on demand; irrelevant to prompt. |

**Render flow:**
1. Calls `mermaid.parse(content, { suppressErrors: true })` — if this returns falsy, the renderer displays an `"Invalid diagram syntax"` error card with "Retry" and "View source" buttons. **This means malformed output is visible to the user, not silently swallowed.**
2. On parse success, calls `mermaid.render(id, content)` and injects SVG via `dangerouslySetInnerHTML`.
3. Container: `flex items-center justify-center p-4 overflow-auto [&>svg]:max-w-full [&>svg]:h-auto` — SVG scales to container width.

**Critical implications for the instruction:**

1. **Parse failure is fatal.** Any syntax error results in a broken artifact. The instruction must teach the LLM to verify parse-ability mentally before emitting.
2. **`securityLevel: "strict"` blocks click directives.** `click Foo call alert("x")` or `click Foo href "..."` will be silently dropped. Don't suggest them.
3. **Markdown fences are a common failure mode.** `mermaid.parse()` does not strip them — ` ```mermaid\nflowchart TD\n... ``` ` fails to parse because the first token is a backtick, not a diagram declaration.
4. **Theme override = broken dark mode.** `%%{init: {'theme':'forest'}}%%` overrides the theme selector set at runtime.
5. **Supported diagram types (Mermaid 11.x):** flowchart, sequenceDiagram, classDiagram, stateDiagram/stateDiagram-v2, erDiagram, gantt, pie, mindmap, gitgraph (a.k.a. gitGraph), journey, quadrantChart, timeline, sankey-beta, xychart-beta, block-beta, packet-beta, kanban, C4Context/C4Container/C4Component/C4Deployment, requirementDiagram, architecture-beta.

### 1.3 Validation hookpoint

Same pattern as Batch 1/2: [src/lib/tools/builtin/_validate-artifact.ts](../../src/lib/tools/builtin/_validate-artifact.ts) currently has branches for `text/html`, `application/react`, and `image/svg+xml`. We add an `application/mermaid` branch.

### 1.4 Reference pattern extraction

| Pattern | Batch 1/2 precedent | Mermaid reality | Adopt? |
|---|---|---|---|
| Runtime/renderer constraint section at top of rules | ✅ | renderer has real constraints (securityLevel, theme, fenceless) | **Yes** |
| Decision matrix (what → which type) | — | 20+ diagram types, LLM needs guidance | **Yes — key addition** |
| Per-type quick-reference blocks | — | each type has totally different syntax | **Yes — top 6 types** |
| Anti-pattern list | ✅ | parse failures, fences, mixed syntax common | **Yes** |
| Token budget constraint | implicit | Mermaid rules risk bloat from 20 types | **Yes — hard cap ~2,500 tokens** |
| Few-shot examples in `examples` array | ✅ | `examples[]` is an array, consumed by `getExamples()` in `context.ts` | **Yes — 3 examples** |
| Raw content only (no markdown fences) | ✅ (HTML/SVG) | Mermaid renderer can't parse fenced input | **Yes — hard validation error** |
| "Never truncate" clause | ✅ | same failure mode applies | **Yes** |

---

## 2. Quality Dimensions (what makes a Mermaid diagram "good")

1. **Correct type selection** — the LLM picks the diagram type that matches the user's intent. An "API flow" request should yield `sequenceDiagram`, not `flowchart`.
2. **Parses without error** — no mixed syntax, no markdown fences, no invalid characters in labels.
3. **Readable at default zoom** — ≤ 15 nodes, labels ≤ 5 words, proper direction (TD for hierarchy, LR for sequence).
4. **Theme-neutral** — does not override theme in `%%{init:...}%%`; uses `classDef` sparingly for emphasis.
5. **Complete** — no `%% TODO` comments, no truncation, no "..." placeholders.

---

## 3. Diagram Type Decision Matrix

The instruction will teach the LLM this mapping. Priority is **specificity first**: if an intent maps unambiguously to one type, use it. If ambiguous, default to `flowchart TD`.

### 3.1 High-frequency types (must be detailed in rules)

| User intent keywords | Diagram type | Declaration |
|---|---|---|
| process, workflow, steps, decision tree, algorithm, pipeline | **flowchart** | `flowchart TD` / `flowchart LR` |
| API call, request/response, protocol, user interaction, handshake, OAuth, webhook | **sequenceDiagram** | `sequenceDiagram` |
| database schema, data model, tables, entities, relationships, foreign keys | **erDiagram** | `erDiagram` |
| lifecycle, status transitions, state machine, FSM, order status, auth states | **stateDiagram-v2** | `stateDiagram-v2` |
| class hierarchy, OOP, inheritance, interface, domain model (code-centric) | **classDiagram** | `classDiagram` |
| timeline, project schedule, roadmap, phases, milestones, sprint plan | **gantt** | `gantt` |

### 3.2 Medium-frequency types (cover basics)

| User intent keywords | Diagram type | Declaration |
|---|---|---|
| brainstorm, concept map, topic tree, idea hierarchy | **mindmap** | `mindmap` |
| git branching, release flow, branching strategy | **gitGraph** | `gitGraph` |
| distribution, proportion, percentage breakdown | **pie** | `pie` |
| user journey, experience map, CX touchpoints | **journey** | `journey` |
| 2×2 matrix, priority matrix, effort/impact | **quadrantChart** | `quadrantChart` |
| historical events, chronology | **timeline** | `timeline` |

### 3.3 Low-frequency types (mention in "Also available")

`sankey-beta`, `xychart-beta`, `block-beta`, `packet-beta`, `kanban`, `C4Context`, `C4Container`, `requirementDiagram`, `architecture-beta`. Not detailed; the LLM can recognize them by name if asked explicitly.

### 3.4 Ambiguity defaults

- "architecture diagram" (generic) → **flowchart LR** with subgraphs per layer. (Not `C4Context` — C4 requires specialized participant syntax.)
- "block diagram" → **flowchart LR**.
- "org chart" → **flowchart TD**.
- Anything truly ambiguous → **flowchart TD**.

---

## 4. Common LLM Mermaid Failure Modes

Catalogued from existing failure reports + reference prompt analysis:

1. **Markdown code fences in output** — `` ```mermaid\nflowchart TD\n...\n``` ``. Renderer's `mermaid.parse()` fails because the first token is a backtick. **Must be a hard validation error.**
2. **Missing diagram type declaration** — LLM writes `A --> B` without a preceding `flowchart TD`. Parse fails.
3. **Mixed syntax from different diagram types** — e.g. using `->>` (sequence diagram arrow) inside a flowchart, or `{{...}}` (hexagon) inside a sequence diagram.
4. **Special characters in labels** — parentheses, colons, or quotes inside an unquoted label. `A[User (admin)]` fails; `A["User (admin)"]` works.
5. **Too many nodes** — 40+ nodes unreadable at container width.
6. **Wrong direction** — `TD` for a horizontal sequential process that would be much clearer as `LR`.
7. **Subgraph syntax errors** — forgetting `end`, mixing `subgraph` inside a sequence diagram (not supported there).
8. **Click callbacks** — `click A call someFunc()` is silently blocked by `securityLevel: "strict"` but still wastes tokens.
9. **Theme override in `%%{init:...}%%`** — `%%{init: {'theme':'forest'}}%%` clashes with the runtime theme sync.
10. **Truncation** — "...etc" or `%% (more nodes here)` in long diagrams.

---

## 5. Plan

### 5.1 Rewrite `src/lib/prompts/artifacts/mermaid.ts`

Replace the current `rules` / `summary` / `examples` with the following. Structure mirrors `html.ts` and `svg.ts` so the format stays consistent across the batch series.

**File:** [src/lib/prompts/artifacts/mermaid.ts](../../src/lib/prompts/artifacts/mermaid.ts)

**New `summary`:**
> "Diagrams rendered via Mermaid syntax — flowcharts, sequence, ER, state, class, Gantt, mindmap, and more."

**New `rules` (ready to paste, ≤ 2,500 tokens):**

See Section 5.1.1 below for the full string.

**New `examples` (3 complete diagrams):**

1. **Flowchart** — 7 nodes incl. decision diamond + subgraph, `TD` direction
2. **Sequence diagram** — 4 participants (Client, Auth, Resource, DB), `alt` block, notes
3. **ER diagram** — 4 entities with attributes and crow's-foot relationships

#### 5.1.1 Full `rules` string

````md
**application/mermaid — Diagrams**

You are generating raw Mermaid syntax that will be parsed by `mermaid.parse()` and rendered to SVG inside a themed, scrollable container. The result must look like a diagram produced by a senior engineer — correctly typed, parse-clean, readable at default zoom, and theme-neutral so dark mode works.

## Runtime Environment
- **Library:** Mermaid v11.x (loaded dynamically at render time).
- **Theme:** the renderer sets `theme: "dark"` or `"default"` based on the active app theme. **DO NOT** override it with a `%%{init: {'theme':'...'}}%%` directive — it breaks the dark-mode toggle.
- **Security level:** `strict`. Click directives (`click NodeId call fn()` or `click NodeId href "..."`) are silently blocked. **Do not emit them.**
- **Parse failure is fatal.** If `mermaid.parse()` rejects the content, the user sees a red error card instead of the diagram. Mentally trace the syntax before you emit it.
- **Output format: raw Mermaid syntax ONLY.** NEVER wrap the output in ` ```mermaid ... ``` ` markdown fences. The first non-empty line must be a diagram type declaration.

## Diagram Type Selection
Choose the type that matches the user's intent. When ambiguous, default to `flowchart TD`.

| User wants... | Use this type | Declaration |
|---|---|---|
| process, workflow, decision tree, algorithm, pipeline, org chart | **flowchart** | `flowchart TD` (top-down) or `flowchart LR` (left-right) |
| API call, request/response, protocol, OAuth, webhook, user interaction | **sequenceDiagram** | `sequenceDiagram` |
| database schema, data model, tables, entities, relationships | **erDiagram** | `erDiagram` |
| lifecycle, status transitions, state machine, order states | **stateDiagram-v2** | `stateDiagram-v2` |
| class hierarchy, OOP, inheritance, interface, code-level domain model | **classDiagram** | `classDiagram` |
| timeline, project schedule, roadmap, phases, sprint plan | **gantt** | `gantt` |
| brainstorm, concept map, idea hierarchy | **mindmap** | `mindmap` |
| git branching / release flow | **gitGraph** | `gitGraph` |
| distribution, percentage breakdown | **pie** | `pie` |
| user journey / experience map | **journey** | `journey` |
| 2×2 priority / effort-impact matrix | **quadrantChart** | `quadrantChart` |

Also available (use by name if explicitly asked): `timeline`, `sankey-beta`, `xychart-beta`, `block-beta`, `kanban`, `C4Context`, `requirementDiagram`, `architecture-beta`.

**Disambiguation:** "architecture diagram" → `flowchart LR` with `subgraph` per layer. "Block diagram" → `flowchart LR`. Do NOT reach for `C4Context` unless the user explicitly asks for C4.

## Per-Type Quick Reference

### flowchart
```
flowchart TD
  A[Start] --> B{Decision?}
  B -- Yes --> C[Process]
  B -- No --> D[End]
  subgraph Auth
    C --> E[(Database)]
  end
```
- Declaration: `flowchart TD` / `LR` / `BT` / `RL`.
- Node shapes: `[rect]`, `(rounded)`, `([stadium])`, `[[subroutine]]`, `[(cylinder)]`, `((circle))`, `{diamond}`, `{{hexagon}}`.
- Arrows: `-->` (solid), `---` (line), `-.->`  (dotted), `==>` (thick). Label: `A -- text --> B` or `A -->|text| B`.
- Subgraphs: `subgraph Name` … `end`. Max 2 levels deep.
- Labels with special chars (`()`, `:`, `"`) must be quoted: `A["User (admin)"]`.

### sequenceDiagram
```
sequenceDiagram
  participant C as Client
  participant S as Server
  C->>S: Request
  S-->>C: Response
  alt success
    S->>C: 200 OK
  else error
    S->>C: 500 Error
  end
  Note over C,S: Full round-trip
```
- Declaration: `sequenceDiagram`.
- Participants: `participant Alias as Full Name` (optional but recommended).
- Arrows: `->>`  (solid w/ arrow), `-->>` (dashed w/ arrow, for responses), `-)` (async), `-x` (lost message).
- Blocks: `alt / else / end`, `opt / end`, `loop / end`, `par / and / end`, `critical / option / end`.
- Notes: `Note right of X: text`, `Note over X,Y: text`.
- Activation: `->>+` and `-->>-` (auto activate/deactivate).

### erDiagram
```
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
  CUSTOMER {
    string name
    string email PK
  }
  ORDER {
    int    id PK
    date   createdAt
  }
```
- Declaration: `erDiagram`.
- Entities: capitalized singular nouns, no spaces (use `_` or quote).
- Cardinality (left–right): `||--||` exactly one, `||--o{` one-to-many, `}o--o{` many-to-many, `||..||` non-identifying (dashed).
- Attributes: `type name` inside `{ }`. Suffix `PK` / `FK` / `UK` for keys.

### stateDiagram-v2
```
stateDiagram-v2
  [*] --> Draft
  Draft --> Review: submit
  Review --> Approved: accept
  Review --> Draft: reject
  Approved --> [*]
```
- Declaration: `stateDiagram-v2` (prefer v2 over `stateDiagram`).
- `[*]` is start/end. `-->` is transition; append `: label` for trigger.
- Composite states: `state Parent { ... }`.

### classDiagram
```
classDiagram
  class Animal {
    +String name
    +int age
    +makeSound() void
  }
  Animal <|-- Dog
  Animal <|-- Cat
```
- Declaration: `classDiagram`.
- Members: `+` public, `-` private, `#` protected. Methods end with `()`.
- Relationships: `<|--` inheritance, `*--` composition, `o--` aggregation, `-->` association, `..>` dependency, `..|>` realization.

### gantt
```
gantt
  title Project Roadmap
  dateFormat YYYY-MM-DD
  section Planning
  Requirements :a1, 2025-01-01, 14d
  Design       :a2, after a1, 21d
  section Build
  Backend      :a3, after a2, 30d
  Frontend     :a4, after a2, 28d
```
- Declaration: `gantt`.
- Required: `title`, `dateFormat YYYY-MM-DD`.
- Task format: `Name :[tag,] [id,] start, (end|Nd)`. Tags: `done`, `active`, `crit`, `milestone`.
- Use `after <taskId>` to chain. `section Name` groups tasks.

## Readability Rules
- **≤ 15 nodes/participants/entities per diagram.** More than that becomes unreadable at default container width.
- **Labels: ≤ 5 words, Title Case.** Avoid full sentences inside nodes.
- **Direction:** `TD` (top-down) for hierarchies and decision trees; `LR` (left-right) for sequential/pipeline flows.
- **Subgraphs: max 2 levels deep.**
- **Edge labels:** short verb phrases (`validates`, `returns 200`), not full sentences.

## Styling
- **Do NOT override the theme.** The renderer handles dark/light sync automatically.
- **Use `classDef` sparingly** for emphasis — max 3 highlight colors across the whole diagram.
  Example: `classDef critical fill:#fee,stroke:#f00` then `class NodeA,NodeB critical`.
- **Do NOT use `linkStyle`** unless absolutely necessary (it targets edges by index and breaks easily when the diagram changes).
- **No `%%{init: ...}%%` theme blocks.**

## Code Quality — STRICT
- **NEVER truncate.** No `%% ... more nodes here`, no `...`, no "and so on". Output the COMPLETE diagram.
- **NEVER output markdown fences.** No ` ```mermaid `, no ` ``` ` at the end. Raw Mermaid syntax only.
- **NEVER mix syntax from different diagram types.** Do not use `->>`  in a flowchart, do not put `subgraph` in a sequence diagram.
- **Quote labels that contain `()`, `:`, `,`, `"` or `#`:** `A["User (admin): admin@example.com"]`.
- **Mentally verify:** "would `mermaid.parse()` accept this?" If unsure, keep the diagram simpler.

## Anti-Patterns
- ❌ Markdown fences around the output (` ```mermaid ... ``` `)
- ❌ Missing diagram type declaration on the first non-empty line
- ❌ More than 15 nodes (unreadable)
- ❌ Labels longer than 5 words
- ❌ Nested subgraphs more than 2 levels deep
- ❌ `click NodeId call fn()` or `click NodeId href "..."` (blocked by `securityLevel: strict`)
- ❌ `%%{init: {'theme':'forest'}}%%` or any theme override (breaks dark mode)
- ❌ Mixed syntax (e.g. `->>`  inside a flowchart)
- ❌ Unquoted labels containing `()`, `:`, or `"`
- ❌ Truncating "for brevity" with `...` or `%% more here`
- ❌ HTML tags beyond `<br/>` in labels (rest are blocked by strict security level)
````

**Token budget check:** The string above lands around 2,100–2,300 tokens depending on tokenizer. Under the 2,500 cap.

### 5.2 Validation rules

**File:** [src/lib/tools/builtin/_validate-artifact.ts](../../src/lib/tools/builtin/_validate-artifact.ts)

Add a fourth branch to `validateArtifactContent()`:

```ts
if (type === "application/mermaid") return validateMermaid(content)
```

Implement `validateMermaid(content: string)`. **No new dependencies** — pure string checks.

**Recognized diagram type declarations** (case-sensitive prefix, first non-empty, non-frontmatter, non-directive line):

```
flowchart, graph, sequenceDiagram, erDiagram, stateDiagram, stateDiagram-v2,
classDiagram, gantt, pie, mindmap, gitGraph, journey, quadrantChart, timeline,
sankey-beta, xychart-beta, block-beta, packet-beta, kanban,
C4Context, C4Container, C4Component, C4Deployment,
requirementDiagram, architecture-beta
```

**ERRORS (block artifact, force LLM retry):**

1. **Empty content.** `"Mermaid content is empty."`
2. **Markdown fence wrap.** First non-empty trimmed line starts with ` ``` `. Error: `"Remove markdown code fences (\`\`\`mermaid ... \`\`\`) — output raw Mermaid syntax only."`
3. **No recognized diagram type declaration.** Scan the first non-empty, non-frontmatter, non-comment line for a recognized prefix. If none found: `"Missing or unrecognized diagram type declaration on the first non-empty line. Must start with one of: flowchart, sequenceDiagram, erDiagram, stateDiagram-v2, classDiagram, gantt, pie, mindmap, gitGraph, journey, quadrantChart, timeline, sankey-beta, xychart-beta, block-beta, kanban, C4Context, requirementDiagram, architecture-beta."`

**Edge cases handled by "first non-empty line" detection:**
- **Frontmatter:** `---\ntitle: X\n---\nflowchart TD` — skip lines between a leading `---` and the next `---`.
- **Directive:** `%%{init: {...}}%%\nflowchart TD` — skip lines that start with `%%`.
- **Comments:** `%% a comment\nflowchart TD` — skip `%%` comment lines.

**WARNINGS (don't block, surface for telemetry):**

4. **Content length > 3,000 characters.** `"Mermaid content is ${len} chars — likely too complex to render readably. Aim for ≤ 3000 chars."`
5. **More than 15 node definitions (heuristic).** Count lines matching `/^\s*[A-Za-z_][A-Za-z0-9_-]*\s*[\[\(\{]/m` (flowchart-style node definitions). Warning: `"Detected ${n} flowchart node definitions — diagrams with more than 15 nodes become unreadable. Consider splitting into multiple diagrams."`

**Not validated** (out of scope — Mermaid has its own parser at render time):
- Full syntax correctness — we rely on the renderer's `mermaid.parse()`.
- Arrow-vs-type consistency — requires a real parser.
- Label balance / quoting — ditto.

**Auto-fix flow:** Same as Batch 1/2. `formatValidationError()` is generic. Retry cap is already in place (1 retry).

#### 5.2.1 Implementation sketch

```ts
function validateMermaid(content: string): ArtifactValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!content.trim()) {
    errors.push("Mermaid content is empty.")
    return { ok: false, errors, warnings }
  }

  // Find the first non-empty, non-frontmatter, non-directive, non-comment line.
  const rawLines = content.split("\n")
  let inFrontmatter = false
  let seenFrontmatterFence = false
  let firstLine: string | null = null
  let firstLineIndex = -1

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim()
    if (!line) continue

    // Handle leading frontmatter: --- ... ---
    if (line === "---") {
      if (!seenFrontmatterFence) {
        seenFrontmatterFence = true
        inFrontmatter = true
        continue
      }
      if (inFrontmatter) {
        inFrontmatter = false
        continue
      }
    }
    if (inFrontmatter) continue

    // Skip directives and comments
    if (line.startsWith("%%")) continue

    firstLine = line
    firstLineIndex = i
    break
  }

  // Error: markdown fence wrap
  if (firstLine && firstLine.startsWith("```")) {
    errors.push(
      "Remove markdown code fences (```mermaid ... ```) — output raw Mermaid syntax only."
    )
    return { ok: false, errors, warnings }
  }

  // Error: no recognized diagram type
  const RECOGNIZED = [
    "flowchart", "graph",
    "sequenceDiagram",
    "erDiagram",
    "stateDiagram-v2", "stateDiagram",
    "classDiagram",
    "gantt", "pie", "mindmap",
    "gitGraph",
    "journey", "quadrantChart",
    "timeline",
    "sankey-beta", "xychart-beta", "block-beta", "packet-beta", "kanban",
    "C4Context", "C4Container", "C4Component", "C4Deployment",
    "requirementDiagram", "architecture-beta",
  ]
  const hasDeclaration =
    firstLine != null &&
    RECOGNIZED.some((k) => firstLine === k || firstLine.startsWith(k + " ") || firstLine.startsWith(k + "\t"))

  if (!hasDeclaration) {
    errors.push(
      "Missing or unrecognized diagram type declaration on the first non-empty line. Must start with one of: flowchart, sequenceDiagram, erDiagram, stateDiagram-v2, classDiagram, gantt, pie, mindmap, gitGraph, journey, quadrantChart, timeline, sankey-beta, xychart-beta, block-beta, kanban, C4Context, requirementDiagram, architecture-beta."
    )
    return { ok: false, errors, warnings }
  }

  // Warning: too long
  if (content.length > 3000) {
    warnings.push(
      `Mermaid content is ${content.length} chars — likely too complex to render readably. Aim for ≤ 3000 chars.`
    )
  }

  // Warning: too many flowchart-style node definitions
  // Match lines starting a flowchart node: `  NodeId[...` / `  NodeId(...` / `  NodeId{...`
  const nodeDefRegex = /^\s*[A-Za-z_][A-Za-z0-9_-]*\s*[\[\(\{]/gm
  const nodeMatches = content.match(nodeDefRegex)
  if (nodeMatches && nodeMatches.length > 15) {
    warnings.push(
      `Detected ${nodeMatches.length} flowchart node definitions — diagrams with more than 15 nodes become unreadable. Consider splitting into multiple diagrams.`
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}
```

Notes:
- No new dependencies. Pure string/regex.
- The `stateDiagram-v2` entry comes before `stateDiagram` in the scan loop so the longer prefix matches first (not strictly required given `startsWith(k + " ")` but defensive).
- The node-count heuristic deliberately only counts flowchart-style node definitions. It's a noisy signal for sequence diagrams and ER diagrams but the user-facing telemetry is fine with that — it's a warning, not an error.

### 5.3 Tests

**File:** [tests/unit/validate-artifact.test.ts](../../tests/unit/validate-artifact.test.ts) (extend existing file)

Add a new `describe` block:

```ts
describe("validateArtifactContent — application/mermaid", () => {
  const v = (src: string) => validateArtifactContent("application/mermaid", src)

  it("accepts a valid flowchart", () => {
    const r = v(`flowchart TD\n  A[Start] --> B[End]`)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("accepts a valid sequence diagram", () => {
    const r = v(`sequenceDiagram\n  Alice->>Bob: Hello`)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("accepts a valid ER diagram", () => {
    const r = v(`erDiagram\n  CUSTOMER ||--o{ ORDER : places`)
    expect(r.ok).toBe(true)
  })

  it("accepts a valid state diagram", () => {
    const r = v(`stateDiagram-v2\n  [*] --> Draft\n  Draft --> [*]`)
    expect(r.ok).toBe(true)
  })

  it("accepts a valid gantt chart", () => {
    const r = v(`gantt\n  title Roadmap\n  dateFormat YYYY-MM-DD\n  section A\n  Task :a1, 2025-01-01, 5d`)
    expect(r.ok).toBe(true)
  })

  it("accepts a flowchart with leading frontmatter", () => {
    const r = v(`---\ntitle: My Chart\n---\nflowchart TD\n  A --> B`)
    expect(r.ok).toBe(true)
  })

  it("accepts a flowchart preceded by a directive comment", () => {
    const r = v(`%% leading comment\nflowchart TD\n  A --> B`)
    expect(r.ok).toBe(true)
  })

  it("rejects empty content", () => {
    const r = v("   ")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/empty/i)
  })

  it("rejects content wrapped in markdown fences", () => {
    const r = v("```mermaid\nflowchart TD\n  A --> B\n```")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/markdown code fences/i)
  })

  it("rejects content with no diagram declaration", () => {
    const r = v(`A[Start] --> B[End]`)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/diagram type declaration/i)
  })

  it("rejects content with an unknown diagram type", () => {
    const r = v(`uwuDiagram\n  A --> B`)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/diagram type declaration/i)
  })

  it("warns on very long content", () => {
    const padding = "  A --> B\n".repeat(400) // > 3000 chars
    const r = v(`flowchart TD\n${padding}`)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/chars/i)
  })

  it("warns on more than 15 node definitions", () => {
    const nodes = Array.from({ length: 18 }, (_, i) => `  N${i}[Node ${i}]`).join("\n")
    const r = v(`flowchart TD\n${nodes}`)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/15 nodes/i)
  })
})
```

### 5.4 Implementation Order

| # | Task | Files |
|---|---|---|
| 1 | Rewrite `mermaid.ts` (rules, summary, examples) | [src/lib/prompts/artifacts/mermaid.ts](../../src/lib/prompts/artifacts/mermaid.ts) |
| 2 | Implement `validateMermaid()` and wire into `validateArtifactContent()` | [src/lib/tools/builtin/_validate-artifact.ts](../../src/lib/tools/builtin/_validate-artifact.ts) |
| 3 | Add Mermaid test block (13 cases above) to the existing validation test file | [tests/unit/validate-artifact.test.ts](../../tests/unit/validate-artifact.test.ts) |
| 4 | Run `bun run vitest --run tests/unit/validate-artifact.test.ts` — all tests pass | — |
| 5 | Run `bun run tsc --noEmit` — zero TypeScript errors | — |
| 6 | Manual test pass with the 6 prompts in §5.5 | — |

### 5.5 Test Prompts

Run these against the canvas with `application/mermaid` selected. Evaluate each against the rubric below.

1. **Flowchart:** "Create a flowchart for user registration: signup → email verification → profile setup → dashboard"
2. **Sequence diagram:** "Create a sequence diagram for OAuth2 authorization code flow between Client, Auth Server, and Resource Server"
3. **ER diagram:** "Create an ER diagram for e-commerce: Users, Products, Orders, OrderItems, Categories"
4. **State diagram:** "Create a state diagram for order lifecycle: draft → submitted → processing → shipped → delivered, with cancel possible from submitted and processing"
5. **Gantt chart:** "Create a Gantt chart for a 3-month project: planning (2 weeks), design (3 weeks), development (6 weeks), testing (2 weeks), deployment (1 week)"
6. **Ambiguous ("architecture"):** "Create a diagram of our microservice architecture: API Gateway, User Service, Product Service, Order Service, Payment Service, all connected via message queue"

**Prompt #6 is the most important** — it tests whether the LLM correctly picks `flowchart LR` with subgraphs rather than reaching for `C4Context`.

**Per-prompt rubric:**
- ✅ Correct diagram type chosen (per §3.1)
- ✅ Parses without error (no red error card)
- ✅ Readable — ≤ 15 nodes/participants, labels ≤ 5 words
- ✅ Proper syntax (arrows, labels, quoting)
- ✅ No markdown fences in output
- ✅ Complete (no truncation)
- ✅ Direction appropriate (`TD` for hierarchical, `LR` for sequential)
- ✅ No theme override directive

---

## 6. Risks & Open Questions

1. **Node-count heuristic is noisy for non-flowchart diagrams.** The regex `^\s*[A-Za-z_][A-Za-z0-9_-]*\s*[\[\(\{]/m` will fire on sequence diagram `participant` lines (no, actually — `participant` is followed by a space, not a bracket, so it's safe) and on ER entity attribute blocks (yes — `CUSTOMER {` will match). This means a complex ER diagram may warn when it shouldn't. **Mitigation:** keep it as a warning only, not an error. If the false-positive rate is too high in practice, tighten the regex or make it flowchart-specific by checking the declaration line first.

2. **Mermaid 11.x vs docs drift.** The reference docs we fetched come from `mermaid-js/mermaid` `develop` branch. Some syntax (e.g. `@{ shape: ... }` in flowcharts v11.3.0+) is current-version-specific. The instruction sticks to the stable syntax that works in 11.x to avoid confusion.

3. **`gitGraph` vs `gitgraph`.** Mermaid accepts both casings but the canonical form is `gitGraph`. The validator accepts the canonical form; the instruction also uses the canonical form.

4. **`graph` is a legacy alias for `flowchart`.** Both are valid declarations. The validator recognizes both. The instruction steers the LLM toward `flowchart` because it's the modern canonical form.

5. **We cannot validate full Mermaid syntax without running the parser.** The server-side validator is intentionally a thin structural check. The renderer's `mermaid.parse()` call is the real arbiter, and its failure produces a visible error card. This two-tier strategy (cheap structural pre-check + runtime parser) matches the SVG pattern from Batch 2.

---

## 7. Summary

**Top 3 most impactful additions vs the current 3-line rules:**

1. **Diagram Type Decision Matrix.** The current rules list diagram type names but give the LLM zero guidance on *when* to use each. The new matrix maps user-intent keywords to diagram types with explicit disambiguation defaults ("architecture" → `flowchart LR`, not C4). This eliminates the largest class of "wrong tool for the job" failures.

2. **Per-type quick reference with inline examples.** Six compact syntax cheat-sheets (flowchart, sequence, ER, state, class, gantt) covering the 90% use case. Each one shows the declaration, node/entity syntax, arrow types, and a 3-6 line worked example. This directly addresses the "mixed syntax" failure mode (e.g. using sequence-diagram arrows in a flowchart).

3. **Renderer-constraint awareness + markdown-fence validation.** The prompt now knows that `securityLevel: "strict"` blocks click callbacks and that the theme is runtime-controlled (no `%%{init:...}%%` overrides). The validator now hard-rejects markdown-fenced output, which is the single most common mechanical failure mode observed in testing.

**Most critical renderer constraint:** `securityLevel: "strict"` + runtime theme switching. Together these mean any `click NodeId` directive is silently blocked and any `%%{init: {'theme':'...'}}%%` directive breaks dark-mode sync. Neither is obvious from the Mermaid docs — both must be taught by the prompt.

**Trickiest diagram type from a syntax standpoint:** **Gantt.** Its metadata grammar (`[tag,] [id,] start, (end|Nd)` with `after <id>` chaining and `dateFormat` requirements) is the densest per-character syntax in Mermaid and the easiest to get subtly wrong. The instruction includes a complete, copy-pasteable gantt example specifically for this reason.
