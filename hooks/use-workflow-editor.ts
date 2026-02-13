"use client"

import { create } from "zustand"
import type { Node, Edge, OnNodesChange, OnEdgesChange, Connection } from "@xyflow/react"
import { applyNodeChanges, applyEdgeChanges, addEdge } from "@xyflow/react"
import {
  type WorkflowNodeData,
  type WorkflowVariables,
  type TriggerConfig,
  type NodeType,
  createDefaultNodeData,
} from "@/lib/workflow/types"

interface HistoryEntry {
  nodes: Node<WorkflowNodeData>[]
  edges: Edge[]
}

interface WorkflowEditorState {
  // Workflow metadata
  workflowId: string | null
  workflowName: string
  workflowDescription: string
  workflowStatus: string
  workflowMode: "STANDARD" | "CHATFLOW"
  assistantId: string | null
  apiEnabled: boolean
  apiKey: string | null
  trigger: TriggerConfig
  variables: WorkflowVariables
  chatflowConfig: { welcomeMessage?: string; starterPrompts?: string[]; enableFollowUps?: boolean }

  // Canvas state
  nodes: Node<WorkflowNodeData>[]
  edges: Edge[]

  // Selection
  selectedNodeId: string | null

  // Clipboard
  copiedNodes: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } | null

  // Undo/redo
  history: HistoryEntry[]
  historyIndex: number

  // UI state
  isDirty: boolean
  isSaving: boolean
  isRunning: boolean
  showRunHistory: boolean
  nodeExecutionStatus: Record<string, "pending" | "running" | "success" | "failed" | "suspended">
  nodeOutputs: Record<string, unknown>

  // Actions
  loadWorkflow: (data: {
    id: string
    name: string
    description: string | null
    nodes: Node<WorkflowNodeData>[]
    edges: Edge[]
    trigger: TriggerConfig
    variables: WorkflowVariables
    status: string
    mode?: "STANDARD" | "CHATFLOW"
    chatflowConfig?: { welcomeMessage?: string; starterPrompts?: string[] }
    assistantId?: string | null
    apiEnabled?: boolean
    apiKey?: string | null
  }) => void
  resetEditor: () => void

  setWorkflowMeta: (meta: Partial<{
    name: string
    description: string
    trigger: TriggerConfig
    variables: WorkflowVariables
    mode: "STANDARD" | "CHATFLOW"
    chatflowConfig: { welcomeMessage?: string; starterPrompts?: string[]; enableFollowUps?: boolean }
    apiEnabled: boolean
    status: string
    assistantId: string | null
  }>) => void

  // Node/Edge ops
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: (connection: Connection) => void
  addNode: (type: NodeType, position: { x: number; y: number }) => void
  updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => void
  deleteNode: (nodeId: string) => void
  deleteSelectedNodes: () => void
  setNodes: (nodes: Node<WorkflowNodeData>[]) => void
  setEdges: (edges: Edge[]) => void

  // Selection
  selectNode: (nodeId: string | null) => void

  // Clipboard
  copySelectedNodes: () => void
  pasteNodes: () => void
  duplicateSelectedNodes: () => void

  // History
  undo: () => void
  redo: () => void
  pushHistory: () => void

  // Viewport
  _screenToFlowPosition: ((pos: { x: number; y: number }) => { x: number; y: number }) | null
  _getViewport: (() => { x: number; y: number; zoom: number }) | null
  _flowWrapper: HTMLElement | null
  setReactFlowHelpers: (helpers: {
    screenToFlowPosition: (pos: { x: number; y: number }) => { x: number; y: number }
    getViewport: () => { x: number; y: number; zoom: number }
    flowWrapper: HTMLElement | null
  }) => void
  addNodeAtCenter: (type: NodeType) => void

  // State
  setDirty: (dirty: boolean) => void
  setSaving: (saving: boolean) => void
  setRunning: (running: boolean) => void
  toggleRunHistory: () => void
  setShowRunHistory: (show: boolean) => void
  setNodeExecutionStatus: (status: Record<string, "pending" | "running" | "success" | "failed" | "suspended">) => void
  setNodeOutputs: (outputs: Record<string, unknown>) => void
  clearNodeExecutionStatus: () => void
}

const MAX_HISTORY = 50

export const useWorkflowEditor = create<WorkflowEditorState>((set, get) => ({
  workflowId: null,
  workflowName: "",
  workflowDescription: "",
  workflowStatus: "DRAFT",
  workflowMode: "STANDARD",
  assistantId: null,
  apiEnabled: false,
  apiKey: null,
  trigger: { type: "manual" },
  variables: { inputs: [], outputs: [] },
  chatflowConfig: {},
  nodes: [],
  edges: [],
  selectedNodeId: null,
  copiedNodes: null,
  history: [],
  historyIndex: -1,
  isDirty: false,
  isSaving: false,
  isRunning: false,
  showRunHistory: false,
  nodeExecutionStatus: {},
  nodeOutputs: {},
  _screenToFlowPosition: null,
  _getViewport: null,
  _flowWrapper: null,

  setReactFlowHelpers: (helpers) => {
    set({
      _screenToFlowPosition: helpers.screenToFlowPosition,
      _getViewport: helpers.getViewport,
      _flowWrapper: helpers.flowWrapper,
    })
  },

  addNodeAtCenter: (type) => {
    const state = get()
    const screenToFlow = state._screenToFlowPosition
    const wrapper = state._flowWrapper
    if (screenToFlow && wrapper) {
      const rect = wrapper.getBoundingClientRect()
      const center = screenToFlow({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      })
      state.addNode(type, center)
    } else {
      // Fallback: stack nodes vertically
      const maxY = state.nodes.reduce((max, n) => Math.max(max, n.position.y), 0)
      state.addNode(type, { x: 200, y: maxY + 120 })
    }
  },

  loadWorkflow: (data) => {
    set({
      workflowId: data.id,
      workflowName: data.name,
      workflowDescription: data.description || "",
      workflowStatus: data.status,
      workflowMode: data.mode || "STANDARD",
      chatflowConfig: data.chatflowConfig || {},
      assistantId: data.assistantId || null,
      apiEnabled: data.apiEnabled || false,
      apiKey: data.apiKey || null,
      nodes: data.nodes,
      edges: data.edges,
      trigger: data.trigger,
      variables: data.variables,
      isDirty: false,
      selectedNodeId: null,
      history: [{ nodes: data.nodes, edges: data.edges }],
      historyIndex: 0,
    })
  },

  resetEditor: () => {
    set({
      workflowId: null,
      workflowName: "",
      workflowDescription: "",
      workflowStatus: "DRAFT",
      workflowMode: "STANDARD",
      chatflowConfig: {},
      assistantId: null,
      apiEnabled: false,
      apiKey: null,
      trigger: { type: "manual" },
      variables: { inputs: [], outputs: [] },
      nodes: [],
      edges: [],
      selectedNodeId: null,
      copiedNodes: null,
      history: [],
      historyIndex: -1,
      isDirty: false,
      isSaving: false,
      isRunning: false,
    })
  },

  setWorkflowMeta: (meta) => {
    set((state) => ({
      isDirty: true,
      workflowName: meta.name ?? state.workflowName,
      workflowDescription: meta.description ?? state.workflowDescription,
      trigger: meta.trigger ?? state.trigger,
      variables: meta.variables ?? state.variables,
      workflowMode: meta.mode ?? state.workflowMode,
      chatflowConfig: meta.chatflowConfig ?? state.chatflowConfig,
      assistantId: meta.assistantId !== undefined ? meta.assistantId : state.assistantId,
      apiEnabled: meta.apiEnabled ?? state.apiEnabled,
      workflowStatus: meta.status ?? state.workflowStatus,
    }))
  },

  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes) as Node<WorkflowNodeData>[],
      isDirty: true,
    }))
  },

  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges),
      isDirty: true,
    }))
  },

  onConnect: (connection) => {
    get().pushHistory()
    set((state) => ({
      edges: addEdge(
        { ...connection, animated: true, style: { stroke: "#64748b", strokeWidth: 2 } },
        state.edges
      ),
      isDirty: true,
    }))
  },

  addNode: (type, position) => {
    get().pushHistory()
    const id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const data = createDefaultNodeData(type)
    const newNode: Node<WorkflowNodeData> = {
      id,
      type,
      position,
      data,
    }
    set((state) => ({
      nodes: [...state.nodes, newNode],
      isDirty: true,
      selectedNodeId: id,
    }))
  },

  updateNodeData: (nodeId, data) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } as WorkflowNodeData } : n
      ),
      isDirty: true,
    }))
  },

  deleteNode: (nodeId) => {
    get().pushHistory()
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
      isDirty: true,
    }))
  },

  deleteSelectedNodes: () => {
    const state = get()
    const selectedIds = state.nodes.filter((n) => n.selected).map((n) => n.id)
    // Also include single-selected node from selectedNodeId
    if (state.selectedNodeId && !selectedIds.includes(state.selectedNodeId)) {
      selectedIds.push(state.selectedNodeId)
    }
    if (selectedIds.length === 0) return
    get().pushHistory()
    set((s) => ({
      nodes: s.nodes.filter((n) => !selectedIds.includes(n.id)),
      edges: s.edges.filter((e) => !selectedIds.includes(e.source) && !selectedIds.includes(e.target)),
      selectedNodeId: null,
      isDirty: true,
    }))
  },

  setNodes: (nodes) => {
    set({ nodes, isDirty: true })
  },

  setEdges: (edges) => {
    set({ edges, isDirty: true })
  },

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId })
  },

  copySelectedNodes: () => {
    const state = get()
    const selectedIds = state.nodes.filter((n) => n.selected).map((n) => n.id)
    if (state.selectedNodeId && !selectedIds.includes(state.selectedNodeId)) {
      selectedIds.push(state.selectedNodeId)
    }
    if (selectedIds.length === 0) return
    const selectedNodes = state.nodes.filter((n) => selectedIds.includes(n.id))
    const selectedEdges = state.edges.filter(
      (e) => selectedIds.includes(e.source) && selectedIds.includes(e.target)
    )
    set({
      copiedNodes: {
        nodes: JSON.parse(JSON.stringify(selectedNodes)),
        edges: JSON.parse(JSON.stringify(selectedEdges)),
      },
    })
  },

  pasteNodes: () => {
    const state = get()
    if (!state.copiedNodes || state.copiedNodes.nodes.length === 0) return
    get().pushHistory()

    const ts = Date.now()
    const idMap: Record<string, string> = {}
    const offset = 50

    const newNodes = state.copiedNodes.nodes.map((n, i) => {
      const newId = `node_${ts}_${Math.random().toString(36).slice(2, 7)}_${i}`
      idMap[n.id] = newId
      return {
        ...n,
        id: newId,
        position: { x: n.position.x + offset, y: n.position.y + offset },
        selected: true,
      }
    })

    const newEdges = state.copiedNodes.edges.map((e) => ({
      ...e,
      id: `edge_${ts}_${Math.random().toString(36).slice(2, 7)}`,
      source: idMap[e.source] || e.source,
      target: idMap[e.target] || e.target,
    }))

    // Deselect existing nodes
    const updatedNodes = state.nodes.map((n) => ({ ...n, selected: false }))

    set({
      nodes: [...updatedNodes, ...newNodes],
      edges: [...state.edges, ...newEdges],
      selectedNodeId: newNodes.length === 1 ? newNodes[0].id : null,
      isDirty: true,
    })
  },

  duplicateSelectedNodes: () => {
    get().copySelectedNodes()
    get().pasteNodes()
  },

  pushHistory: () => {
    set((state) => {
      const entry: HistoryEntry = {
        nodes: JSON.parse(JSON.stringify(state.nodes)),
        edges: JSON.parse(JSON.stringify(state.edges)),
      }
      const newHistory = state.history.slice(0, state.historyIndex + 1)
      newHistory.push(entry)
      if (newHistory.length > MAX_HISTORY) newHistory.shift()
      return {
        history: newHistory,
        historyIndex: newHistory.length - 1,
      }
    })
  },

  undo: () => {
    set((state) => {
      if (state.historyIndex <= 0) return state
      const newIndex = state.historyIndex - 1
      const entry = state.history[newIndex]
      return {
        nodes: entry.nodes,
        edges: entry.edges,
        historyIndex: newIndex,
        isDirty: true,
      }
    })
  },

  redo: () => {
    set((state) => {
      if (state.historyIndex >= state.history.length - 1) return state
      const newIndex = state.historyIndex + 1
      const entry = state.history[newIndex]
      return {
        nodes: entry.nodes,
        edges: entry.edges,
        historyIndex: newIndex,
        isDirty: true,
      }
    })
  },

  setDirty: (dirty) => set({ isDirty: dirty }),
  setSaving: (saving) => set({ isSaving: saving }),
  setRunning: (running) => set({ isRunning: running }),
  toggleRunHistory: () => set((s) => ({ showRunHistory: !s.showRunHistory })),
  setShowRunHistory: (show) => set({ showRunHistory: show }),
  setNodeExecutionStatus: (status) => set({ nodeExecutionStatus: status }),
  setNodeOutputs: (outputs) => set({ nodeOutputs: outputs }),
  clearNodeExecutionStatus: () => set({ nodeExecutionStatus: {}, nodeOutputs: {} }),
}))
