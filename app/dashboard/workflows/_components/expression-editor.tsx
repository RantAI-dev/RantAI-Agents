"use client"

import {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  forwardRef,
} from "react"
import { Textarea } from "@/components/ui/textarea"
import { useWorkflowEditor } from "@/hooks/use-workflow-editor"
import { cn } from "@/lib/utils"
import type { WorkflowNodeData } from "@/lib/workflow/types"

// ─── Reference Item ──────────────────────────────────────────────────────────

interface ReferenceItem {
  label: string // display text
  insertText: string // what gets inserted inside {{ }}
  description: string // help text
  category: "input" | "node" | "variable" | "state"
}

const CATEGORY_COLORS: Record<string, string> = {
  input: "text-blue-500",
  node: "text-violet-500",
  variable: "text-emerald-500",
  state: "text-amber-500",
}

const CATEGORY_LABELS: Record<string, string> = {
  input: "Input",
  node: "Node Output",
  variable: "Variable",
  state: "Flow State",
}

// ─── Compute available references ────────────────────────────────────────────

function useAvailableReferences(currentNodeId: string | null): ReferenceItem[] {
  const nodes = useWorkflowEditor((s) => s.nodes)
  const variables = useWorkflowEditor((s) => s.variables)

  return useMemo(() => {
    const refs: ReferenceItem[] = []

    // 1. Input references
    refs.push({
      label: "input",
      insertText: "input",
      description: "Current node input data",
      category: "input",
    })
    refs.push({
      label: "input.message",
      insertText: "input.message",
      description: "Message from trigger/previous node",
      category: "input",
    })
    refs.push({
      label: "input.data",
      insertText: "input.data",
      description: "Data payload from previous node",
      category: "input",
    })

    // 2. Flow state references
    refs.push({
      label: "$flow.state",
      insertText: "$flow.state",
      description: "Shared mutable flow state",
      category: "state",
    })
    refs.push({
      label: "$flow.state.<key>",
      insertText: "$flow.state.",
      description: "Access specific state key",
      category: "state",
    })
    refs.push({
      label: "$flow.meta.runId",
      insertText: "$flow.meta.runId",
      description: "Current run ID",
      category: "state",
    })
    refs.push({
      label: "$flow.meta.workflowId",
      insertText: "$flow.meta.workflowId",
      description: "Current workflow ID",
      category: "state",
    })

    // 3. Workflow input variables
    if (variables.inputs.length > 0) {
      for (const v of variables.inputs) {
        refs.push({
          label: `$variables.${v.name}`,
          insertText: `$variables.${v.name}`,
          description: v.description || `Input variable (${v.type})`,
          category: "variable",
        })
      }
    } else {
      refs.push({
        label: "$variables.<name>",
        insertText: "$variables.",
        description: "Workflow input variables",
        category: "variable",
      })
    }

    // 4. Node output references (from other nodes)
    for (const node of nodes) {
      if (node.id === currentNodeId) continue
      const data = node.data as WorkflowNodeData
      const nodeLabel = data.label || node.id
      const shortId = node.id.length > 12 ? node.id.slice(0, 8) + "…" : node.id

      refs.push({
        label: `${nodeLabel}.output`,
        insertText: `${node.id}.output`,
        description: `Output from "${nodeLabel}" (${shortId})`,
        category: "node",
      })
      refs.push({
        label: `${nodeLabel}.output.text`,
        insertText: `${node.id}.output.text`,
        description: `Text output from "${nodeLabel}"`,
        category: "node",
      })
      refs.push({
        label: `${nodeLabel}.output.data`,
        insertText: `${node.id}.output.data`,
        description: `Data output from "${nodeLabel}"`,
        category: "node",
      })
    }

    return refs
  }, [nodes, variables, currentNodeId])
}

// ─── Expression Editor Component ─────────────────────────────────────────────

interface ExpressionEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  rows?: number
  mono?: boolean
}

export const ExpressionEditor = forwardRef<HTMLTextAreaElement, ExpressionEditorProps>(
  function ExpressionEditor({ value, onChange, placeholder, className, rows, mono }, ref) {
    const selectedNodeId = useWorkflowEditor((s) => s.selectedNodeId)
    const references = useAvailableReferences(selectedNodeId)

    const [showPopup, setShowPopup] = useState(false)
    const [filter, setFilter] = useState("")
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [triggerPos, setTriggerPos] = useState<number | null>(null)

    const internalRef = useRef<HTMLTextAreaElement>(null)
    const popupRef = useRef<HTMLDivElement>(null)
    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || internalRef

    // Filter references based on typed text after {{
    const filtered = useMemo(() => {
      if (!filter) return references
      const lower = filter.toLowerCase()
      return references.filter(
        (r) =>
          r.label.toLowerCase().includes(lower) ||
          r.insertText.toLowerCase().includes(lower) ||
          r.description.toLowerCase().includes(lower)
      )
    }, [references, filter])

    // Group filtered items by category
    const grouped = useMemo(() => {
      const map = new Map<string, ReferenceItem[]>()
      for (const item of filtered) {
        const list = map.get(item.category) || []
        list.push(item)
        map.set(item.category, list)
      }
      return map
    }, [filtered])

    // Flat list for keyboard nav
    const flatList = useMemo(() => {
      const items: ReferenceItem[] = []
      for (const [, list] of grouped) {
        items.push(...list)
      }
      return items
    }, [grouped])

    // Reset selected index when filter changes
    useEffect(() => {
      setSelectedIndex(0)
    }, [filter])

    // Insert the selected reference
    const insertReference = useCallback(
      (item: ReferenceItem) => {
        if (triggerPos === null) return
        const textarea = textareaRef.current
        if (!textarea) return

        const before = value.slice(0, triggerPos)
        const after = value.slice(textarea.selectionStart)

        // Check if there's already closing }}
        const hasClosing = after.trimStart().startsWith("}}")
        const insertSuffix = hasClosing ? "" : " }}"
        const newValue = `${before}{{ ${item.insertText}${insertSuffix}${hasClosing ? after : after}`

        onChange(newValue)
        setShowPopup(false)
        setFilter("")
        setTriggerPos(null)

        // Restore focus and cursor position
        requestAnimationFrame(() => {
          if (textarea) {
            textarea.focus()
            const cursorPos = before.length + 3 + item.insertText.length + (hasClosing ? 0 : 3)
            textarea.setSelectionRange(cursorPos, cursorPos)
          }
        })
      },
      [triggerPos, value, onChange, textareaRef]
    )

    // Handle input changes — detect {{ trigger
    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value
        onChange(newValue)

        const cursorPos = e.target.selectionStart
        const textBefore = newValue.slice(0, cursorPos)

        // Find the last {{ that hasn't been closed with }}
        const lastOpenIdx = textBefore.lastIndexOf("{{")
        if (lastOpenIdx >= 0) {
          const afterOpen = textBefore.slice(lastOpenIdx + 2)
          // Check no }} between {{ and cursor
          if (!afterOpen.includes("}}")) {
            setShowPopup(true)
            setTriggerPos(lastOpenIdx)
            setFilter(afterOpen.trim())
            return
          }
        }

        setShowPopup(false)
        setTriggerPos(null)
        setFilter("")
      },
      [onChange]
    )

    // Keyboard navigation
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (!showPopup || flatList.length === 0) return

        switch (e.key) {
          case "ArrowDown":
            e.preventDefault()
            setSelectedIndex((prev) => (prev + 1) % flatList.length)
            break
          case "ArrowUp":
            e.preventDefault()
            setSelectedIndex((prev) => (prev - 1 + flatList.length) % flatList.length)
            break
          case "Enter":
          case "Tab":
            e.preventDefault()
            insertReference(flatList[selectedIndex])
            break
          case "Escape":
            e.preventDefault()
            setShowPopup(false)
            setFilter("")
            setTriggerPos(null)
            break
        }
      },
      [showPopup, flatList, selectedIndex, insertReference]
    )

    // Close popup when clicking outside
    useEffect(() => {
      if (!showPopup) return
      const handleClick = (e: MouseEvent) => {
        if (
          popupRef.current &&
          !popupRef.current.contains(e.target as HTMLElement) &&
          textareaRef.current &&
          !textareaRef.current.contains(e.target as HTMLElement)
        ) {
          setShowPopup(false)
        }
      }
      document.addEventListener("mousedown", handleClick)
      return () => document.removeEventListener("mousedown", handleClick)
    }, [showPopup, textareaRef])

    // Scroll selected into view
    useEffect(() => {
      if (!showPopup || !popupRef.current) return
      const selected = popupRef.current.querySelector("[data-selected='true']")
      if (selected) {
        selected.scrollIntoView({ block: "nearest" })
      }
    }, [selectedIndex, showPopup])

    let flatIdx = -1

    return (
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          className={cn(
            "text-xs",
            mono && "font-mono",
            className
          )}
        />

        {/* Template hint */}
        <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-tight">
          {"Type {{ to autocomplete"} &middot; {"{{ input }}"}, {"{{ nodeId.output }}"}, {"{{ $flow.state }}"}, {"{{ $variables }}"}
        </p>

        {/* Autocomplete popup */}
        {showPopup && flatList.length > 0 && (
          <div
            ref={popupRef}
            className="absolute z-50 left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-[220px] overflow-y-auto"
          >
            {[...grouped.entries()].map(([category, items]) => (
              <div key={category}>
                <div className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 sticky top-0">
                  <span className={CATEGORY_COLORS[category]}>
                    {CATEGORY_LABELS[category] || category}
                  </span>
                </div>
                {items.map((item) => {
                  flatIdx++
                  const idx = flatIdx
                  const isSelected = idx === selectedIndex
                  return (
                    <button
                      key={`${category}-${item.insertText}`}
                      data-selected={isSelected}
                      className={cn(
                        "w-full text-left px-2 py-1 flex flex-col gap-0 hover:bg-accent/50 cursor-pointer transition-colors",
                        isSelected && "bg-accent"
                      )}
                      onClick={() => insertReference(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <span className="text-[11px] font-mono">
                        {"{{ "}
                        <span className={CATEGORY_COLORS[item.category]}>
                          {item.label}
                        </span>
                        {" }}"}
                      </span>
                      <span className="text-[9px] text-muted-foreground truncate">
                        {item.description}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
)
