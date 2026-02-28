"use client"

import { useMemo, useState, useEffect, useRef, useCallback } from "react"
import { useSession } from "next-auth/react"
import { AnimatePresence, motion } from "framer-motion"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import {
  Bot,
  BookOpen,
  Workflow,
  Pencil,
  MessageSquare,
  ArrowRight,
  Sparkles,
  Send,
  Loader2,
  Square,
} from "@/lib/icons"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ChatInputToolbar, type AssistantToolInfo, type AssistantSkillInfo, type CanvasMode, type ToolMode, type SkillMode } from "./chat-input-toolbar"
import { FilePreview } from "./file-preview"

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionItem {
  id: string
  title: string
  assistantId: string
  createdAt: Date
}

interface AgentItem {
  id: string
  name: string
  description: string
  emoji: string
  tags?: string[]
  useKnowledgeBase?: boolean
  knowledgeBaseGroupIds?: string[]
}

/** Settings collected from the toolbar to pass along with the initial message */
export interface InitialChatSettings {
  files?: File[]
  webSearchEnabled?: boolean
  codeInterpreterEnabled?: boolean
  knowledgeBaseGroupIds?: string[]
  toolMode?: ToolMode
  selectedToolNames?: string[]
  skillMode?: SkillMode
  selectedSkillIds?: string[]
  canvasMode?: CanvasMode
}

export interface ChatHomeProps {
  sessions: SessionItem[]
  assistants: AgentItem[]
  getAssistantById: (id: string) => { emoji: string; name: string } | undefined
  onSelectSession: (id: string) => void
  onCreateSession: (assistantId: string, initialMessage?: string, settings?: InitialChatSettings) => void
}

// ─── Rotating phrases ────────────────────────────────────────────────────────

function getGreeting(name: string): string {
  const h = new Date().getHours()
  if (h < 12) return `Good morning${name ? `, ${name}` : ""}`
  if (h < 18) return `Good afternoon${name ? `, ${name}` : ""}`
  return `Good evening${name ? `, ${name}` : ""}`
}

const ROTATING_PHRASES = [
  "Let's finish your task",
  "Explore the future of AI",
  "What would you like to create?",
  "Ready when you are",
]

// ─── Animation variants ──────────────────────────────────────────────────────

const stagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.15 },
  },
}

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 24 },
  },
}

const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 26 },
  },
}

// ─── Quick action config ─────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: "Create Agent", icon: Bot, href: "/dashboard/agent-builder" },
  { label: "Knowledge", icon: BookOpen, href: "/dashboard/knowledge" },
  { label: "Workflows", icon: Workflow, href: "/dashboard/workflows" },
] as const

// ─── Animated greeting hook ──────────────────────────────────────────────────

function useRotatingText(greeting: string, phrases: string[]) {
  const [phase, setPhase] = useState<"greeting" | "rotating">("greeting")
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [displayText, setDisplayText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    // Phase 1: Type the greeting
    if (phase === "greeting") {
      if (displayText.length < greeting.length) {
        const timer = setTimeout(() => {
          setDisplayText(greeting.slice(0, displayText.length + 1))
        }, 40)
        return () => clearTimeout(timer)
      }
      // Pause then start rotating
      const timer = setTimeout(() => {
        setIsDeleting(true)
        setPhase("rotating")
      }, 2500)
      return () => clearTimeout(timer)
    }

    // Phase 2: Rotate through phrases
    const currentPhrase = phrases[phraseIndex]

    if (isDeleting) {
      if (displayText.length > 0) {
        const timer = setTimeout(() => {
          setDisplayText(displayText.slice(0, -1))
        }, 20)
        return () => clearTimeout(timer)
      }
      // Done deleting, start typing next phrase
      setIsDeleting(false)
      return
    }

    // Typing
    if (displayText.length < currentPhrase.length) {
      const timer = setTimeout(() => {
        setDisplayText(currentPhrase.slice(0, displayText.length + 1))
      }, 45)
      return () => clearTimeout(timer)
    }

    // Pause then delete
    const timer = setTimeout(() => {
      setIsDeleting(true)
      setPhraseIndex((prev) => (prev + 1) % phrases.length)
    }, 3000)
    return () => clearTimeout(timer)
  }, [phase, displayText, isDeleting, greeting, phrases, phraseIndex])

  return displayText
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ChatHome({
  sessions,
  assistants,
  getAssistantById,
  onSelectSession,
  onCreateSession,
}: ChatHomeProps) {
  const { data: authSession } = useSession()
  const firstName = authSession?.user?.name?.split(" ")[0] ?? ""
  const greeting = getGreeting(firstName)

  const animatedText = useRotatingText(greeting, ROTATING_PHRASES)

  // The default assistant (first one) used for the home chat
  const defaultAssistant = assistants[0]

  // Input state
  const [input, setInput] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // File attachment state
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])

  // Toolbar state
  const [webSearchOverride, setWebSearchOverride] = useState<boolean | null>(null)
  const [codeInterpreterOverride, setCodeInterpreterOverride] = useState<boolean | null>(null)
  const [selectedKBGroupIds, setSelectedKBGroupIds] = useState<string[] | null>(null)
  const [toolMode, setToolMode] = useState<ToolMode>("auto")
  const [selectedToolNames, setSelectedToolNames] = useState<string[]>([])
  const [skillMode, setSkillMode] = useState<SkillMode>("auto")
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([])
  const [canvasMode, setCanvasMode] = useState<CanvasMode>(false)

  // Assistant tools/skills/KB fetched for toolbar
  const [assistantTools, setAssistantTools] = useState<AssistantToolInfo[]>([])
  const [assistantSkills, setAssistantSkills] = useState<AssistantSkillInfo[]>([])
  const [kbGroups, setKBGroups] = useState<{ id: string; name: string; color: string | null; documentCount: number }[]>([])

  // Fetch assistant tools & skills for toolbar display
  useEffect(() => {
    if (!defaultAssistant?.id || defaultAssistant.id === "general") {
      setAssistantTools([])
      setAssistantSkills([])
      return
    }
    fetch(`/api/assistants/${defaultAssistant.id}/tools`)
      .then((res) => res.json())
      .then((tools) => {
        if (Array.isArray(tools)) {
          setAssistantTools(
            tools
              .filter((t: { enabledForAssistant?: boolean }) => t.enabledForAssistant !== false)
              .map((t: { name: string; displayName: string; description: string; category: string; icon?: string | null }) => ({
                name: t.name,
                displayName: t.displayName,
                description: t.description,
                category: t.category,
                icon: t.icon,
              }))
          )
        }
      })
      .catch(() => setAssistantTools([]))
    fetch(`/api/assistants/${defaultAssistant.id}/skills`)
      .then((res) => res.json())
      .then((skills) => setAssistantSkills(Array.isArray(skills) ? skills : []))
      .catch(() => setAssistantSkills([]))
  }, [defaultAssistant?.id])

  // Fetch knowledge base groups
  useEffect(() => {
    fetch("/api/dashboard/knowledge/groups")
      .then((res) => res.json())
      .then((data) => setKBGroups(data.groups || []))
      .catch(() => setKBGroups([]))
  }, [])

  // Derived toolbar values
  const webSearchAvailable = assistantTools.some((t) => t.name === "web_search")
  const effectiveWebSearch = webSearchOverride ?? webSearchAvailable
  const codeInterpreterAvailable = assistantTools.some((t) => t.name === "code_interpreter")
  const effectiveCodeInterpreter = codeInterpreterOverride ?? codeInterpreterAvailable
  const effectiveKBGroupIds = selectedKBGroupIds ?? (defaultAssistant?.knowledgeBaseGroupIds || [])

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [])

  useEffect(() => {
    adjustTextareaHeight()
  }, [input, adjustTextareaHeight])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const message = input.trim()
      if (!message || !defaultAssistant) return

      // Collect toolbar settings
      const settings: InitialChatSettings = {
        files: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
        webSearchEnabled: effectiveWebSearch,
        codeInterpreterEnabled: effectiveCodeInterpreter,
        knowledgeBaseGroupIds: selectedKBGroupIds !== null ? selectedKBGroupIds : undefined,
        toolMode,
        selectedToolNames: toolMode === "select" ? selectedToolNames : undefined,
        skillMode,
        selectedSkillIds: skillMode === "select" ? selectedSkillIds : undefined,
        canvasMode: canvasMode || undefined,
      }

      setInput("")
      setAttachedFiles([])
      onCreateSession(defaultAssistant.id, message, settings)
    },
    [input, defaultAssistant, attachedFiles, effectiveWebSearch, effectiveCodeInterpreter, selectedKBGroupIds, toolMode, selectedToolNames, skillMode, selectedSkillIds, canvasMode, onCreateSession],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault()
        handleSubmit(e)
      }
    },
    [handleSubmit],
  )

  const recentSessions = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 6),
    [sessions],
  )

  const topAgents = useMemo(() => assistants.slice(0, 6), [assistants])

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex-1 flex flex-col items-center w-full max-w-3xl mx-auto px-5 pt-28 pb-24">

        {/* ── Animated greeting ────────────────────────────────────── */}
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight min-h-[2.5rem] sm:min-h-[3rem]">
            {animatedText}
            <span className="inline-block w-[2px] h-[1em] bg-foreground/60 ml-0.5 align-middle animate-pulse" />
          </h1>
        </motion.div>

        {/* ── Chat input ──────────────────────────────────────────── */}
        <motion.div
          className="w-full mb-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <form onSubmit={handleSubmit}>
            {/* File preview */}
            <AnimatePresence>
              {attachedFiles.length > 0 && (
                <div className="mb-2">
                  <FilePreview
                    files={attachedFiles}
                    onRemove={(index) => setAttachedFiles(prev => prev.filter((_, i) => i !== index))}
                  />
                </div>
              )}
            </AnimatePresence>

            <div className="rounded-2xl border border-border/60 bg-muted/30 shadow-sm transition-all focus-within:border-foreground/20 focus-within:shadow-md focus-within:bg-muted/40">
              <div className="relative">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask, create, or start a task. Press Ctrl Enter to insert a line break..."
                  className="min-h-[52px] max-h-[200px] pr-12 resize-none !border-none !shadow-none bg-transparent dark:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 rounded-2xl rounded-b-none"
                  rows={1}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="absolute right-3 bottom-2 rounded-full h-8 w-8 shadow-sm"
                  disabled={!input.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              {/* Toolbar */}
              <div className="px-2 pb-2">
                <ChatInputToolbar
                  onFileSelect={(files) => setAttachedFiles(prev => [...prev, ...files])}
                  fileAttached={attachedFiles.length > 0}
                  webSearchEnabled={effectiveWebSearch}
                  onToggleWebSearch={() => setWebSearchOverride((prev) => !(prev ?? webSearchAvailable))}
                  codeInterpreterEnabled={effectiveCodeInterpreter}
                  onToggleCodeInterpreter={() => setCodeInterpreterOverride((prev) => !(prev ?? codeInterpreterAvailable))}
                  knowledgeBaseGroupIds={effectiveKBGroupIds}
                  onKBGroupsChange={setSelectedKBGroupIds}
                  kbGroups={kbGroups}
                  toolMode={toolMode}
                  onSetToolMode={setToolMode}
                  selectedToolNames={selectedToolNames}
                  onSetSelectedToolNames={setSelectedToolNames}
                  assistantTools={assistantTools}
                  skillMode={skillMode}
                  onSetSkillMode={setSkillMode}
                  selectedSkillIds={selectedSkillIds}
                  onSetSelectedSkillIds={setSelectedSkillIds}
                  assistantSkills={assistantSkills}
                  onImportGithub={() => {
                    // GitHub import not supported from home - will work in ChatWorkspace
                  }}
                  canvasMode={canvasMode}
                  onSetCanvasMode={setCanvasMode}
                  artifacts={new Map()}
                  activeArtifactId={null}
                  onOpenArtifact={() => {}}
                  onCloseArtifact={() => {}}
                  disabled={false}
                />
              </div>
            </div>
          </form>

          {/* Keyboard hints */}
          <div className="flex items-center justify-center gap-1.5 mt-2.5 text-[11px] text-muted-foreground/40">
            <kbd className="px-1.5 py-0.5 rounded bg-muted/40 font-mono text-[10px]">Enter</kbd>
            <span>to send</span>
            <span className="mx-0.5">·</span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted/40 font-mono text-[10px]">Shift+Enter</kbd>
            <span>new line</span>
            <span className="mx-0.5">·</span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted/40 font-mono text-[10px]">⌘K</kbd>
            <span>commands</span>
          </div>
        </motion.div>

        {/* ── Quick actions ─────────────────────────────────────────── */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-2 mb-10 mt-6"
          variants={stagger}
          initial="hidden"
          animate="show"
        >
          {QUICK_ACTIONS.map((action) => (
            <motion.div key={action.label} variants={scaleIn}>
              <Link
                href={action.href}
                className="group inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-4 py-2 text-sm font-medium text-foreground/80 transition-all hover:border-primary/40 hover:bg-muted/50 hover:text-foreground"
              >
                <action.icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                {action.label}
              </Link>
            </motion.div>
          ))}

          {assistants[0] && (
            <motion.div variants={scaleIn}>
              <button
                type="button"
                onClick={() => onCreateSession(assistants[0].id)}
                className="group inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-4 py-2 text-sm font-medium text-foreground/80 transition-all hover:border-primary/40 hover:bg-muted/50 hover:text-foreground cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                Write
              </button>
            </motion.div>
          )}
        </motion.div>

        {/* ── Sections ──────────────────────────────────────────────── */}
        <div className="w-full space-y-10">
          {/* Recent Conversations */}
          <Section title="Recent Conversations" delay={0.3}>
            {recentSessions.length === 0 ? (
              <EmptyHint icon={MessageSquare} text="No conversations yet" />
            ) : (
              <ScrollRow>
                {recentSessions.map((s) => {
                  const agent = getAssistantById(s.assistantId)
                  return (
                    <motion.button
                      key={s.id}
                      type="button"
                      variants={scaleIn}
                      onClick={() => onSelectSession(s.id)}
                      className="group snap-start shrink-0 w-[220px] rounded-xl border border-border/50 bg-card/60 p-4 text-left transition-all hover:border-primary/30 hover:bg-muted/40 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 mb-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 text-base shrink-0">
                          {agent?.emoji || "💬"}
                        </span>
                        <span className="text-[11px] text-muted-foreground/60 font-medium">
                          {formatDistanceToNow(s.createdAt, { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate text-foreground/90 group-hover:text-foreground transition-colors">
                        {s.title}
                      </p>
                      {agent && (
                        <p className="text-xs text-muted-foreground/50 mt-1 truncate">
                          {agent.name}
                        </p>
                      )}
                    </motion.button>
                  )
                })}
              </ScrollRow>
            )}
          </Section>

          {/* Your Agents */}
          <Section title="Your Agents" delay={0.4}>
            {topAgents.length === 0 ? (
              <EmptyHint
                icon={Sparkles}
                text="Create your first agent"
                href="/dashboard/agent-builder"
              />
            ) : (
              <ScrollRow>
                {topAgents.map((agent) => (
                  <motion.button
                    key={agent.id}
                    type="button"
                    variants={scaleIn}
                    onClick={() => onCreateSession(agent.id)}
                    className="group snap-start shrink-0 w-[220px] rounded-xl border border-border/50 bg-card/60 p-4 text-left transition-all hover:border-primary/30 hover:bg-muted/40 cursor-pointer"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-600/10 border border-violet-500/15 text-xl mb-3">
                      {agent.emoji}
                    </span>
                    <p className="text-sm font-medium truncate text-foreground/90 group-hover:text-foreground transition-colors">
                      {agent.name}
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1 line-clamp-2 leading-relaxed">
                      {agent.description || "No description"}
                    </p>
                    {agent.tags && agent.tags.length > 0 && (
                      <div className="flex gap-1 mt-2.5 overflow-hidden">
                        {agent.tags.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="inline-block rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground/60 font-medium"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </motion.button>
                ))}
              </ScrollRow>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({
  title,
  delay = 0,
  children,
}: {
  title: string
  delay?: number
  children: React.ReactNode
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <h2 className="text-xs font-medium tracking-widest uppercase text-muted-foreground/60 mb-4">
        {title}
      </h2>
      {children}
    </motion.section>
  )
}

function ScrollRow({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="flex overflow-x-auto gap-3 pb-2 snap-x snap-mandatory scrollbar-none"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  )
}

function EmptyHint({
  icon: Icon,
  text,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>
  text: string
  href?: string
}) {
  const inner = (
    <div className={cn(
      "flex items-center gap-2 rounded-lg border border-dashed border-border/40 px-5 py-4",
      href && "hover:border-primary/30 hover:bg-muted/30 transition-colors cursor-pointer",
    )}>
      <Icon className="h-4 w-4 text-muted-foreground/40" />
      <span className="text-sm text-muted-foreground/50">{text}</span>
      {href && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 ml-auto" />}
    </div>
  )

  return href ? <Link href={href}>{inner}</Link> : inner
}
