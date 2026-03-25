"use client"

import { useCallback } from "react"
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command"
import {
  NODE_CATEGORIES,
  type NodeCategory,
  type NodeType,
} from "@/lib/workflow/types"
import { useWorkflowEditor } from "@/hooks/use-workflow-editor"

interface QuickAddDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QuickAddDialog({ open, onOpenChange }: QuickAddDialogProps) {
  const addNode = useWorkflowEditor((s) => s.addNode)

  const handleSelect = useCallback(
    (nodeType: NodeType) => {
      // Add node at a centered position (offset from origin for visibility)
      const x = 250 + Math.random() * 100
      const y = 200 + Math.random() * 100
      addNode(nodeType, { x, y })
      onOpenChange(false)
    },
    [addNode, onOpenChange]
  )

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add Node"
      description="Search for a node type to add to the canvas"
    >
      <CommandInput placeholder="Search nodes..." />
      <CommandList>
        <CommandEmpty>No nodes found.</CommandEmpty>
        {(
          Object.entries(NODE_CATEGORIES) as [
            NodeCategory,
            (typeof NODE_CATEGORIES)[NodeCategory],
          ][]
        ).map(([catKey, catMeta]) => (
          <CommandGroup key={catKey} heading={catMeta.label}>
            {catMeta.types.map((nodeType) => (
              <CommandItem
                key={nodeType.type}
                value={`${catMeta.label} ${nodeType.label} ${nodeType.description}`}
                onSelect={() => handleSelect(nodeType.type)}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: catMeta.headerColor }}
                />
                <div className="flex flex-col">
                  <span className="text-sm">{nodeType.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {nodeType.description}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
