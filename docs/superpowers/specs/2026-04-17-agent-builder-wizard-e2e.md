# Agent Builder Wizard — Manual E2E Walkthrough

Run after every deploy until we add automated e2e.

## Prereqs

- Seeded org with: ≥2 tools, ≥1 skill, ≥1 MCP server, ≥1 KB group, ≥3 models.
- Logged in as org admin.
- `OPENROUTER_API_KEY` set.

## Happy path

1. Navigate `/dashboard/agent-builder/new`.
2. AI greets with: *"In a sentence or two, what do you want this agent to do?"*.
3. Type: *"A customer support agent for our e-commerce store that can check order status and answer FAQs"*.
4. AI asks about audience → reply *"customers"*.
5. AI asks about data → reply *"use our product docs KB"*.
6. AI asks about actions → reply *"look up orders"*.
7. AI calls `listTools`, `listKnowledgeGroups`, `listModels` (visible in DevTools Network as streamed `tool-input-available` events).
8. AI emits `proposeAgent`. Preview panel populates: name, emoji, prompt, model, tool chips, KB chips.
9. Remove one suggested tool via the chip X. Observe AI-suggested badge disappears for that chip row.
10. Click **Create Agent**. Lands on `/dashboard/agent-builder/<id>`.
11. Verify each sidebar tab: Configure and Model show green dots; no red dots present.
12. Go to Deploy tab: readiness panel is green.

## Escape hatch

1. Fresh wizard. Click **Skip to manual editor**. Redirects to blank editor with default `## Goal / ## Skills / ## Workflow / ## Constraints` prompt.

## Required-field flags

1. Open an existing agent, go to Configure tab, clear the name field, blur. Red `*` still visible on label, red helper *"Name is required."* appears. Sidebar dot on Configure turns red.
2. Configure tab sidebar dot: red if name empty or prompt < 20 chars; green when both valid.
3. Go to Deploy tab → readiness panel lists missing fields as clickable buttons; clicking a button jumps to the correct tab. Deploy controls dimmed via `opacity-50 pointer-events-none`.

## Regressions

- Existing "Generate with AI" card on Configure tab still works (enter description, click Generate → system prompt populates).
- Existing agents open in the editor with correct sidebar dots per their actual state.
- Legacy link `/dashboard/agent-builder/new` via `[id]` route still redirects to the new wizard route (via the defensive `useEffect` in `agent-editor-page-client.tsx`).
