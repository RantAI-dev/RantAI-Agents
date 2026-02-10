"use client"

import { useCallback, useRef } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type ReactFlowInstance,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { useWorkflowEditor } from "@/hooks/use-workflow-editor"
import { NodeType, type WorkflowNodeData } from "@/lib/workflow/types"
import { CustomEdge } from "./custom-edge"
import { TriggerNode } from "./nodes/trigger-node"
import { AgentNode } from "./nodes/agent-node"
import { LlmNode } from "./nodes/llm-node"
import { ToolNode } from "./nodes/tool-node"
import { ConditionNode } from "./nodes/condition-node"
import { LoopNode } from "./nodes/loop-node"
import { ParallelNode } from "./nodes/parallel-node"
import { HumanNode } from "./nodes/human-node"
import { DataNode } from "./nodes/data-node"
import { IntegrationNode } from "./nodes/integration-node"

const nodeTypes: NodeTypes = {
  [NodeType.TRIGGER_MANUAL]: TriggerNode,
  [NodeType.TRIGGER_WEBHOOK]: TriggerNode,
  [NodeType.TRIGGER_SCHEDULE]: TriggerNode,
  [NodeType.TRIGGER_EVENT]: TriggerNode,
  [NodeType.AGENT]: AgentNode,
  [NodeType.LLM]: LlmNode,
  [NodeType.PROMPT]: LlmNode,
  [NodeType.TOOL]: ToolNode,
  [NodeType.MCP_TOOL]: ToolNode,
  [NodeType.CODE]: ToolNode,
  [NodeType.HTTP]: ToolNode,
  [NodeType.CONDITION]: ConditionNode,
  [NodeType.SWITCH]: ConditionNode,
  [NodeType.LOOP]: LoopNode,
  [NodeType.PARALLEL]: ParallelNode,
  [NodeType.MERGE]: ParallelNode,
  [NodeType.HUMAN_INPUT]: HumanNode,
  [NodeType.APPROVAL]: HumanNode,
  [NodeType.HANDOFF]: HumanNode,
  [NodeType.TRANSFORM]: DataNode,
  [NodeType.FILTER]: DataNode,
  [NodeType.AGGREGATE]: DataNode,
  [NodeType.RAG_SEARCH]: IntegrationNode,
  [NodeType.DATABASE]: IntegrationNode,
  [NodeType.STORAGE]: IntegrationNode,
}

const edgeTypes: EdgeTypes = {
  default: CustomEdge,
}

function WorkflowCanvasInner() {
  const rfInstance = useRef<ReactFlowInstance<Node<WorkflowNodeData>, Edge> | null>(null)
  const nodes = useWorkflowEditor((s) => s.nodes)
  const edges = useWorkflowEditor((s) => s.edges)
  const onNodesChange = useWorkflowEditor((s) => s.onNodesChange)
  const onEdgesChange = useWorkflowEditor((s) => s.onEdgesChange)
  const onConnect = useWorkflowEditor((s) => s.onConnect)
  const addNode = useWorkflowEditor((s) => s.addNode)
  const selectNode = useWorkflowEditor((s) => s.selectNode)
  const pushHistory = useWorkflowEditor((s) => s.pushHistory)

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const nodeType = e.dataTransfer.getData("application/workflow-node") as NodeType
      if (!nodeType || !rfInstance.current) return

      const bounds = (e.target as HTMLElement).closest(".react-flow")?.getBoundingClientRect()
      if (!bounds) return

      const position = rfInstance.current.screenToFlowPosition({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      })

      addNode(nodeType, position)
    },
    [addNode]
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      selectNode(node.id)
    },
    [selectNode]
  )

  const onPaneClick = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  const onMoveEnd = useCallback(() => {
    // Track position changes for undo
  }, [])

  const onNodeDragStop = useCallback(() => {
    pushHistory()
  }, [pushHistory])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onInit={(instance) => {
        rfInstance.current = instance
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      onNodeDragStop={onNodeDragStop}
      onMoveEnd={onMoveEnd}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      snapToGrid
      snapGrid={[16, 16]}
      deleteKeyCode="Delete"
      className="bg-muted/20"
    >
      <Background gap={16} size={1} />
      <Controls className="!bg-background !border-border !shadow-sm [&>button]:!bg-background [&>button]:!border-border [&>button]:!text-foreground" />
      <MiniMap
        className="!bg-background !border-border"
        nodeColor="#64748b"
        maskColor="rgba(0,0,0,0.1)"
      />
    </ReactFlow>
  )
}

export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner />
    </ReactFlowProvider>
  )
}
