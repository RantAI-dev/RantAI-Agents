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
  trigger: TriggerConfig
  variables: WorkflowVariables

  // Canvas state
  nodes: Node<WorkflowNodeData>[]
  edges: Edge[]

  // Selection
  selectedNodeId: string | null

  // Undo/redo
  history: HistoryEntry[]
  historyIndex: number

  // UI state
  isDirty: boolean
  isSaving: boolean
  isRunning: boolean
  showRunHistory: boolean

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
  }) => void
  resetEditor: () => void

  setWorkflowMeta: (meta: Partial<{
    name: string
    description: string
    trigger: TriggerConfig
    variables: WorkflowVariables
  }>) => void

  // Node/Edge ops
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: (connection: Connection) => void
  addNode: (type: NodeType, position: { x: number; y: number }) => void
  updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => void
  deleteNode: (nodeId: string) => void

  // Selection
  selectNode: (nodeId: string | null) => void

  // History
  undo: () => void
  redo: () => void
  pushHistory: () => void

  // State
  setDirty: (dirty: boolean) => void
  setSaving: (saving: boolean) => void
  setRunning: (running: boolean) => void
  toggleRunHistory: () => void
}

const MAX_HISTORY = 50

export const useWorkflowEditor = create<WorkflowEditorState>((set, get) => ({
  workflowId: null,
  workflowName: "",
  workflowDescription: "",
  workflowStatus: "DRAFT",
  trigger: { type: "manual" },
  variables: { inputs: [], outputs: [] },
  nodes: [],
  edges: [],
  selectedNodeId: null,
  history: [],
  historyIndex: -1,
  isDirty: false,
  isSaving: false,
  isRunning: false,
  showRunHistory: false,

  loadWorkflow: (data) => {
    set({
      workflowId: data.id,
      workflowName: data.name,
      workflowDescription: data.description || "",
      workflowStatus: data.status,
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
      trigger: { type: "manual" },
      variables: { inputs: [], outputs: [] },
      nodes: [],
      edges: [],
      selectedNodeId: null,
      history: [],
      historyIndex: -1,
      isDirty: false,
      isSaving: false,
      isRunning: false,
    })
  },

  setWorkflowMeta: (meta) => {
    set((state) => ({
      ...meta,
      isDirty: true,
      workflowName: meta.name ?? state.workflowName,
      workflowDescription: meta.description ?? state.workflowDescription,
      trigger: meta.trigger ?? state.trigger,
      variables: meta.variables ?? state.variables,
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

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId })
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
}))
