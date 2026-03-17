import { describe, it, expect } from "vitest"
import { compileWorkflow, createStepLog } from "@/lib/workflow/compiler"
import { NodeType } from "@/lib/workflow/types"
import type { Node, Edge } from "@xyflow/react"
import type { WorkflowNodeData } from "@/lib/workflow/types"

function makeNode(id: string, nodeType: NodeType, label = "Test"): Node<WorkflowNodeData> {
  return {
    id,
    type: "custom",
    position: { x: 0, y: 0 },
    data: { label, nodeType } as WorkflowNodeData,
  }
}

function makeEdge(source: string, target: string, sourceHandle?: string): Edge {
  return { id: `${source}-${target}`, source, target, sourceHandle: sourceHandle ?? null }
}

// ─── compileWorkflow ──────────────────────────────────────────────────────────

describe("compileWorkflow", () => {
  it("returns nodes in topological order for a linear graph", () => {
    const nodes = [
      makeNode("n1", NodeType.TRIGGER_MANUAL, "Start"),
      makeNode("n2", NodeType.LLM, "LLM"),
      makeNode("n3", NodeType.STREAM_OUTPUT, "Output"),
    ]
    const edges = [makeEdge("n1", "n2"), makeEdge("n2", "n3")]

    const { steps } = compileWorkflow(nodes, edges)

    expect(steps.map((s) => s.nodeId)).toEqual(["n1", "n2", "n3"])
  })

  it("sets triggerNodeId for TRIGGER_MANUAL", () => {
    const nodes = [makeNode("t1", NodeType.TRIGGER_MANUAL, "Manual")]
    const { triggerNodeId } = compileWorkflow(nodes, [])
    expect(triggerNodeId).toBe("t1")
  })

  it("sets triggerNodeId for TRIGGER_WEBHOOK", () => {
    const nodes = [makeNode("t1", NodeType.TRIGGER_WEBHOOK, "Webhook")]
    const { triggerNodeId } = compileWorkflow(nodes, [])
    expect(triggerNodeId).toBe("t1")
  })

  it("sets triggerNodeId for TRIGGER_SCHEDULE", () => {
    const nodes = [makeNode("t1", NodeType.TRIGGER_SCHEDULE, "Schedule")]
    const { triggerNodeId } = compileWorkflow(nodes, [])
    expect(triggerNodeId).toBe("t1")
  })

  it("sets triggerNodeId for TRIGGER_EVENT", () => {
    const nodes = [makeNode("t1", NodeType.TRIGGER_EVENT, "Event")]
    const { triggerNodeId } = compileWorkflow(nodes, [])
    expect(triggerNodeId).toBe("t1")
  })

  it("picks only the first trigger when multiple triggers exist", () => {
    const nodes = [
      makeNode("t1", NodeType.TRIGGER_MANUAL, "Manual"),
      makeNode("t2", NodeType.TRIGGER_WEBHOOK, "Webhook"),
    ]
    // No edges — both are independent roots; topo sort will process t1 first (insertion order)
    const { triggerNodeId } = compileWorkflow(nodes, [])
    expect(triggerNodeId).toBe("t1")
  })

  it("builds correct predecessors and successors for a linear chain", () => {
    const nodes = [
      makeNode("a", NodeType.TRIGGER_MANUAL),
      makeNode("b", NodeType.LLM),
      makeNode("c", NodeType.STREAM_OUTPUT),
    ]
    const edges = [makeEdge("a", "b"), makeEdge("b", "c")]
    const { stepMap } = compileWorkflow(nodes, edges)

    expect(stepMap.get("a")!.predecessors).toEqual([])
    expect(stepMap.get("a")!.successors).toEqual(["b"])

    expect(stepMap.get("b")!.predecessors).toEqual(["a"])
    expect(stepMap.get("b")!.successors).toEqual(["c"])

    expect(stepMap.get("c")!.predecessors).toEqual(["b"])
    expect(stepMap.get("c")!.successors).toEqual([])
  })

  it("builds sourceHandles for branching (if/else condition node)", () => {
    const nodes = [
      makeNode("trigger", NodeType.TRIGGER_MANUAL),
      makeNode("cond", NodeType.CONDITION),
      makeNode("yes", NodeType.LLM),
      makeNode("no", NodeType.LLM),
    ]
    const edges = [
      makeEdge("trigger", "cond"),
      makeEdge("cond", "yes", "if"),
      makeEdge("cond", "no", "else"),
    ]
    const { stepMap } = compileWorkflow(nodes, edges)

    const condStep = stepMap.get("cond")!
    expect(condStep.sourceHandles["if"]).toEqual(["yes"])
    expect(condStep.sourceHandles["else"]).toEqual(["no"])
  })

  it("uses 'default' handle when sourceHandle is null", () => {
    const nodes = [
      makeNode("a", NodeType.TRIGGER_MANUAL),
      makeNode("b", NodeType.LLM),
    ]
    const edges = [makeEdge("a", "b")] // sourceHandle will be null
    const { stepMap } = compileWorkflow(nodes, edges)

    expect(stepMap.get("a")!.sourceHandles["default"]).toEqual(["b"])
  })

  it("handles an empty graph (no nodes, no edges)", () => {
    const { steps, stepMap, triggerNodeId } = compileWorkflow([], [])
    expect(steps).toHaveLength(0)
    expect(stepMap.size).toBe(0)
    expect(triggerNodeId).toBe("")
  })

  it("handles a single node with no edges", () => {
    const nodes = [makeNode("solo", NodeType.TRIGGER_MANUAL, "Solo")]
    const { steps, stepMap, triggerNodeId } = compileWorkflow(nodes, [])

    expect(steps).toHaveLength(1)
    expect(stepMap.has("solo")).toBe(true)
    expect(triggerNodeId).toBe("solo")

    const step = stepMap.get("solo")!
    expect(step.predecessors).toEqual([])
    expect(step.successors).toEqual([])
    expect(step.sourceHandles).toEqual({})
  })

  it("populates stepMap with all nodes", () => {
    const nodes = [
      makeNode("n1", NodeType.TRIGGER_MANUAL),
      makeNode("n2", NodeType.AGENT),
      makeNode("n3", NodeType.TOOL),
    ]
    const edges = [makeEdge("n1", "n2"), makeEdge("n2", "n3")]
    const { stepMap } = compileWorkflow(nodes, edges)

    expect(stepMap.size).toBe(3)
    expect(stepMap.has("n1")).toBe(true)
    expect(stepMap.has("n2")).toBe(true)
    expect(stepMap.has("n3")).toBe(true)
  })

  it("preserves node data (label and nodeType) in compiled steps", () => {
    const nodes = [makeNode("myNode", NodeType.AGENT, "My Agent")]
    const { stepMap } = compileWorkflow(nodes, [])

    const step = stepMap.get("myNode")!
    expect(step.data.label).toBe("My Agent")
    expect(step.nodeType).toBe(NodeType.AGENT)
  })

  it("handles a diamond shape (parallel branches merging)", () => {
    // trigger → left & right → merge
    const nodes = [
      makeNode("trigger", NodeType.TRIGGER_MANUAL),
      makeNode("left", NodeType.LLM),
      makeNode("right", NodeType.LLM),
      makeNode("merge", NodeType.MERGE),
    ]
    const edges = [
      makeEdge("trigger", "left"),
      makeEdge("trigger", "right"),
      makeEdge("left", "merge"),
      makeEdge("right", "merge"),
    ]
    const { steps, stepMap } = compileWorkflow(nodes, edges)

    // trigger must come first, merge must come last
    expect(steps[0].nodeId).toBe("trigger")
    expect(steps[steps.length - 1].nodeId).toBe("merge")

    // merge should have both left and right as predecessors
    const mergePreds = stepMap.get("merge")!.predecessors
    expect(mergePreds).toContain("left")
    expect(mergePreds).toContain("right")

    // trigger successors should contain both branches
    const trigSuccessors = stepMap.get("trigger")!.successors
    expect(trigSuccessors).toContain("left")
    expect(trigSuccessors).toContain("right")
  })
})

// ─── createStepLog ────────────────────────────────────────────────────────────

describe("createStepLog", () => {
  // Helper: build a minimal CompiledStep
  function makeStep(nodeId: string, nodeType: NodeType, label: string) {
    return {
      nodeId,
      nodeType,
      data: { label, nodeType } as WorkflowNodeData,
      successors: [],
      predecessors: [],
      sourceHandles: {},
    }
  }

  it("stepId starts with 'step_' prefix", () => {
    const step = makeStep("node1", NodeType.LLM, "LLM")
    const log = createStepLog(step, "running", { prompt: "hello" })
    expect(log.stepId).toMatch(/^step_/)
  })

  it("running status does not have completedAt", () => {
    const step = makeStep("node1", NodeType.LLM, "LLM")
    const log = createStepLog(step, "running", { prompt: "hello" })
    expect(log.completedAt).toBeUndefined()
    expect(log.status).toBe("running")
    expect(log.startedAt).toBeDefined()
  })

  it("pending status does not have completedAt", () => {
    const step = makeStep("node1", NodeType.LLM, "LLM")
    const log = createStepLog(step, "pending", null)
    expect(log.completedAt).toBeUndefined()
    expect(log.status).toBe("pending")
  })

  it("success status has completedAt set", () => {
    const step = makeStep("node2", NodeType.AGENT, "Agent")
    const log = createStepLog(step, "success", { query: "test" }, { result: "done" }, undefined, 150)
    expect(log.completedAt).toBeDefined()
    expect(log.status).toBe("success")
    expect(log.durationMs).toBe(150)
    expect(log.output).toEqual({ result: "done" })
  })

  it("failed status has completedAt and error message", () => {
    const step = makeStep("node3", NodeType.TOOL, "Tool")
    const log = createStepLog(step, "failed", { input: "x" }, null, "Something went wrong", 42)
    expect(log.completedAt).toBeDefined()
    expect(log.status).toBe("failed")
    expect(log.error).toBe("Something went wrong")
    expect(log.durationMs).toBe(42)
  })

  it("suspended status has completedAt set", () => {
    const step = makeStep("node4", NodeType.APPROVAL, "Approval")
    const log = createStepLog(step, "suspended", { waiting: true })
    expect(log.completedAt).toBeDefined()
    expect(log.status).toBe("suspended")
  })

  it("correctly maps nodeId, nodeType, and label from the step", () => {
    const step = makeStep("myNode", NodeType.CONDITION, "My Condition")
    const log = createStepLog(step, "success", {})
    expect(log.nodeId).toBe("myNode")
    expect(log.nodeType).toBe(NodeType.CONDITION)
    expect(log.label).toBe("My Condition")
  })

  it("output defaults to null when not provided", () => {
    const step = makeStep("node5", NodeType.LLM, "LLM")
    const log = createStepLog(step, "running", { prompt: "hi" })
    expect(log.output).toBeNull()
  })

  it("durationMs defaults to 0 when not provided", () => {
    const step = makeStep("node5", NodeType.LLM, "LLM")
    const log = createStepLog(step, "success", {})
    expect(log.durationMs).toBe(0)
  })
})
