export const mermaidArtifact = {
  type: "application/mermaid" as const,
  label: "Mermaid Diagram",
  summary:
    "Diagrams rendered via Mermaid syntax — flowcharts, sequence, ER, state, class, Gantt, mindmap, and more.",
  rules: `**application/mermaid — Diagrams**

You are generating raw Mermaid syntax that will be parsed by \`mermaid.parse()\` and rendered to SVG inside a themed, scrollable container. The result must look like a diagram produced by a senior engineer — correctly typed, parse-clean, readable at default zoom, and theme-neutral so dark mode works.

## Runtime Environment
- **Library:** Mermaid v11.x (loaded dynamically at render time).
- **Theme:** the renderer sets \`theme: "dark"\` or \`"default"\` based on the active app theme. **DO NOT** override it with a \`%%{init: {'theme':'...'}}%%\` directive — it breaks the dark-mode toggle.
- **Security level:** \`strict\`. Click directives (\`click NodeId call fn()\` or \`click NodeId href "..."\`) are silently blocked. **Do not emit them.**
- **Parse failure is fatal.** If \`mermaid.parse()\` rejects the content, the user sees a red error card instead of the diagram. Mentally trace the syntax before you emit it.
- **Output format: raw Mermaid syntax ONLY.** NEVER wrap the output in \`\`\`mermaid ... \`\`\` markdown fences. The first non-empty line must be a diagram type declaration.

## Diagram Type Selection
Choose the type that matches the user's intent. When ambiguous, default to \`flowchart TD\`.

| User wants... | Use this type | Declaration |
|---|---|---|
| process, workflow, decision tree, algorithm, pipeline, org chart | **flowchart** | \`flowchart TD\` (top-down) or \`flowchart LR\` (left-right) |
| API call, request/response, protocol, OAuth, webhook, user interaction | **sequenceDiagram** | \`sequenceDiagram\` |
| database schema, data model, tables, entities, relationships | **erDiagram** | \`erDiagram\` |
| lifecycle, status transitions, state machine, order states | **stateDiagram-v2** | \`stateDiagram-v2\` |
| class hierarchy, OOP, inheritance, interface, code-level domain model | **classDiagram** | \`classDiagram\` |
| timeline, project schedule, roadmap, phases, sprint plan | **gantt** | \`gantt\` |
| brainstorm, concept map, idea hierarchy | **mindmap** | \`mindmap\` |
| git branching / release flow | **gitGraph** | \`gitGraph\` |
| distribution, percentage breakdown | **pie** | \`pie\` |
| user journey / experience map | **journey** | \`journey\` |
| 2×2 priority / effort-impact matrix | **quadrantChart** | \`quadrantChart\` |

Also available (use by name if explicitly asked): \`timeline\`, \`sankey-beta\`, \`xychart-beta\`, \`block-beta\`, \`kanban\`, \`C4Context\`, \`requirementDiagram\`, \`architecture-beta\`.

**Disambiguation:** "architecture diagram" → \`flowchart LR\` with \`subgraph\` per layer. "Block diagram" → \`flowchart LR\`. Do NOT reach for \`C4Context\` unless the user explicitly asks for C4.

## Per-Type Quick Reference

### flowchart
\`\`\`
flowchart TD
  A[Start] --> B{Decision?}
  B -- Yes --> C[Process]
  B -- No --> D[End]
  subgraph Auth
    C --> E[(Database)]
  end
\`\`\`
- Declaration: \`flowchart TD\` / \`LR\` / \`BT\` / \`RL\`.
- Node shapes: \`[rect]\`, \`(rounded)\`, \`([stadium])\`, \`[[subroutine]]\`, \`[(cylinder)]\`, \`((circle))\`, \`{diamond}\`, \`{{hexagon}}\`.
- Arrows: \`-->\` (solid), \`---\` (line), \`-.->\` (dotted), \`==>\` (thick). Label: \`A -- text --> B\` or \`A -->|text| B\`.
- Subgraphs: \`subgraph Name\` … \`end\`. Max 2 levels deep.
- Labels with special chars (\`()\`, \`:\`, \`"\`) must be quoted: \`A["User (admin)"]\`.

### sequenceDiagram
\`\`\`
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
\`\`\`
- Declaration: \`sequenceDiagram\`.
- Participants: \`participant Alias as Full Name\` (optional but recommended).
- Arrows: \`->>\` (solid w/ arrow), \`-->>\` (dashed w/ arrow, for responses), \`-)\` (async), \`-x\` (lost message).
- Blocks: \`alt / else / end\`, \`opt / end\`, \`loop / end\`, \`par / and / end\`, \`critical / option / end\`.
- Notes: \`Note right of X: text\`, \`Note over X,Y: text\`.
- Activation: \`->>+\` and \`-->>-\` (auto activate/deactivate).

### erDiagram
\`\`\`
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
\`\`\`
- Declaration: \`erDiagram\`.
- Entities: capitalized singular nouns, no spaces (use \`_\` or quote).
- Cardinality (left–right): \`||--||\` exactly one, \`||--o{\` one-to-many, \`}o--o{\` many-to-many, \`||..||\` non-identifying (dashed).
- Attributes: \`type name\` inside \`{ }\`. Suffix \`PK\` / \`FK\` / \`UK\` for keys.

### stateDiagram-v2
\`\`\`
stateDiagram-v2
  [*] --> Draft
  Draft --> Review: submit
  Review --> Approved: accept
  Review --> Draft: reject
  Approved --> [*]
\`\`\`
- Declaration: \`stateDiagram-v2\` (prefer v2 over \`stateDiagram\`).
- \`[*]\` is start/end. \`-->\` is transition; append \`: label\` for trigger.
- Composite states: \`state Parent { ... }\`.

### classDiagram
\`\`\`
classDiagram
  class Animal {
    +String name
    +int age
    +makeSound() void
  }
  Animal <|-- Dog
  Animal <|-- Cat
\`\`\`
- Declaration: \`classDiagram\`.
- Members: \`+\` public, \`-\` private, \`#\` protected. Methods end with \`()\`.
- Relationships: \`<|--\` inheritance, \`*--\` composition, \`o--\` aggregation, \`-->\` association, \`..>\` dependency, \`..|>\` realization.

### gantt
\`\`\`
gantt
  title Project Roadmap
  dateFormat YYYY-MM-DD
  section Planning
  Requirements :a1, 2025-01-01, 14d
  Design       :a2, after a1, 21d
  section Build
  Backend      :a3, after a2, 30d
  Frontend     :a4, after a2, 28d
\`\`\`
- Declaration: \`gantt\`.
- Required: \`title\`, \`dateFormat YYYY-MM-DD\`.
- Task format: \`Name :[tag,] [id,] start, (end|Nd)\`. Tags: \`done\`, \`active\`, \`crit\`, \`milestone\`.
- Use \`after <taskId>\` to chain. \`section Name\` groups tasks.

## Readability Rules
- **≤ 15 nodes/participants/entities per diagram.** More than that becomes unreadable at default container width.
- **Labels: ≤ 5 words, Title Case.** Avoid full sentences inside nodes.
- **Direction:** \`TD\` (top-down) for hierarchies and decision trees; \`LR\` (left-right) for sequential/pipeline flows.
- **Subgraphs: max 2 levels deep.**
- **Edge labels:** short verb phrases (\`validates\`, \`returns 200\`), not full sentences.

## Styling
- **Do NOT override the theme.** The renderer handles dark/light sync automatically.
- **Use \`classDef\` sparingly** for emphasis — max 3 highlight colors across the whole diagram.
  Example: \`classDef critical fill:#fee,stroke:#f00\` then \`class NodeA,NodeB critical\`.
- **Do NOT use \`linkStyle\`** unless absolutely necessary (it targets edges by index and breaks easily when the diagram changes).
- **No \`%%{init: ...}%%\` theme blocks.**

## Code Quality — STRICT
- **NEVER truncate.** No \`%% ... more nodes here\`, no \`...\`, no "and so on". Output the COMPLETE diagram.
- **NEVER output markdown fences.** No \`\`\`mermaid, no \`\`\` at the end. Raw Mermaid syntax only.
- **NEVER mix syntax from different diagram types.** Do not use \`->>\` in a flowchart, do not put \`subgraph\` in a sequence diagram.
- **Quote labels that contain \`()\`, \`:\`, \`,\`, \`"\` or \`#\`:** \`A["User (admin): admin@example.com"]\`.
- **Mentally verify:** "would \`mermaid.parse()\` accept this?" If unsure, keep the diagram simpler.

## Anti-Patterns
- ❌ Markdown fences around the output (\`\`\`mermaid ... \`\`\`)
- ❌ Missing diagram type declaration on the first non-empty line
- ❌ More than 15 nodes (unreadable)
- ❌ Labels longer than 5 words
- ❌ Nested subgraphs more than 2 levels deep
- ❌ \`click NodeId call fn()\` or \`click NodeId href "..."\` (blocked by \`securityLevel: strict\`)
- ❌ \`%%{init: {'theme':'forest'}}%%\` or any theme override (breaks dark mode)
- ❌ Mixed syntax (e.g. \`->>\` inside a flowchart)
- ❌ Unquoted labels containing \`()\`, \`:\`, or \`"\`
- ❌ Truncating "for brevity" with \`...\` or \`%% more here\`
- ❌ HTML tags beyond \`<br/>\` in labels (rest are blocked by strict security level)`,
  examples: [
    {
      label: "Flowchart (user registration with decision + subgraph, TD)",
      code: `flowchart TD
  Start([Visit Site]) --> Signup[Create Account]
  Signup --> Verify{Email Verified?}
  Verify -- No --> Resend[Resend Email]
  Resend --> Verify
  Verify -- Yes --> Profile[Complete Profile]
  subgraph Onboarding
    Profile --> Preferences[Set Preferences]
    Preferences --> Tour[Product Tour]
  end
  Tour --> Dashboard([Dashboard])`,
    },
    {
      label: "Sequence diagram (OAuth2 authorization code flow)",
      code: `sequenceDiagram
  participant U as User
  participant C as Client App
  participant A as Auth Server
  participant R as Resource Server
  U->>C: Click Login
  C->>A: Redirect with client_id
  A->>U: Show consent screen
  U-->>A: Approve scopes
  A-->>C: Redirect with auth code
  C->>A: Exchange code for token
  alt valid code
    A-->>C: Access token + refresh token
    C->>R: GET /resource (Bearer token)
    R-->>C: 200 OK + data
  else invalid code
    A-->>C: 400 Bad Request
  end
  Note over C,R: Token can be refreshed via refresh_token`,
    },
    {
      label: "ER diagram (e-commerce core schema)",
      code: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ ORDER_ITEM : contains
  PRODUCT ||--o{ ORDER_ITEM : includes
  CATEGORY ||--o{ PRODUCT : classifies
  CUSTOMER {
    int    id PK
    string email UK
    string name
    date   createdAt
  }
  ORDER {
    int    id PK
    int    customerId FK
    string status
    date   placedAt
  }
  ORDER_ITEM {
    int    id PK
    int    orderId FK
    int    productId FK
    int    quantity
    float  unitPrice
  }
  PRODUCT {
    int    id PK
    int    categoryId FK
    string name
    float  price
  }
  CATEGORY {
    int    id PK
    string name
  }`,
    },
  ],
}
