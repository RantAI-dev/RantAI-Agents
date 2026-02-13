import { prisma } from "@/lib/prisma"
import type { WorkflowNodeData, SubWorkflowNodeData } from "../types"
import type { ExecutionContext } from "../engine"
import { resolveTemplate } from "../template-engine"
import { buildTemplateContext } from "../engine"

/**
 * SUB_WORKFLOW node handler — executes another workflow as a child.
 *
 * Loads the target workflow, runs it via the engine, and returns its output.
 * Input mapping allows template expressions to map parent data into child input.
 */
export async function executeSubWorkflow(
  data: WorkflowNodeData,
  input: unknown,
  context: ExecutionContext
): Promise<{ output: unknown }> {
  const nodeData = data as SubWorkflowNodeData

  if (!nodeData.workflowId) {
    throw new Error("Sub-workflow: no workflow selected")
  }

  // Verify the target workflow exists and is active
  const targetWorkflow = await prisma.workflow.findUnique({
    where: { id: nodeData.workflowId },
  })

  if (!targetWorkflow) {
    throw new Error(`Sub-workflow: workflow "${nodeData.workflowId}" not found`)
  }

  if (targetWorkflow.status !== "ACTIVE" && targetWorkflow.status !== "DRAFT") {
    throw new Error(`Sub-workflow: workflow "${targetWorkflow.name}" is ${targetWorkflow.status}`)
  }

  // Build input for child workflow using input mapping
  let childInput: Record<string, unknown> = {}

  if (nodeData.inputMapping && Object.keys(nodeData.inputMapping).length > 0) {
    const tctx = buildTemplateContext(data.label, data.nodeType, input, context)
    for (const [key, expression] of Object.entries(nodeData.inputMapping)) {
      try {
        childInput[key] = resolveTemplate(expression, tctx)
      } catch {
        childInput[key] = expression
      }
    }
  } else {
    // Pass parent input directly
    childInput = typeof input === "object" && input !== null
      ? { ...(input as Record<string, unknown>) }
      : { data: input }
  }

  // Import dynamically to avoid circular dependency
  const { workflowEngine } = await import("../index")

  // Execute child workflow
  const runId = await workflowEngine.execute(nodeData.workflowId, childInput)

  // Fetch run result
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
  })

  if (!run) {
    throw new Error("Sub-workflow: run result not found")
  }

  if (run.status === "FAILED") {
    throw new Error(`Sub-workflow "${targetWorkflow.name}" failed: ${run.error || "Unknown error"}`)
  }

  return {
    output: {
      runId: run.id,
      status: run.status,
      output: run.output,
      workflowName: targetWorkflow.name,
    },
  }
}
