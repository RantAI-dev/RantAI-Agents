# 03 — Agent Node Full Execution in Workflows

## Problem

When an `AGENT` node runs inside a workflow, it does NOT get the agent's tools, skills, or KB access.

Current code (`lib/workflow/nodes/agent.ts`):
```typescript
const result = await generateText({
  model,
  system: assistant.systemPrompt || undefined,
  prompt,
})
```

This is just "use this model + system prompt" — a bare LLM call. The agent's bound tools, skills, MCP servers, and knowledge bases are completely ignored. The agent runs as a stripped-down version of itself.

In chat mode, the same agent gets full capabilities via `resolveToolsForAssistant()`. The workflow execution path bypasses this entirely.

## Why This Matters

For the Digital Employee vision: **a workflow IS the employee's job description, and the agent IS the employee executing it.** If the agent can't use its tools when running a workflow, the employee is showing up to work with empty hands.

Example: An agent has `web_search` tool, `linkedin_poster` MCP, and a brand guidelines KB attached. A "Write LinkedIn Post" workflow has an Agent node. Today, that agent node can only generate text — it can't search the web for trends, can't access brand guidelines, and can't post to LinkedIn. Useless.

## Solution

### 1. Upgrade `executeAgent()` to Use Full Agent Capabilities

```typescript
// lib/workflow/nodes/agent.ts — updated

import { resolveToolsForAssistant } from "@/lib/tools/registry"
import { resolveSkillsForAssistant } from "@/lib/skills/resolver"  // new helper
import { generateText } from "ai"
import { stopWhen, stepCountIs } from "ai"

export async function executeAgent(
  data: WorkflowNodeData,
  input: unknown,
  context: ExecutionContext
): Promise<{ output: unknown }> {
  const nodeData = data as AgentNodeData

  if (!nodeData.assistantId) {
    throw new Error("Agent node: no assistant selected")
  }

  const assistant = await prisma.assistant.findUnique({
    where: { id: nodeData.assistantId },
  })

  if (!assistant) {
    throw new Error(`Agent node: assistant ${nodeData.assistantId} not found`)
  }

  const model = openrouter(assistant.model || "openai/gpt-4o-mini")

  // --- NEW: Resolve full agent capabilities ---

  // 1. Resolve tools (built-in, custom, MCP, community)
  const tools = await resolveToolsForAssistant(
    nodeData.assistantId,
    assistant.model,
    {
      userId: context.userId,
      organizationId: context.organizationId,
      knowledgeBaseGroupIds: assistant.knowledgeBaseGroupIds, // or from junction table
    }
  )

  // 2. Resolve skills (inject into system prompt)
  const skillPrompts = await resolveSkillsForAssistant(nodeData.assistantId)
  const systemPrompt = [
    assistant.systemPrompt || "",
    ...skillPrompts,
  ].filter(Boolean).join("\n\n")

  // 3. Build prompt from workflow input
  const prompt = nodeData.promptTemplate
    ? resolveTemplate(nodeData.promptTemplate, tctx)
    : extractPrompt(input)

  // 4. Execute with full capabilities
  const maxSteps = nodeData.maxSteps || 5
  const result = await generateText({
    model,
    system: systemPrompt,
    prompt,
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    stopWhen: stepCountIs(maxSteps),
  })

  return {
    output: {
      text: result.text,
      model: assistant.model,
      usage: result.usage,
      toolCalls: result.toolCalls,       // Include tool call trace
      steps: result.steps?.length || 0,  // How many agentic steps were taken
    }
  }
}
```

### 2. Create `resolveSkillsForAssistant()` Helper

Extract the skill prompt injection logic (currently inline in the chat API route) into a reusable function:

```typescript
// lib/skills/resolver.ts

export async function resolveSkillsForAssistant(assistantId: string): Promise<string[]> {
  const bindings = await prisma.assistantSkill.findMany({
    where: { assistantId, enabled: true },
    include: { skill: true },
    orderBy: { priority: "asc" },
  })

  return bindings
    .map(b => b.skill.content)
    .filter(Boolean)
}
```

### 3. Workflow Execution Context

The `ExecutionContext` needs `userId` and `organizationId` passed through so that `resolveToolsForAssistant` can scope properly. Verify these are already in the context from the workflow execution entry point.

### 4. Tool Execution Logging in Workflow Runs

When an agent node uses tools during workflow execution, the tool calls should be captured in the `WorkflowRun.steps` JSON. This provides auditability — you can see exactly what tools the agent used, what inputs/outputs they had, during each workflow step.

### 5. Safety: maxSteps Limit

The `AgentNodeData.maxSteps` field already exists (defaults to 5). This prevents runaway tool-calling loops. For Digital Employees, this limit may need to be configurable per-workflow or per-employee.

---

## Files to Modify

| File | Change |
|------|--------|
| `lib/workflow/nodes/agent.ts` | Full rewrite — add tool resolution, skill injection, multi-step execution |
| `lib/skills/resolver.ts` | Create — extract skill prompt resolution into reusable function |
| `lib/workflow/engine.ts` | Ensure `ExecutionContext` carries `userId`, `organizationId` |
| Chat API route | Refactor to use `resolveSkillsForAssistant()` instead of inline logic |

## Dependency

- This should be done AFTER `02-KNOWLEDGE-BASE-RELATIONS.md` (so KB IDs come from junction table, not string array)
- Can be done in parallel with `01-WORKFLOW-COMPOSITION.md` (independent changes)
