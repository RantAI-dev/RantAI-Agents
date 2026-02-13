"use client"

import { useCallback, useRef } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  SelectionMode,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type ReactFlowInstance,
  type Connection,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { toast } from "sonner"
import { GitBranch, ArrowLeft, Plus } from "lucide-react"

import { useWorkflowEditor } from "@/hooks/use-workflow-editor"
import { NodeType, type WorkflowNodeData } from "@/lib/workflow/types"
import { validateConnection } from "@/lib/workflow/type-system"
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
import { ErrorHandlerNode } from "./nodes/error-handler-node"
import { SubWorkflowNode } from "./nodes/sub-workflow-node"

const nodeTypes: NodeTypes = {
  [NodeType.TRIGGER_MANUAL]: TriggerNode,
  [NodeType.TRIGGER_WEBHOOK]: TriggerNode,
  [NodeType.TRIGGER_SCHEDULE]: TriggerNode,
  [NodeType.TRIGGER_EVENT]: TriggerNode,
  [NodeType.AGENT]: AgentNode,
  [NodeType.LLM]: LlmNode,
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
  [NodeType.OUTPUT_PARSER]: DataNode,
  [NodeType.RAG_SEARCH]: IntegrationNode,
  [NodeType.DATABASE]: IntegrationNode,
  [NodeType.STORAGE]: IntegrationNode,
  [NodeType.ERROR_HANDLER]: ErrorHandlerNode,
  [NodeType.SUB_WORKFLOW]: SubWorkflowNode,
  [NodeType.STREAM_OUTPUT]: LlmNode,
}

const edgeTypes: EdgeTypes = {
  default: CustomEdge,
}

interface WorkflowCanvasInnerProps {
  showGrid?: boolean
}

function WorkflowCanvasInner({ showGrid = true }: WorkflowCanvasInnerProps) {
  const rfInstance = useRef<ReactFlowInstance<Node<WorkflowNodeData>, Edge> | null>(null)
  const nodes = useWorkflowEditor((s) => s.nodes)
  const edges = useWorkflowEditor((s) => s.edges)
  const onNodesChange = useWorkflowEditor((s) => s.onNodesChange)
  const onEdgesChange = useWorkflowEditor((s) => s.onEdgesChange)
  const onConnect = useWorkflowEditor((s) => s.onConnect)
  const addNode = useWorkflowEditor((s) => s.addNode)
  const selectNode = useWorkflowEditor((s) => s.selectNode)
  const pushHistory = useWorkflowEditor((s) => s.pushHistory)
  const setReactFlowHelpers = useWorkflowEditor((s) => s.setReactFlowHelpers)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const nodeType = e.dataTransfer.getData("application/workflow-node") as NodeType
      if (!nodeType || !rfInstance.current) return

      // screenToFlowPosition expects screen coords (clientX/clientY), not container-relative
      const position = rfInstance.current.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
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

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const sourceNode = nodes.find((n) => n.id === connection.source)
      const targetNode = nodes.find((n) => n.id === connection.target)
      if (!sourceNode || !targetNode) return false

      const sourceType = (sourceNode.data as WorkflowNodeData).nodeType
      const targetType = (targetNode.data as WorkflowNodeData).nodeType
      const result = validateConnection(sourceType, targetType, sourceNode.id, targetNode.id)

      if (!result.valid && result.reason) {
        toast.error(result.reason, { id: "connection-error", duration: 2000 })
      }

      return result.valid
    },
    [nodes]
  )

  const isEmpty = nodes.length === 0

  return (
    <div ref={wrapperRef} className="w-full h-full relative">
    {/* Empty canvas state */}
    {isEmpty && (
      <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
        <div className="flex flex-col items-center gap-3 pointer-events-auto text-center max-w-[280px]">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
            <GitBranch className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-medium text-foreground">Start building your workflow</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Drag a node from the palette on the left, or press <kbd className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono border">Ctrl+K</kbd> to quick-add a node.
          </p>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
              <ArrowLeft className="h-3 w-3" />
              <span>Drag from palette</span>
            </div>
            <span className="text-muted-foreground/30">|</span>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
              <Plus className="h-3 w-3" />
              <span>Click to add</span>
            </div>
          </div>
        </div>
      </div>
    )}
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      isValidConnection={isValidConnection}
      onInit={(instance) => {
        rfInstance.current = instance
        setReactFlowHelpers({
          screenToFlowPosition: instance.screenToFlowPosition,
          getViewport: instance.getViewport,
          flowWrapper: wrapperRef.current,
        })
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
      deleteKeyCode={null}
      panOnDrag
      selectionKeyCode="Shift"
      selectionMode={SelectionMode.Partial}
      multiSelectionKeyCode="Shift"
      className="bg-muted/20"
    >
      {showGrid && <Background gap={16} size={1} />}
      <Controls className="!bg-background !border-border !shadow-sm [&>button]:!bg-background [&>button]:!border-border [&>button]:!text-foreground" />
      <MiniMap
        className="!bg-background !border-border"
        nodeColor="#64748b"
        maskColor="rgba(0,0,0,0.1)"
      />
    </ReactFlow>
    </div>
  )
}

interface WorkflowCanvasProps {
  showGrid?: boolean
}

export function WorkflowCanvas({ showGrid }: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner showGrid={showGrid} />
    </ReactFlowProvider>
  )
}
