"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)
const mod = isMac ? "Cmd" : "Ctrl"

const SHORTCUTS = [
  { category: "General", items: [
    { keys: `${mod}+S`, action: "Save workflow" },
    { keys: `${mod}+Z`, action: "Undo" },
    { keys: isMac ? `${mod}+Shift+Z` : `${mod}+Y`, action: "Redo" },
    { keys: `${mod}+K`, action: "Quick add node" },
    { keys: "?", action: "Show shortcuts" },
  ]},
  { category: "Nodes", items: [
    { keys: `${mod}+C`, action: "Copy selected node(s)" },
    { keys: `${mod}+V`, action: "Paste node(s)" },
    { keys: `${mod}+D`, action: "Duplicate selected node(s)" },
    { keys: "Delete", action: "Delete selected node(s)" },
    { keys: "Escape", action: "Deselect all" },
  ]},
  { category: "Canvas", items: [
    { keys: "Shift+Click", action: "Multi-select nodes" },
    { keys: "Drag", action: "Box selection" },
    { keys: "Scroll", action: "Zoom in/out" },
    { keys: "Middle Mouse Drag", action: "Pan canvas" },
  ]},
]

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {SHORTCUTS.map((section) => (
            <div key={section.category}>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                {section.category}
              </h4>
              <div className="space-y-1">
                {section.items.map((shortcut) => (
                  <div
                    key={shortcut.keys}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm text-foreground">
                      {shortcut.action}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.split("+").map((key, i) => (
                        <span key={i}>
                          {i > 0 && <span className="text-muted-foreground text-xs mx-0.5">+</span>}
                          <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 text-xs font-mono bg-muted border rounded">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
