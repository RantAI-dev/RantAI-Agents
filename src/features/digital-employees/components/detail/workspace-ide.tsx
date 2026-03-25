"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { cn } from "@/lib/utils"
import {
  File,
  FileCode,
  FileJson,
  FileText,
  Settings,
  Folder,
  FolderOpen,
  Save,
  Copy,
  RotateCcw,
  Check,
  FileIcon,
  ChevronDown,
  ChevronRight,
  Terminal,
  X,
  Maximize2,
  Minimize2,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { useWorkspace, type FileTreeNode } from "@/hooks/use-workspace"

// ── Helpers ──

function getFileIconByExt(name: string) {
  const iconProps = { className: "h-4 w-4 shrink-0" }
  const ext = name.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "rs":
    case "py":
      return <FileCode {...iconProps} className={cn(iconProps.className, "text-[var(--syntax-function)]")} />
    case "json":
      return <FileJson {...iconProps} className={cn(iconProps.className, "text-[var(--syntax-type)]")} />
    case "md":
    case "txt":
    case "mdx":
      return <FileText {...iconProps} className={cn(iconProps.className, "text-[var(--syntax-string)]")} />
    case "toml":
    case "yaml":
    case "yml":
    case "env":
      return <Settings {...iconProps} className={cn(iconProps.className, "text-muted-foreground")} />
    default:
      return <File {...iconProps} className={cn(iconProps.className, "text-muted-foreground")} />
  }
}

const KEYWORDS = new Set([
  "import", "export", "const", "let", "var", "function", "class", "extends",
  "new", "return", "async", "await", "if", "else", "for", "of", "in",
  "private", "public", "Promise", "void", "true", "false", "from",
  "implements", "interface", "type", "enum", "while", "switch", "case",
  "break", "continue", "try", "catch", "throw", "finally", "default",
  "struct", "impl", "fn", "pub", "use", "mod", "self", "mut", "ref",
  "def", "elif", "pass", "with", "as", "yield", "lambda", "None",
])

type TokenType = "keyword" | "string" | "comment" | "number" | "function" | "plain"

function tokenizeLine(line: string): Array<{ text: string; type: TokenType }> {
  const tokens: Array<{ text: string; type: TokenType }> = []
  let i = 0

  const pushPlain = (ch: string) => {
    const last = tokens[tokens.length - 1]
    if (last?.type === "plain") last.text += ch
    else tokens.push({ text: ch, type: "plain" })
  }

  while (i < line.length) {
    const ch = line[i]

    // Line comment: // or #
    if ((ch === "/" && line[i + 1] === "/") || ch === "#") {
      tokens.push({ text: line.slice(i), type: "comment" })
      break
    }

    // String: single, double, or backtick quote
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1
      while (j < line.length) {
        if (line[j] === "\\" ) { j += 2; continue }
        if (line[j] === ch) { j++; break }
        j++
      }
      tokens.push({ text: line.slice(i, j), type: "string" })
      i = j
      continue
    }

    // Word: keyword, function call, or plain identifier
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++
      const word = line.slice(i, j)
      if (KEYWORDS.has(word)) {
        tokens.push({ text: word, type: "keyword" })
      } else if (line[j] === "(") {
        tokens.push({ text: word, type: "function" })
      } else {
        tokens.push({ text: word, type: "plain" })
      }
      i = j
      continue
    }

    // Number
    if (/[0-9]/.test(ch)) {
      let j = i
      while (j < line.length && /[0-9.]/.test(line[j])) j++
      tokens.push({ text: line.slice(i, j), type: "number" })
      i = j
      continue
    }

    pushPlain(ch)
    i++
  }

  return tokens
}

const TOKEN_CLASS: Record<TokenType, string | null> = {
  keyword: "text-[var(--syntax-keyword)]",
  string: "text-[var(--syntax-string)]",
  comment: "text-[var(--syntax-comment)] italic",
  number: "text-[var(--syntax-number)]",
  function: "text-[var(--syntax-function)]",
  plain: null,
}

function highlightCode(code: string): React.ReactNode[] {
  return code.split("\n").map((line, index) => (
    <div key={index} className="flex">
      <span className="w-10 pr-4 text-right text-[var(--editor-line-number)] select-none shrink-0 text-xs">
        {index + 1}
      </span>
      <span className="whitespace-pre">
        {tokenizeLine(line).map((token, ti) => {
          const cls = TOKEN_CLASS[token.type]
          return cls
            ? <span key={ti} className={cls}>{token.text}</span>
            : token.text
        })}
        {" "}
      </span>
    </div>
  ))
}

// ── Terminal types ──

interface TerminalLine {
  type: "input" | "output" | "error" | "success" | "info"
  content: string
}

// ── File tree recursive component ──

function FileTreeItem({
  node,
  path,
  selectedFile,
  onFileSelect,
  depth = 0,
}: {
  node: FileTreeNode
  path: string
  selectedFile: string | null
  onFileSelect: (path: string) => void
  depth?: number
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const fullPath = path ? `${path}/${node.name}` : node.name

  if (node.type === "dir") {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 w-full px-2 py-1 hover:bg-secondary/30 transition-colors text-left"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
          )}
          {expanded ? (
            <FolderOpen className="h-4 w-4 text-[var(--syntax-type)] shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-[var(--syntax-type)] shrink-0" />
          )}
          <span className="text-sm truncate text-muted-foreground">{node.name}</span>
        </button>
        {expanded && node.children?.map((child) => (
          <FileTreeItem
            key={child.name}
            node={child}
            path={fullPath}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
            depth={depth + 1}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1 cursor-pointer transition-colors",
        selectedFile === fullPath
          ? "bg-secondary/60 border-l-2 border-primary"
          : "hover:bg-secondary/30 border-l-2 border-transparent"
      )}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
      onClick={() => onFileSelect(fullPath)}
    >
      {getFileIconByExt(node.name)}
      <span
        className={cn(
          "text-sm truncate",
          selectedFile === fullPath ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {node.name}
      </span>
    </div>
  )
}

// ── Main component ──

interface WorkspaceIDEProps {
  employeeId: string
  containerRunning: boolean
}

export function WorkspaceIDE({ employeeId, containerRunning }: WorkspaceIDEProps) {
  const {
    files,
    isLoading: filesLoading,
    fetchFiles,
    readFile,
    writeFile,
    execCommand,
  } = useWorkspace(employeeId)

  // Editor state
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContents, setFileContents] = useState<Record<string, string>>({})
  const [originalContents, setOriginalContents] = useState<Record<string, string>>({})
  const [fileLoading, setFileLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)

  // Layout state
  const containerRef = useRef<HTMLDivElement>(null)
  const dividerRef = useRef<HTMLDivElement>(null)
  const [leftWidth, setLeftWidth] = useState(22)
  const [isDragging, setIsDragging] = useState(false)

  // Terminal state
  const [terminalOpen, setTerminalOpen] = useState(true)
  const [terminalHeight, setTerminalHeight] = useState(200)
  const [terminalMaximized, setTerminalMaximized] = useState(false)
  const [terminalInput, setTerminalInput] = useState("")
  const [terminalHistory, setTerminalHistory] = useState<TerminalLine[]>([
    { type: "info", content: "Workspace Terminal" },
    { type: "info", content: "Connected to employee container" },
    { type: "output", content: "" },
  ])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [execRunning, setExecRunning] = useState(false)
  const terminalInputRef = useRef<HTMLInputElement>(null)
  const terminalScrollRef = useRef<HTMLDivElement>(null)
  const terminalDividerRef = useRef<HTMLDivElement>(null)
  const [isTerminalDragging, setIsTerminalDragging] = useState(false)

  // Fetch files on mount when container is running
  useEffect(() => {
    if (containerRunning) {
      fetchFiles()
    }
  }, [containerRunning, fetchFiles])

  // Handle file selection — load content from gateway
  const handleFileSelect = useCallback(
    async (path: string) => {
      setSelectedFile(path)
      setEditing(false)

      // Already loaded
      if (fileContents[path] !== undefined) return

      setFileLoading(true)
      try {
        const result = await readFile(path)
        if (result.binary) {
          setFileContents((prev) => ({ ...prev, [path]: "[Binary file — cannot display]" }))
          setOriginalContents((prev) => ({ ...prev, [path]: "[Binary file — cannot display]" }))
        } else {
          setFileContents((prev) => ({ ...prev, [path]: result.content }))
          setOriginalContents((prev) => ({ ...prev, [path]: result.content }))
        }
      } catch {
        setFileContents((prev) => ({ ...prev, [path]: "// Error loading file" }))
      } finally {
        setFileLoading(false)
      }
    },
    [fileContents, readFile]
  )

  // Terminal command handling — real exec
  const handleTerminalCommand = useCallback(
    async (input: string) => {
      const trimmed = input.trim()
      if (!trimmed) return

      setTerminalHistory((prev) => [...prev, { type: "input", content: `$ ${trimmed}` }])
      setCommandHistory((prev) => [...prev, trimmed])
      setHistoryIndex(-1)

      if (trimmed === "clear") {
        setTerminalHistory([])
        return
      }

      setExecRunning(true)
      try {
        const result = await execCommand(trimmed)

        const lines: TerminalLine[] = []
        if (result.stdout) {
          lines.push({ type: "output", content: result.stdout })
        }
        if (result.stderr) {
          lines.push({ type: "error", content: result.stderr })
        }
        if (result.timedOut) {
          lines.push({ type: "error", content: "[Command timed out]" })
        }
        if (lines.length === 0) {
          lines.push({ type: "info", content: `Exit code: ${result.exitCode}` })
        } else if (result.exitCode !== 0 && !result.stderr) {
          lines.push({ type: "info", content: `Exit code: ${result.exitCode}` })
        }

        setTerminalHistory((prev) => [...prev, ...lines])
      } catch (err) {
        setTerminalHistory((prev) => [
          ...prev,
          { type: "error", content: err instanceof Error ? err.message : "Command execution failed" },
        ])
      } finally {
        setExecRunning(false)
      }
    },
    [execCommand]
  )

  // Terminal keyboard navigation
  const handleTerminalKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !execRunning) {
        handleTerminalCommand(terminalInput)
        setTerminalInput("")
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        if (commandHistory.length > 0) {
          const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex
          setHistoryIndex(newIndex)
          setTerminalInput(commandHistory[commandHistory.length - 1 - newIndex] || "")
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1
          setHistoryIndex(newIndex)
          setTerminalInput(commandHistory[commandHistory.length - 1 - newIndex] || "")
        } else {
          setHistoryIndex(-1)
          setTerminalInput("")
        }
      }
    },
    [terminalInput, commandHistory, historyIndex, handleTerminalCommand, execRunning]
  )

  // Terminal resize
  useEffect(() => {
    const handleTerminalMouseMove = (e: MouseEvent) => {
      if (!isTerminalDragging || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const newHeight = rect.bottom - e.clientY
      setTerminalHeight(Math.min(Math.max(newHeight, 100), 500))
    }
    const handleTerminalMouseUp = () => setIsTerminalDragging(false)

    if (isTerminalDragging) {
      document.addEventListener("mousemove", handleTerminalMouseMove)
      document.addEventListener("mouseup", handleTerminalMouseUp)
    }
    return () => {
      document.removeEventListener("mousemove", handleTerminalMouseMove)
      document.removeEventListener("mouseup", handleTerminalMouseUp)
    }
  }, [isTerminalDragging])

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalScrollRef.current) {
      terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight
    }
  }, [terminalHistory])

  const currentContent = selectedFile ? (fileContents[selectedFile] ?? "") : ""
  const isModified = selectedFile
    ? fileContents[selectedFile] !== originalContents[selectedFile]
    : false

  // Panel divider resize
  const handleMouseDown = useCallback(() => setIsDragging(true), [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100
      setLeftWidth(Math.min(Math.max(newWidth, 15), 40))
    }
    const handleMouseUp = () => setIsDragging(false)

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging])

  // Save file
  const handleSave = useCallback(async () => {
    if (!selectedFile || !isModified) return
    setSaving(true)
    try {
      await writeFile(selectedFile, fileContents[selectedFile])
      setOriginalContents((prev) => ({ ...prev, [selectedFile]: fileContents[selectedFile] }))
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch {
      // could show error toast
    } finally {
      setSaving(false)
    }
  }, [selectedFile, isModified, fileContents, writeFile])

  const handleCopy = useCallback(() => {
    if (currentContent) {
      navigator.clipboard.writeText(currentContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }, [currentContent])

  const handleRevert = useCallback(() => {
    if (selectedFile && originalContents[selectedFile] !== undefined) {
      setFileContents((prev) => ({
        ...prev,
        [selectedFile]: originalContents[selectedFile],
      }))
    }
  }, [selectedFile, originalContents])

  // Ctrl+S shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleSave])

  // ── Not running state ──
  if (!containerRunning) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
        <div className="rounded-full bg-muted p-4">
          <Terminal className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="text-center space-y-1">
          <h3 className="text-sm font-medium">Workspace</h3>
          <p className="text-xs text-muted-foreground max-w-sm">
            Start the employee to access the workspace IDE with file editor and terminal.
          </p>
        </div>
      </div>
    )
  }

  // ── IDE layout ──
  return (
    <div
      ref={containerRef}
      className="flex flex-1 min-h-0 bg-card border border-border rounded-lg overflow-hidden"
    >
      {/* Left Panel - File Explorer */}
      <div
        className="flex flex-col bg-sidebar border-r border-border overflow-hidden shrink-0"
        style={{ width: `${leftWidth}%` }}
      >
        {/* File explorer header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
            Explorer
          </span>
          <button
            onClick={() => fetchFiles()}
            className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh files"
          >
            <RefreshCw className={cn("h-3 w-3", filesLoading && "animate-spin")} />
          </button>
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
          {filesLoading && files.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs text-muted-foreground">No files found</p>
            </div>
          ) : (
            files.map((node) => (
              <FileTreeItem
                key={node.name}
                node={node}
                path=""
                selectedFile={selectedFile}
                onFileSelect={handleFileSelect}
              />
            ))
          )}
        </div>
      </div>

      {/* Drag Handle */}
      <div
        ref={dividerRef}
        onMouseDown={handleMouseDown}
        className={cn(
          "w-1 cursor-col-resize hover:bg-primary/30 transition-colors shrink-0",
          isDragging && "bg-primary/50"
        )}
      />

      {/* Right Panel - Code Editor + Terminal */}
      <div className="flex-1 flex flex-col min-w-0 bg-[var(--editor-bg)]">
        {selectedFile && !terminalMaximized ? (
          <>
            {/* Breadcrumb Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground font-mono text-xs">{selectedFile}</span>
                {isModified && (
                  <span className="w-2 h-2 rounded-full bg-primary" title="Unsaved changes" />
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* Edit toggle */}
                <button
                  onClick={() => setEditing(!editing)}
                  className={cn(
                    "px-2 py-1 text-xs rounded transition-colors",
                    editing
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  {editing ? "Preview" : "Edit"}
                </button>
                <button
                  onClick={handleSave}
                  disabled={!isModified || saving}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors",
                    saved
                      ? "bg-[var(--terminal-success)]/20 text-[var(--terminal-success)]"
                      : isModified
                        ? "hover:bg-secondary text-foreground"
                        : "text-muted-foreground/50 cursor-not-allowed"
                  )}
                  title="Save (Ctrl+S)"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : saved ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">{saving ? "Saving" : saved ? "Saved" : "Save"}</span>
                </button>
                <button
                  onClick={handleCopy}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors",
                    copied
                      ? "bg-[var(--terminal-success)]/20 text-[var(--terminal-success)]"
                      : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                  title="Copy"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                {isModified && (
                  <button
                    onClick={handleRevert}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    title="Revert changes"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Code Content */}
            {fileLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : editing ? (
              <textarea
                value={currentContent}
                onChange={(e) =>
                  setFileContents((prev) => ({
                    ...prev,
                    [selectedFile!]: e.target.value,
                  }))
                }
                className="flex-1 w-full p-4 bg-transparent font-mono text-[13px] leading-5 text-foreground resize-none outline-none"
                spellCheck={false}
              />
            ) : (
              <div className="flex-1 overflow-auto font-mono text-[13px] leading-5 p-4">
                {highlightCode(currentContent)}
              </div>
            )}
          </>
        ) : !terminalMaximized ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <FileIcon className="h-16 w-16 mb-4 text-muted-foreground/30" />
            <p className="text-sm">Select a file to view</p>
          </div>
        ) : null}

        {/* Terminal Panel */}
        {terminalOpen && (
          <div
            className="flex flex-col border-t border-border bg-[var(--terminal-bg)]"
            style={{ height: terminalMaximized ? "100%" : terminalHeight }}
          >
            {/* Terminal Resize Handle */}
            <div
              ref={terminalDividerRef}
              onMouseDown={() => setIsTerminalDragging(true)}
              className={cn(
                "h-1 cursor-row-resize hover:bg-primary/30 transition-colors",
                isTerminalDragging && "bg-primary/50"
              )}
            />

            {/* Terminal Header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card/30">
              <div className="flex items-center gap-2">
                <Terminal className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Terminal</span>
                {execRunning && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTerminalMaximized(!terminalMaximized)}
                  className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title={terminalMaximized ? "Restore" : "Maximize"}
                >
                  {terminalMaximized ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  onClick={() => setTerminalOpen(false)}
                  className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="Close terminal"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Terminal Content */}
            <div
              ref={terminalScrollRef}
              className="flex-1 overflow-y-auto font-mono text-[13px] leading-5 p-3 scrollbar-thin"
              onClick={() => terminalInputRef.current?.focus()}
            >
              {terminalHistory.map((line, index) => (
                <div
                  key={index}
                  className={cn(
                    "whitespace-pre-wrap",
                    line.type === "input" && "text-[var(--terminal-prompt)]",
                    line.type === "output" && "text-[var(--terminal-output)]",
                    line.type === "error" && "text-[var(--terminal-error)]",
                    line.type === "success" && "text-[var(--terminal-success)]",
                    line.type === "info" && "text-muted-foreground"
                  )}
                >
                  {line.content}
                </div>
              ))}

              {/* Input Line */}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[var(--terminal-prompt)]">$</span>
                <input
                  ref={terminalInputRef}
                  type="text"
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  onKeyDown={handleTerminalKeyDown}
                  disabled={execRunning}
                  className="flex-1 bg-transparent outline-none text-foreground caret-primary disabled:opacity-50"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={execRunning ? "Running..." : ""}
                />
              </div>
            </div>
          </div>
        )}

        {/* Terminal Toggle (when closed) */}
        {!terminalOpen && (
          <button
            onClick={() => setTerminalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 border-t border-border bg-card/30 hover:bg-secondary/30 transition-colors"
          >
            <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Terminal</span>
          </button>
        )}
      </div>
    </div>
  )
}
