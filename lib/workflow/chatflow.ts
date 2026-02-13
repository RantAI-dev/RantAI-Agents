import { streamText } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { DEFAULT_MODEL_ID } from "@/lib/models"
import type { Node, Edge } from "@xyflow/react"
import type { Workflow } from "@prisma/client"
import { compileWorkflow, createStepLog } from "./compiler"
import { createFlowState } from "./runtime-state"
import type { WorkflowNodeData, StepLogEntry, StreamOutputNodeData } from "./types"
import { NodeType } from "./types"
import { buildTemplateContext, emitWorkflowEvent, extractTokenUsage, type ExecutionContext } from "./engine"
import { resolveTemplate } from "./template-engine"
import { buildPromptWithMemory } from "@/lib/memory"
import type { WorkingMemory, SemanticRecallResult, UserProfile } from "@/lib/memory"
import { LANGUAGE_INSTRUCTION, CORRECTION_INSTRUCTION_SOFT } from "@/lib/prompts/instructions"

/** Memory context passed from chat/widget routes into chatflow execution */
export interface ChatflowMemoryContext {
  workingMemory: WorkingMemory | null
  semanticResults: SemanticRecallResult[]
  userProfile: UserProfile | null
}

// Node handlers (reuse from engine)
import { executeTrigger } from "./nodes/trigger"
import { executeAgent } from "./nodes/agent"
import { executeLlm } from "./nodes/llm"
import { executeTool } from "./nodes/tool"
import { executeCondition } from "./nodes/condition"
import { executeLoop } from "./nodes/loop"
import { executeData } from "./nodes/data"
import { executeIntegration } from "./nodes/integration"
import { executeHuman } from "./nodes/human"
import { executeErrorHandler } from "./nodes/error-handler"
import { executeSubWorkflow } from "./nodes/sub-workflow"

type NodeHandler = (
  data: WorkflowNodeData,
  input: unknown,
  context: ExecutionContext
) => Promise<{ output: unknown; branch?: string; suspend?: boolean }>

const NODE_HANDLERS: Partial<Record<NodeType, NodeHandler>> = {
  [NodeType.TRIGGER_MANUAL]: executeTrigger,
  [NodeType.TRIGGER_WEBHOOK]: executeTrigger,
  [NodeType.TRIGGER_SCHEDULE]: executeTrigger,
  [NodeType.TRIGGER_EVENT]: executeTrigger,
  [NodeType.AGENT]: executeAgent,
  [NodeType.LLM]: executeLlm,
  [NodeType.TOOL]: executeTool,
  [NodeType.MCP_TOOL]: executeTool,
  [NodeType.CODE]: executeTool,
  [NodeType.HTTP]: executeTool,
  [NodeType.CONDITION]: executeCondition,
  [NodeType.SWITCH]: executeCondition,
  [NodeType.LOOP]: executeLoop,
  [NodeType.PARALLEL]: executeData,
  [NodeType.MERGE]: executeData,
  [NodeType.TRANSFORM]: executeData,
  [NodeType.FILTER]: executeData,
  [NodeType.AGGREGATE]: executeData,
  [NodeType.OUTPUT_PARSER]: executeData,
  [NodeType.RAG_SEARCH]: executeIntegration,
  [NodeType.DATABASE]: executeIntegration,
  [NodeType.STORAGE]: executeIntegration,
  [NodeType.HUMAN_INPUT]: executeHuman,
  [NodeType.APPROVAL]: executeHuman,
  [NodeType.HANDOFF]: executeHuman,
  [NodeType.ERROR_HANDLER]: executeErrorHandler,
  [NodeType.SUB_WORKFLOW]: executeSubWorkflow,
  // STREAM_OUTPUT is handled specially — not executed via handler
}

/**
 * Execute a chatflow workflow and return a streaming Response + step logs.
 *
 * The workflow is executed up to (but not including) the STREAM_OUTPUT node.
 * The accumulated context is then fed into the STREAM_OUTPUT node's LLM
 * configuration to produce a streaming response.
 *
 * @param runId - If provided, enables Socket.io step events and links to a WorkflowRun record
 */
export async function executeChatflow(
  workflow: Workflow,
  userMessage: string,
  systemPrompt?: string,
  memoryContext?: ChatflowMemoryContext,
  runId?: string
): Promise<{ response: Response | null; stepLogs: StepLogEntry[]; fallback?: boolean }> {
  const nodes = (workflow.nodes as unknown as Node<WorkflowNodeData>[]) || []
  const edges = (workflow.edges as unknown as Edge[]) || []

  const compiled = compileWorkflow(nodes, edges)

  const effectiveRunId = runId || `chatflow_${Date.now()}`
  const input = { message: userMessage }
  const flow = createFlowState(workflow.id, effectiveRunId, input, "trigger_manual")
  const context: ExecutionContext = {
    workflowId: workflow.id,
    runId: effectiveRunId,
    variables: { ...input },
    stepOutputs: new Map(),
    flow,
  }

  const stepLogs: StepLogEntry[] = []

  // Find ALL STREAM_OUTPUT nodes (workflows may have multiple via Switch branching)
  const streamOutputNodes = nodes.filter(
    (n) => (n.data as WorkflowNodeData).nodeType === NodeType.STREAM_OUTPUT
  )
  const streamOutputNodeIds = new Set(streamOutputNodes.map((n) => n.id))

  if (streamOutputNodes.length === 0) {
    // No stream output node — run the whole workflow and return the last output as text
    await executeStepRecursive(compiled.triggerNodeId, compiled, context, stepLogs, input, undefined, runId)
    const lastOutput = Array.from(context.stepOutputs.values()).pop()
    const text = typeof lastOutput === "string"
      ? lastOutput
      : (lastOutput as { text?: string })?.text || JSON.stringify(lastOutput)
    return {
      response: new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } }),
      stepLogs,
    }
  }

  // Execute all nodes except STREAM_OUTPUT nodes — stop before ANY of them
  try {
    await executeStepRecursive(
      compiled.triggerNodeId,
      compiled,
      context,
      stepLogs,
      input,
      streamOutputNodeIds,
      runId
    )
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    return {
      response: new Response(JSON.stringify({ error: errMsg }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
      stepLogs,
    }
  }

  // Determine which STREAM_OUTPUT node was reached by checking which one
  // has a predecessor with output in context.stepOutputs
  let streamOutputNode: (typeof streamOutputNodes)[number] | null = null
  for (const candidate of streamOutputNodes) {
    const step = compiled.stepMap.get(candidate.id)
    if (step?.predecessors.some((predId) => context.stepOutputs.has(predId))) {
      streamOutputNode = candidate
      break
    }
  }

  // No STREAM_OUTPUT node was reached — the execution path (e.g. Switch default branch)
  // doesn't end at a Stream Output. Signal fallback to normal agent processing.
  if (!streamOutputNode) {
    console.log("[Chatflow] No STREAM_OUTPUT reached — falling back to normal agent")
    return { response: null, stepLogs, fallback: true }
  }

  // Collect context from all upstream node outputs for the stream node
  const streamNodeData = streamOutputNode.data as StreamOutputNodeData
  const tctx = buildTemplateContext(streamNodeData.label, streamNodeData.nodeType, input, context)

  // Determine what to feed the LLM — find the predecessor node's output
  const streamStep = compiled.stepMap.get(streamOutputNode.id)
  let accumulatedInput: unknown = input
  if (streamStep?.predecessors.length) {
    const predOutputs = streamStep.predecessors
      .map((predId) => context.stepOutputs.get(predId))
      .filter(Boolean)
    accumulatedInput = predOutputs.length === 1 ? predOutputs[0] : predOutputs
  }

  // Build the prompt from accumulated input — format structured data cleanly
  const prompt = buildStreamPrompt(accumulatedInput, input)

  // Node prompt is the boss. Agent Builder prompt only used as fallback if node has no prompt.
  let resolvedSystemPrompt = streamNodeData.systemPrompt
    ? resolveTemplate(streamNodeData.systemPrompt, tctx)
    : systemPrompt || undefined

  // Inject memory context into the resolved prompt
  if (memoryContext && resolvedSystemPrompt) {
    resolvedSystemPrompt = buildPromptWithMemory(
      resolvedSystemPrompt,
      memoryContext.workingMemory,
      memoryContext.semanticResults,
      memoryContext.userProfile
    )
  }

  // Language consistency + correction instructions (shared module)
  if (resolvedSystemPrompt) {
    resolvedSystemPrompt += LANGUAGE_INSTRUCTION
    resolvedSystemPrompt += CORRECTION_INSTRUCTION_SOFT
  }

  // Follow-up prompts: instruct LLM to append suggestions
  const chatflowCfg = workflow.chatflowConfig as { enableFollowUps?: boolean } | null
  if (chatflowCfg?.enableFollowUps) {
    const followUpInstruction = `\n\nAfter your response, add a new line then "---SUGGESTIONS---" followed by exactly 3 short follow-up questions the user might ask next, one per line starting with "- ". Use the same language as the user's message.`
    resolvedSystemPrompt = (resolvedSystemPrompt || "") + followUpInstruction
  }

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY || "",
  })
  const model = openrouter(streamNodeData.model || DEFAULT_MODEL_ID)

  // Capture RAG sources from any RAG_SEARCH node outputs
  const ragSources: Array<{ title: string; section: string | null }> = []
  for (const [nodeId, output] of context.stepOutputs.entries()) {
    const step = compiled.stepMap.get(nodeId)
    if (step?.nodeType === NodeType.RAG_SEARCH && output && typeof output === "object") {
      const ragOutput = output as { sources?: Array<{ documentTitle: string; section: string | null }> }
      if (ragOutput.sources) {
        for (const s of ragOutput.sources) {
          ragSources.push({ title: s.documentTitle, section: s.section })
        }
      }
    }
  }

  const result = streamText({
    model,
    system: resolvedSystemPrompt,
    prompt,
    temperature: streamNodeData.temperature,
  })

  // Emit step:start for the STREAM_OUTPUT node (streaming begins)
  if (runId) {
    emitWorkflowEvent(runId, "workflow:step:start", {
      nodeId: streamOutputNode.id,
      nodeType: NodeType.STREAM_OUTPUT,
      label: streamNodeData.label || "Stream Output",
    })
  }

  // Mark STREAM_OUTPUT step as success in stepLogs (it will stream, not return output)
  const streamStepLog = createStepLog(
    { nodeId: streamOutputNode.id, nodeType: NodeType.STREAM_OUTPUT, data: streamNodeData, successors: [], predecessors: [], sourceHandles: {} },
    "success",
    prompt,
    { streaming: true, model: streamNodeData.model || DEFAULT_MODEL_ID }
  )
  stepLogs.push(streamStepLog)

  if (runId) {
    emitWorkflowEvent(runId, "workflow:step:success", {
      nodeId: streamOutputNode.id,
      nodeType: NodeType.STREAM_OUTPUT,
      durationMs: 0,
      outputPreview: "[streaming response]",
    })
  }

  // If RAG sources exist, wrap the stream to append them
  if (ragSources.length > 0) {
    const textStream = result.toTextStreamResponse()
    const originalBody = textStream.body
    if (originalBody) {
      const encoder = new TextEncoder()
      const wrappedStream = new ReadableStream({
        async start(controller) {
          const reader = originalBody.getReader()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            controller.enqueue(value)
          }
          controller.enqueue(encoder.encode("\n\n---SOURCES---\n" + JSON.stringify(ragSources)))
          controller.close()
        },
      })
      return { response: new Response(wrappedStream, { headers: textStream.headers }), stepLogs }
    }
  }

  return { response: result.toTextStreamResponse(), stepLogs }
}

/**
 * Build a clean prompt for STREAM_OUTPUT from accumulated upstream outputs.
 *
 * Strategy (Flowise pattern):
 * 1. User message is always the primary prompt
 * 2. RAG context is supplementary — appended when available
 * 3. Classification/intermediate outputs are ignored (system prompt handles behavior)
 */
function buildStreamPrompt(accumulatedInput: unknown, originalInput: unknown): string {
  const userMessage = extractUserMessage(originalInput)
  const ragContext = extractRagContext(accumulatedInput)

  // RAG + user message → structured prompt
  if (ragContext && userMessage) {
    return `User question: ${userMessage}\n\nRelevant context:\n${ragContext}\n\nPlease answer the user's question based on the context above.`
  }

  // No RAG — use user message directly (system prompt handles behavior)
  if (userMessage) return userMessage

  // Fallback: extract any text from accumulated input
  if (typeof accumulatedInput === "string") return accumulatedInput
  if (accumulatedInput && typeof accumulatedInput === "object") {
    const obj = accumulatedInput as Record<string, unknown>
    if (typeof obj.text === "string") return obj.text
    if (typeof obj.message === "string") return obj.message
  }

  return JSON.stringify(accumulatedInput)
}

/** Extract original user message from chatflow input */
function extractUserMessage(input: unknown): string | null {
  if (typeof input === "string") return input
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>
    if (typeof obj.message === "string") return obj.message
    if (typeof obj.question === "string") return obj.question
  }
  return null
}

/** Extract RAG context from accumulated upstream outputs */
function extractRagContext(input: unknown): string | null {
  if (!input) return null
  // Single RAG output: { context: "...", sources: [...] }
  if (typeof input === "object" && !Array.isArray(input)) {
    const obj = input as Record<string, unknown>
    if (typeof obj.context === "string") return obj.context
  }
  // Array of outputs (e.g., Merge → STREAM_OUTPUT with multiple RAG results)
  if (Array.isArray(input)) {
    const contexts = input
      .filter((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).context === "string")
      .map((item) => (item as Record<string, unknown>).context as string)
    if (contexts.length > 0) return contexts.join("\n\n")
  }
  return null
}

/**
 * Recursive step execution — mirrors WorkflowEngine.executeStep but stops
 * before reaching the stopBeforeNodeId (the STREAM_OUTPUT node).
 *
 * @param runId - If provided, emits Socket.io events for real-time execution progress
 */
async function executeStepRecursive(
  nodeId: string,
  compiled: ReturnType<typeof compileWorkflow>,
  context: ExecutionContext,
  stepLogs: StepLogEntry[],
  input: unknown,
  stopBeforeNodeIds?: Set<string>,
  runId?: string
): Promise<void> {
  if (stopBeforeNodeIds && stopBeforeNodeIds.has(nodeId)) return

  const step = compiled.stepMap.get(nodeId)
  if (!step) return

  const handler = NODE_HANDLERS[step.nodeType]
  if (!handler) {
    throw new Error(`No handler for node type: ${step.nodeType}`)
  }

  // Emit step:start event for real-time visualization
  if (runId) {
    emitWorkflowEvent(runId, "workflow:step:start", {
      nodeId,
      nodeType: step.nodeType,
      label: step.data.label,
    })
  }

  stepLogs.push(createStepLog(step, "running", input))
  const startTime = Date.now()

  const result = await handler(step.data, input, context)
  const durationMs = Date.now() - startTime

  // Extract token usage from AI node outputs
  const tokenUsage = extractTokenUsage(result.output)

  const idx = stepLogs.findIndex((s) => s.nodeId === nodeId && s.status === "running")
  if (idx >= 0) {
    stepLogs[idx] = {
      ...stepLogs[idx],
      status: "success",
      output: result.output,
      durationMs,
      completedAt: new Date().toISOString(),
      ...(tokenUsage && { tokenUsage }),
    }
  }

  // Emit step:success event with output preview
  if (runId) {
    const outputPreview = (() => {
      try {
        const str = typeof result.output === "string"
          ? result.output
          : JSON.stringify(result.output)
        return str.length > 200 ? str.slice(0, 200) + "..." : str
      } catch { return undefined }
    })()

    emitWorkflowEvent(runId, "workflow:step:success", {
      nodeId,
      nodeType: step.nodeType,
      durationMs,
      outputPreview,
    })
  }

  context.stepOutputs.set(nodeId, result.output)
  context.flow.nodeOutputs[nodeId] = result.output

  // Determine next nodes
  let nextNodeIds: string[]
  if (result.branch && step.sourceHandles[result.branch]) {
    nextNodeIds = step.sourceHandles[result.branch]
  } else {
    nextNodeIds = step.successors
  }

  for (const nextId of nextNodeIds) {
    await executeStepRecursive(nextId, compiled, context, stepLogs, result.output, stopBeforeNodeIds, runId)
  }
}
