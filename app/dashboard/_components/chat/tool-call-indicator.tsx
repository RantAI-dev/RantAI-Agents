"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Wrench,
  ChevronDown,
  CheckCircle,
  XCircle,
  Loader2,
  Globe,
  Search,
  BookOpen,
  Database,
  Send,
  FileText,
  Calculator,
  Clock,
  Code,
  Type,
  Download,
  Braces,
  Terminal,
  Copy,
  Check,
} from "@/lib/icons"
import { cn } from "@/lib/utils"

// Tool display names for nicer UI
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  knowledge_search: "Searching knowledge base",
  customer_lookup: "Looking up customer",
  channel_dispatch: "Sending message",
  document_analysis: "Analyzing document",
  file_operations: "Processing file",
  web_search: "Searching the web",
  calculator: "Calculating",
  date_time: "Processing date/time",
  json_transform: "Transforming JSON",
  text_utilities: "Processing text",
  code_interpreter: "Running code",
  // RantaiClaw agent tools
  shell: "Running command",
  file_read: "Reading file",
  file_write: "Writing file",
  memory_store: "Saving to memory",
  memory_recall: "Recalling memory",
  browser: "Browsing web page",
  install_packages: "Installing packages",
  install_skill: "Installing skill",
  search_skills: "Searching skills",
  list_my_skills: "Listing skills",
  list_my_tools: "Listing tools",
  update_memory: "Updating memory",
  write_note: "Writing note",
  search_memory: "Searching memory",
  create_tool: "Creating tool",
}

// Tool-specific icons
const TOOL_ICONS: Record<string, typeof Wrench> = {
  web_search: Globe,
  knowledge_search: BookOpen,
  customer_lookup: Database,
  channel_dispatch: Send,
  document_analysis: FileText,
  file_operations: FileText,
  calculator: Calculator,
  date_time: Clock,
  json_transform: Code,
  text_utilities: Type,
  code_interpreter: Terminal,
  // RantaiClaw agent tools
  shell: Terminal,
  file_read: FileText,
  file_write: FileText,
  memory_store: Database,
  memory_recall: Search,
  browser: Globe,
  install_packages: Download,
  install_skill: Download,
  search_skills: Search,
  list_my_skills: BookOpen,
  list_my_tools: Wrench,
  update_memory: Database,
  write_note: FileText,
  search_memory: Search,
  create_tool: Wrench,
}

type ToolState =
  | "input-streaming"
  | "input-available"
  | "execution-started"
  | "done"
  | "error"

interface ToolCallIndicatorProps {
  toolName: string
  state: ToolState
  args?: Record<string, unknown>
  result?: unknown
  errorText?: string
}

// Extract domain from URL
function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "")
  } catch {
    return url
  }
}

// Get favicon URL for a domain
function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  } catch {
    return ""
  }
}

interface SearchResult {
  title: string
  url: string
  snippet?: string
}

// ── Web Search specialized indicator ──
function WebSearchIndicator({
  state,
  args,
  result,
  errorText,
}: Omit<ToolCallIndicatorProps, "toolName">) {
  const [expanded, setExpanded] = useState(true)

  const isRunning =
    state === "input-streaming" ||
    state === "input-available" ||
    state === "execution-started"
  const isDone = state === "done"
  const isError = state === "error"

  const query = (args?.query as string) || ""
  const output = result as { success?: boolean; resultCount?: number; results?: SearchResult[] } | undefined
  const results = output?.results || []
  const resultCount = output?.resultCount || results.length

  return (
    <motion.div
      className="my-2"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header: status + "Search pages:" + query + count */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 text-xs w-full text-left transition-colors py-1",
          isError ? "text-destructive" : "text-foreground"
        )}
      >
        {isRunning ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : isError ? (
          <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring" as const, stiffness: 400, damping: 15 }}
          >
            <CheckCircle className="h-3.5 w-3.5 shrink-0 text-chart-2" />
          </motion.div>
        )}

        <span className="text-muted-foreground">Search pages:</span>
        {query && (
          <span className="font-semibold text-foreground truncate">
            {query}
          </span>
        )}
        {isDone && resultCount > 0 && (
          <span className="text-muted-foreground shrink-0">({resultCount})</span>
        )}
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform ml-auto",
            !expanded && "-rotate-90"
          )}
        />
      </button>

      {/* Expandable: search query bar + results cards */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Search query bar */}
            {query && (
              <div className="flex items-center gap-2 mt-1.5 px-3 py-2 rounded-xl bg-muted/50 border border-border/40 text-xs">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 text-muted-foreground truncate">{query}</span>
                {isDone && resultCount > 0 && (
                  <span className="text-muted-foreground/60 shrink-0 tabular-nums">
                    {resultCount}
                  </span>
                )}
              </div>
            )}

            {/* Error */}
            {isError && errorText && (
              <div className="mt-2 px-3 py-2 rounded-xl bg-destructive/5 border border-destructive/15 text-xs text-destructive">
                {errorText}
              </div>
            )}

            {/* Results as horizontal scrollable cards */}
            {isDone && results.length > 0 && (
              <div className="flex gap-2 mt-2 overflow-x-auto pb-1 scrollbar-thin">
                {results.map((r, i) => (
                  <a
                    key={i}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 group/card flex flex-col gap-1.5 p-2.5 rounded-xl bg-muted/40 border border-border/40 hover:border-border/80 hover:bg-muted/70 transition-all w-[160px]"
                  >
                    <p className="text-[11px] font-medium text-foreground line-clamp-2 leading-snug min-h-[2.75em]">
                      {r.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-auto">
                      <img
                        src={getFaviconUrl(r.url)}
                        alt=""
                        className="h-3 w-3 rounded-sm shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none"
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground truncate">
                        {getDomain(r.url)}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ============================================
// Code Interpreter Indicator
// ============================================

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

/** Split stdout into alternating text/image segments and render images inline */
function CodeOutput({ text }: { text: string }) {
  const segments: Array<{ type: "text"; content: string } | { type: "image"; src: string }> = []
  let textBuf: string[] = []

  for (const line of text.split("\n")) {
    if (/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/.test(line.trim())) {
      if (textBuf.length) {
        segments.push({ type: "text", content: textBuf.join("\n") })
        textBuf = []
      }
      segments.push({ type: "image", src: line.trim() })
    } else {
      textBuf.push(line)
    }
  }
  if (textBuf.length) segments.push({ type: "text", content: textBuf.join("\n") })

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "image" ? (
          <img
            key={i}
            src={seg.src}
            alt="Plot output"
            className="mt-2 max-w-full rounded-lg border border-border/30"
          />
        ) : seg.content.trim() ? (
          <pre key={i} className="p-3 text-xs font-mono whitespace-pre-wrap text-foreground leading-relaxed">
            {seg.content}
          </pre>
        ) : null
      )}
    </>
  )
}

function CodeInterpreterIndicator({
  state,
  args,
  result,
  errorText,
}: Omit<ToolCallIndicatorProps, "toolName">) {
  const [expanded, setExpanded] = useState(true)

  const isRunning =
    state === "input-streaming" ||
    state === "input-available" ||
    state === "execution-started"
  const isDone = state === "done"
  const isError = state === "error"

  const language = (args?.language as string) || "python"
  const code = (args?.code as string) || ""
  const output = result as
    | { success?: boolean; output?: string; stderr?: string; exitCode?: number; error?: string }
    | undefined

  const statusLabel = isRunning
    ? state === "input-streaming"
      ? "Preparing code"
      : "Running code"
    : isDone
      ? "Ran code"
      : "Code execution failed"

  return (
    <motion.div
      className="my-2"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 text-xs w-full text-left transition-colors py-1",
          isError ? "text-destructive" : "text-foreground"
        )}
      >
        {isRunning ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : isError ? (
          <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring" as const, stiffness: 400, damping: 15 }}
          >
            <CheckCircle className="h-3.5 w-3.5 shrink-0 text-chart-2" />
          </motion.div>
        )}

        <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="font-medium">{statusLabel}</span>
        <span className="text-muted-foreground capitalize">· {language}</span>

        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform ml-auto",
            !expanded && "-rotate-90"
          )}
        />
      </button>

      {/* Expandable content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Code block */}
            {code && (
              <div className="mt-1.5 rounded-xl border border-border/40 bg-[#1e1e2e] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 text-[10px] text-muted-foreground/60">
                  <span className="capitalize">{language}</span>
                  <CopyCodeButton code={code} />
                </div>
                <pre className="p-3 text-xs overflow-x-auto text-[#cdd6f4] leading-relaxed">
                  <code>{code}</code>
                </pre>
              </div>
            )}

            {/* Output panel */}
            {isDone && output?.output && (
              <div className="mt-2 rounded-xl border border-border/40 bg-muted/30 overflow-hidden">
                <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border/20 flex items-center gap-1.5">
                  <span>Output</span>
                  {output.exitCode === 0 ? (
                    <CheckCircle className="h-3 w-3 text-chart-2" />
                  ) : (
                    <XCircle className="h-3 w-3 text-destructive" />
                  )}
                </div>
                <CodeOutput text={output.output} />
              </div>
            )}

            {/* Stderr */}
            {isDone && output?.stderr && (
              <pre className="mt-1.5 px-3 py-2 rounded-xl text-xs font-mono text-destructive bg-destructive/5 border border-destructive/15 whitespace-pre-wrap">
                {output.stderr}
              </pre>
            )}

            {/* Tool-level error (e.g. Piston unreachable) */}
            {isDone && output?.error && (
              <div className="mt-1.5 px-3 py-2 rounded-xl bg-destructive/5 border border-destructive/15 text-xs text-destructive">
                {output.error}
              </div>
            )}

            {/* Stream-level error */}
            {isError && errorText && (
              <div className="mt-2 px-3 py-2 rounded-xl bg-destructive/5 border border-destructive/15 text-xs text-destructive">
                {errorText}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ============================================
// Utility Functions for Smart Rendering
// ============================================

const PRIMARY_PARAMS = ["query", "expression", "text", "operation", "message", "channel"]

function getInputSummary(args: Record<string, unknown>): string | null {
  if (!args || Object.keys(args).length === 0) return null
  for (const key of PRIMARY_PARAMS) {
    if (typeof args[key] === "string" && args[key]) return args[key] as string
  }
  for (const value of Object.values(args)) {
    if (typeof value === "string" && value.length > 0 && value.length < 200) return value
  }
  return null
}

type ResultPattern = "scalar" | "download" | "status" | "entities" | "recordList" | "keyValue"

function detectPattern(result: unknown): ResultPattern {
  if (result == null || typeof result !== "object") return "scalar"
  const obj = result as Record<string, unknown>

  if ("result" in obj && (typeof obj.result === "string" || typeof obj.result === "number"))
    return "scalar"
  if (typeof obj.downloadUrl === "string") return "download"
  if (
    typeof obj.success === "boolean" &&
    typeof obj.message === "string" &&
    !Object.values(obj).some((v) => Array.isArray(v))
  )
    return "status"
  if (
    Array.isArray(obj.entities) &&
    obj.entities.length > 0 &&
    typeof obj.entities[0]?.text === "string" &&
    typeof obj.entities[0]?.type === "string"
  )
    return "entities"

  const hasArrayOfObjects = Object.values(obj).some(
    (v) => Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && v[0] !== null
  )
  if (hasArrayOfObjects) return "recordList"

  return "keyValue"
}

function formatKeyName(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim()
}

function formatValue(value: unknown, maxLen = 100): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "number") return String(value)
  if (typeof value === "string") {
    return value.length > maxLen ? value.slice(0, maxLen) + "..." : value
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"
    if (value.every((v) => typeof v === "string" || typeof v === "number")) {
      const joined = value.join(", ")
      return joined.length > maxLen ? joined.slice(0, maxLen) + "..." : joined
    }
    return `${value.length} items`
  }
  if (typeof value === "object") return "{...}"
  return String(value)
}

const SKIP_KEYS = new Set(["id", "confidence", "similarity", "content", "context", "success", "found"])
const PRIMARY_DISPLAY_KEYS = ["title", "name", "text", "email", "label", "match", "customerName", "customerEmail"]
const SECONDARY_DISPLAY_KEYS = ["type", "status", "channel", "category", "domain", "role"]

function selectDisplayColumns(items: Record<string, unknown>[]): { primary: string | null; secondary: string | null } {
  if (items.length === 0) return { primary: null, secondary: null }
  const keys = Object.keys(items[0])
  const primary = PRIMARY_DISPLAY_KEYS.find((k) => keys.includes(k)) || keys.find((k) => !SKIP_KEYS.has(k) && typeof items[0][k] === "string") || null
  const secondary = SECONDARY_DISPLAY_KEYS.find((k) => keys.includes(k) && k !== primary) || null
  return { primary, secondary }
}

function findArrayField(obj: Record<string, unknown>): { key: string; items: Record<string, unknown>[] } | null {
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object" && value[0] !== null) {
      return { key, items: value as Record<string, unknown>[] }
    }
  }
  return null
}

// ============================================
// Sub-Renderers
// ============================================

function ScalarResultRenderer({ result }: { result: Record<string, unknown> }) {
  const expression = typeof result.expression === "string" ? result.expression : null
  const value = result.result
  return (
    <div className="mt-1.5 ml-7 flex items-center gap-2 text-xs flex-wrap">
      {expression && (
        <>
          <span className="font-mono text-muted-foreground">{expression}</span>
          <span className="text-muted-foreground">=</span>
        </>
      )}
      <span className="font-mono font-medium text-foreground bg-muted/60 px-2 py-0.5 rounded-md">
        {String(value)}
      </span>
    </div>
  )
}

function DownloadLinkRenderer({ result }: { result: Record<string, unknown> }) {
  return (
    <div className="mt-1.5 ml-7">
      <a
        href={result.downloadUrl as string}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
      >
        <Download className="h-3 w-3" />
        Download file
        {typeof result.expiresIn === "string" && (
          <span className="text-muted-foreground">(expires in {result.expiresIn})</span>
        )}
      </a>
    </div>
  )
}

function StatusMessageRenderer({ result }: { result: Record<string, unknown> }) {
  const success = result.success as boolean
  return (
    <div className="mt-1.5 ml-7 flex items-center gap-1.5 text-xs">
      {success ? (
        <CheckCircle className="h-3 w-3 text-chart-2 shrink-0" />
      ) : (
        <XCircle className="h-3 w-3 text-destructive shrink-0" />
      )}
      <span className={success ? "text-muted-foreground" : "text-destructive"}>
        {result.message as string}
      </span>
    </div>
  )
}

function EntityTagsRenderer({ result }: { result: Record<string, unknown> }) {
  const entities = result.entities as Array<{ text: string; type: string; confidence?: number }>
  const entityCount = typeof result.entityCount === "number" ? result.entityCount : entities.length
  return (
    <div className="mt-1.5 ml-7 space-y-1.5">
      <span className="text-[11px] text-muted-foreground">{entityCount} entities found</span>
      <div className="flex flex-wrap gap-1.5">
        {entities.slice(0, 20).map((e, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 border border-border/40 text-[11px]"
          >
            <span className="font-medium text-foreground">{e.text}</span>
            <span className="text-muted-foreground/70 text-[10px]">{e.type}</span>
          </span>
        ))}
        {entities.length > 20 && (
          <span className="text-[11px] text-muted-foreground self-center">
            +{entities.length - 20} more
          </span>
        )}
      </div>
    </div>
  )
}

function RecordListRenderer({ result }: { result: Record<string, unknown> }) {
  const arrayField = findArrayField(result)
  if (!arrayField) return null
  const { key, items } = arrayField
  const { primary, secondary } = selectDisplayColumns(items)
  if (!primary) return null

  return (
    <div className="mt-1.5 ml-7 space-y-1">
      <span className="text-[11px] text-muted-foreground">
        {formatKeyName(key)} ({items.length})
      </span>
      <div className="space-y-1">
        {items.slice(0, 5).map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border/30 text-[11px]"
          >
            <span className="font-medium text-foreground truncate flex-1">
              {formatValue(item[primary], 80)}
            </span>
            {secondary && item[secondary] != null && (
              <span className="text-muted-foreground shrink-0 px-1.5 py-0.5 rounded bg-muted/60 text-[10px]">
                {String(item[secondary])}
              </span>
            )}
          </div>
        ))}
        {items.length > 5 && (
          <span className="text-[11px] text-muted-foreground pl-2.5">
            +{items.length - 5} more
          </span>
        )}
      </div>
    </div>
  )
}

function KeyValueRenderer({ result }: { result: Record<string, unknown> }) {
  const entries = Object.entries(result).filter(([, v]) => v != null && v !== undefined)
  if (entries.length === 0) return null
  return (
    <div className="mt-1.5 ml-7 space-y-0.5">
      {entries.slice(0, 8).map(([key, value]) => (
        <div key={key} className="flex items-baseline gap-2 text-[11px]">
          <span className="text-muted-foreground shrink-0">{formatKeyName(key)}:</span>
          <span className="font-medium text-foreground truncate">{formatValue(value)}</span>
        </div>
      ))}
      {entries.length > 8 && (
        <span className="text-[11px] text-muted-foreground">+{entries.length - 8} more fields</span>
      )}
    </div>
  )
}

function SmartInputDisplay({ args }: { args: Record<string, unknown> }) {
  const entries = Object.entries(args).filter(([, v]) => v != null)
  if (entries.length === 0) return null
  return (
    <div className="ml-7 space-y-0.5 mb-2">
      <span className="text-[11px] font-medium text-muted-foreground">Input</span>
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-baseline gap-2 text-[11px]">
          <span className="text-muted-foreground shrink-0">{formatKeyName(key)}:</span>
          <span className="text-foreground truncate">{formatValue(value)}</span>
        </div>
      ))}
    </div>
  )
}

function PatternRenderer({ result }: { result: unknown }) {
  if (result == null) return null

  if (typeof result !== "object") {
    return (
      <div className="mt-1.5 ml-7 text-xs">
        <span className="font-mono font-medium text-foreground bg-muted/60 px-2 py-0.5 rounded-md">
          {String(result)}
        </span>
      </div>
    )
  }

  const obj = result as Record<string, unknown>
  const pattern = detectPattern(result)

  switch (pattern) {
    case "scalar":
      return <ScalarResultRenderer result={obj} />
    case "download":
      return <DownloadLinkRenderer result={obj} />
    case "status":
      return <StatusMessageRenderer result={obj} />
    case "entities":
      return <EntityTagsRenderer result={obj} />
    case "recordList":
      return <RecordListRenderer result={obj} />
    case "keyValue":
      return <KeyValueRenderer result={obj} />
    default:
      return null
  }
}

// ── Generic tool indicator (unified smart UI) ──
function GenericToolIndicator({
  toolName,
  state,
  args,
  result,
  errorText,
}: ToolCallIndicatorProps) {
  const [expanded, setExpanded] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  const isRunning =
    state === "input-streaming" ||
    state === "input-available" ||
    state === "execution-started"
  const isDone = state === "done"
  const isError = state === "error"

  const displayName =
    TOOL_DISPLAY_NAMES[toolName] || toolName.replace(/_/g, " ")
  const ToolIcon = TOOL_ICONS[toolName] || Wrench
  const inputSummary = args ? getInputSummary(args) : null

  return (
    <motion.div
      className="my-1.5"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 text-xs py-1 transition-all w-full text-left",
          isError && "text-destructive"
        )}
      >
        {/* Status icon */}
        {isRunning ? (
          <div className="flex items-center justify-center h-5 w-5 rounded-lg bg-primary/10 shrink-0">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-5 w-5 rounded-lg bg-destructive/10 shrink-0">
            <XCircle className="h-3 w-3 text-destructive" />
          </div>
        ) : (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring" as const, stiffness: 400, damping: 15 }}
            className="flex items-center justify-center h-5 w-5 rounded-lg bg-chart-2/10 shrink-0"
          >
            <CheckCircle className="h-3 w-3 text-chart-2" />
          </motion.div>
        )}

        {/* Tool name + input summary */}
        <ToolIcon className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="flex-1 text-muted-foreground min-w-0 flex items-center gap-1.5">
          {isRunning ? (
            <>
              {displayName}
              <motion.span
                className="inline-block"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                ...
              </motion.span>
            </>
          ) : (
            <>
              <span>
                <span className="font-medium text-foreground">{displayName.split(" ")[0]}</span>{" "}
                {displayName.split(" ").slice(1).join(" ")}
              </span>
              {inputSummary && (
                <span className="text-foreground/70 truncate max-w-[200px]" title={inputSummary}>
                  &ldquo;{inputSummary.length > 40 ? inputSummary.slice(0, 40) + "..." : inputSummary}&rdquo;
                </span>
              )}
            </>
          )}
        </span>

        {/* Expand toggle */}
        {!isRunning && (args || result || errorText) && (
          <ChevronDown
            className={cn(
              "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
              !expanded && "-rotate-90"
            )}
          />
        )}
      </button>

      {/* Expandable details */}
      <AnimatePresence>
        {expanded && !isRunning && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 ml-5 pl-3 border-l-2 border-border/50 text-xs space-y-2">
              {/* Error */}
              {isError && errorText && (
                <div className="ml-7 mt-1 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/15 text-[11px] text-destructive">
                  {errorText}
                </div>
              )}

              {/* Smart input */}
              {!showRaw && args != null && Object.keys(args).length > 0 && (
                <SmartInputDisplay args={args} />
              )}

              {/* Smart output */}
              {result != null && !showRaw && <PatternRenderer result={result} />}

              {/* Raw JSON toggle */}
              {(args != null || result != null) && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowRaw(!showRaw)
                    }}
                    className="ml-7 flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  >
                    <Braces className="h-2.5 w-2.5" />
                    {showRaw ? "Hide raw" : "View raw"}
                  </button>
                  {showRaw && (
                    <pre className="ml-7 p-2 rounded-lg bg-muted/50 overflow-x-auto max-h-[200px] text-[11px]">
                      {JSON.stringify({ input: args, output: result }, null, 2)}
                    </pre>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Main export: routes to specialized or generic indicator ──
export function ToolCallIndicator(props: ToolCallIndicatorProps) {
  if (props.toolName === "web_search") {
    return <WebSearchIndicator {...props} />
  }
  if (props.toolName === "code_interpreter") {
    return <CodeInterpreterIndicator {...props} />
  }
  return <GenericToolIndicator {...props} />
}
