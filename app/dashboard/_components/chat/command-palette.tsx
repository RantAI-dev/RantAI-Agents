"use client"

import { useEffect, useState, useCallback } from "react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import {
  MessageSquarePlus,
  Download,
  Trash2,
  Sun,
  Moon,
  Command,
} from "lucide-react"
import { useTheme } from "next-themes"

interface CommandPaletteProps {
  onNewChat: () => void
  onExportMarkdown?: () => void
  onExportJson?: () => void
  onClearChat?: () => void
}

export function CommandPalette({
  onNewChat,
  onExportMarkdown,
  onExportJson,
  onClearChat,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const { theme, setTheme } = useTheme()

  // Global keyboard shortcuts
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K to open command palette
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }

      // Cmd+N for new chat (when palette is closed)
      if (e.key === "n" && (e.metaKey || e.ctrlKey) && !open) {
        e.preventDefault()
        onNewChat()
      }

      // Cmd+J for theme toggle
      if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setTheme(theme === "dark" ? "light" : "dark")
      }

      // Cmd+E for export markdown
      if (e.key === "e" && (e.metaKey || e.ctrlKey) && onExportMarkdown) {
        e.preventDefault()
        onExportMarkdown()
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [onNewChat, onExportMarkdown, open, theme, setTheme])

  const runCommand = useCallback((command: () => void) => {
    setOpen(false)
    command()
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark")
  }, [theme, setTheme])

  return (
    <>
      {/* Command palette trigger hint */}
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
      >
        <Command className="h-3 w-3" />
        <span>K</span>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Chat">
            <CommandItem onSelect={() => runCommand(onNewChat)}>
              <MessageSquarePlus className="mr-2 h-4 w-4" />
              New Chat
              <CommandShortcut>⌘N</CommandShortcut>
            </CommandItem>
            {onClearChat && (
              <CommandItem onSelect={() => runCommand(onClearChat)}>
                <Trash2 className="mr-2 h-4 w-4" />
                Clear Chat
              </CommandItem>
            )}
          </CommandGroup>

          {(onExportMarkdown || onExportJson) && (
            <CommandGroup heading="Export">
              {onExportMarkdown && (
                <CommandItem onSelect={() => runCommand(onExportMarkdown)}>
                  <Download className="mr-2 h-4 w-4" />
                  Export as Markdown
                  <CommandShortcut>⌘E</CommandShortcut>
                </CommandItem>
              )}
              {onExportJson && (
                <CommandItem onSelect={() => runCommand(onExportJson)}>
                  <Download className="mr-2 h-4 w-4" />
                  Export as JSON
                </CommandItem>
              )}
            </CommandGroup>
          )}

          <CommandGroup heading="Settings">
            <CommandItem onSelect={() => runCommand(toggleTheme)}>
              {theme === "dark" ? (
                <Sun className="mr-2 h-4 w-4" />
              ) : (
                <Moon className="mr-2 h-4 w-4" />
              )}
              Toggle Theme
              <CommandShortcut>⌘J</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
