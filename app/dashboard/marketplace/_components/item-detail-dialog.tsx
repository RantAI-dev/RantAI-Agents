"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
  Wrench,
  Sparkles,
  Loader2,
  Download,
  Check,
  Zap,
  ChevronDown,
  ChevronRight,
  User,
  Tag,
  Box,
  FileText,
  Settings,
  Plus,
} from "@/lib/icons"
import { DynamicIcon } from "@/components/ui/dynamic-icon"
import type {
  MarketplaceItemDetail,
  ToolSchemaInfo,
} from "@/hooks/use-marketplace"
import { ConfigFormDialog } from "./config-form-dialog"

interface ItemDetailDialogProps {
  item: MarketplaceItemDetail | null
  loading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onInstall: (id: string, config?: Record<string, unknown>) => Promise<unknown>
  onUninstall: (id: string) => Promise<void>
  onUseTemplate?: (id: string) => Promise<void>
}

export function ItemDetailDialog({
  item,
  loading,
  open,
  onOpenChange,
  onInstall,
  onUninstall,
  onUseTemplate,
}: ItemDetailDialogProps) {
  const [actionLoading, setActionLoading] = useState(false)
  const [justInstalled, setJustInstalled] = useState(false)
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)

  if (!open) return null

  const isSkill = item?.type === "skill"
  const isTemplateType = item?.type === "workflow" || item?.type === "assistant"
  const isCommunity = !!(item?.communitySkillName || item?.communityToolName)

  const doInstall = async (config?: Record<string, unknown>) => {
    if (!item) return
    setActionLoading(true)
    try {
      await onInstall(item.id, config)
      setJustInstalled(true)
      setTimeout(() => setJustInstalled(false), 2000)
    } catch (err) {
      console.error("Install failed:", err)
    } finally {
      setActionLoading(false)
    }
  }

  const handleAction = async () => {
    if (!item) return
    if (isTemplateType && onUseTemplate) {
      setActionLoading(true)
      try {
        await onUseTemplate(item.id)
        onOpenChange(false)
      } finally {
        setActionLoading(false)
      }
    } else if (item.installed) {
      setActionLoading(true)
      try {
        await onUninstall(item.id)
        setJustInstalled(false)
      } finally {
        setActionLoading(false)
      }
    } else if (item.configSchema) {
      setConfigOpen(true)
    } else {
      await doInstall()
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
          {loading || !item ? (
            <div className="flex items-center justify-center py-20">
              <VisuallyHidden>
                <DialogTitle>Loading...</DialogTitle>
              </VisuallyHidden>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Header */}
              <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40 shrink-0">
                <div className="flex items-start gap-3.5">
                  <div
                    className={cn(
                      "h-11 w-11 rounded-xl flex items-center justify-center shrink-0",
                      isSkill
                        ? "bg-violet-100 dark:bg-violet-500/15"
                        : "bg-sky-100 dark:bg-sky-500/15"
                    )}
                  >
                    <DynamicIcon
                      icon={item.icon}
                      serviceName={item.displayName}
                      fallback={isSkill ? Sparkles : Wrench}
                      className={cn(
                        "h-5 w-5",
                        isSkill
                          ? "text-violet-600 dark:text-violet-400"
                          : "text-sky-600 dark:text-sky-400"
                      )}
                      emojiClassName="text-xl"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <DialogTitle className="text-base font-semibold leading-tight">
                      {item.displayName}
                    </DialogTitle>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none",
                          isSkill
                            ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                            : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
                        )}
                      >
                        {item.type}
                      </span>
                      {isCommunity && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                          Community
                        </span>
                      )}
                      {item.version && (
                        <span className="text-[10px] text-muted-foreground/70 font-medium">
                          v{item.version}
                        </span>
                      )}
                      {item.author && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
                          <User className="h-2.5 w-2.5" />
                          {item.author}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </DialogHeader>

              {/* Scrollable content */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 py-4 space-y-5">
                  {/* Description */}
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>

                  {/* Tags */}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Tag className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/60 text-[10px] text-muted-foreground font-medium"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Included Tools (for skills) */}
                  {isSkill && item.tools && item.tools.length > 0 && (
                    <DetailSection
                      icon={Box}
                      title={`Included Tools (${item.tools.length})`}
                    >
                      <div className="space-y-2">
                        {item.tools.map((tool) => (
                          <ToolRow key={tool.name} tool={tool} />
                        ))}
                      </div>
                    </DetailSection>
                  )}

                  {/* Shared Tools (for skills) */}
                  {isSkill &&
                    item.sharedToolNames &&
                    item.sharedToolNames.length > 0 && (
                      <DetailSection
                        icon={Wrench}
                        title={`Shared Tools (${item.sharedToolNames.length})`}
                      >
                        <div className="space-y-1">
                          {item.sharedToolNames.map((name) => (
                            <div
                              key={name}
                              className="flex items-center gap-2 text-xs text-muted-foreground py-1"
                            >
                              <div className="h-1.5 w-1.5 rounded-full bg-sky-400/70 shrink-0" />
                              <span className="font-mono text-[11px]">
                                {name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </DetailSection>
                    )}

                  {/* Skill Prompt (collapsible) */}
                  {isSkill && item.skillPrompt && (
                    <div>
                      <button
                        onClick={() => setPromptExpanded(!promptExpanded)}
                        className="flex items-center gap-2 text-xs font-semibold text-foreground/80 hover:text-foreground transition-colors w-full cursor-pointer"
                      >
                        <FileText className="h-3.5 w-3.5 text-muted-foreground/60" />
                        Skill Prompt
                        {promptExpanded ? (
                          <ChevronDown className="h-3 w-3 ml-auto text-muted-foreground/50" />
                        ) : (
                          <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground/50" />
                        )}
                      </button>
                      {promptExpanded && (
                        <div className="mt-2 rounded-lg bg-muted/40 border border-border/40 p-3 max-h-[250px] overflow-auto">
                          <pre className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono">
                            {item.skillPrompt}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tool Parameters (for standalone tools) */}
                  {!isSkill && item.toolParameters && (
                    <DetailSection icon={Settings} title="Parameters">
                      <ParametersTable
                        parameters={item.toolParameters as JsonSchemaObject}
                      />
                    </DetailSection>
                  )}

                  {/* Config Schema summary (for skills with config) */}
                  {item.configSchema && (
                    <DetailSection icon={Settings} title="Configuration">
                      <ParametersTable
                        parameters={item.configSchema as JsonSchemaObject}
                        label="Setting"
                      />
                    </DetailSection>
                  )}
                </div>
              </ScrollArea>

              {/* Footer */}
              <DialogFooter className="px-6 py-3 border-t border-border/40 shrink-0">
                <div className="flex items-center justify-between w-full">
                  <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                    {item.category}
                  </span>
                  <Button
                    variant={!isTemplateType && item.installed ? "ghost" : "default"}
                    size="sm"
                    className={cn(
                      "h-8 text-xs gap-1.5",
                      !isTemplateType && item.installed &&
                        "text-emerald-600 dark:text-emerald-400 hover:text-red-600 dark:hover:text-red-400"
                    )}
                    onClick={handleAction}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isTemplateType ? (
                      <>
                        <Plus className="h-3.5 w-3.5" />
                        Use Template
                      </>
                    ) : justInstalled ? (
                      <span className="flex items-center gap-1">
                        <Zap className="h-3.5 w-3.5" />
                        Added!
                      </span>
                    ) : item.installed ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Installed
                      </>
                    ) : (
                      <>
                        <Download className="h-3.5 w-3.5" />
                        Install
                      </>
                    )}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {item?.configSchema && (
        <ConfigFormDialog
          open={configOpen}
          onOpenChange={setConfigOpen}
          item={item}
          onSubmit={doInstall}
        />
      )}
    </>
  )
}

// ─── Sub-components ──────────────────────────────────────────

function DetailSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="text-xs font-semibold text-foreground/80">
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}

function ToolRow({ tool }: { tool: ToolSchemaInfo }) {
  const paramSchema = tool.parameters as JsonSchemaObject | undefined
  const paramCount = paramSchema?.properties
    ? Object.keys(paramSchema.properties).length
    : 0

  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-md bg-sky-100 dark:bg-sky-500/15 flex items-center justify-center shrink-0">
          <Wrench className="h-3 w-3 text-sky-600 dark:text-sky-400" />
        </div>
        <span className="text-xs font-semibold truncate">
          {tool.displayName}
        </span>
        {paramCount > 0 && (
          <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
            {paramCount} param{paramCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">
        {tool.description}
      </p>
    </div>
  )
}

interface JsonSchemaProperty {
  type?: string
  description?: string
  default?: unknown
  enum?: string[]
}

interface JsonSchemaObject {
  type?: string
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
}

function ParametersTable({
  parameters,
  label = "Parameter",
}: {
  parameters: JsonSchemaObject
  label?: string
}) {
  if (!parameters?.properties) {
    return (
      <p className="text-[11px] text-muted-foreground/60 italic">
        No parameters defined
      </p>
    )
  }

  const props = Object.entries(parameters.properties)
  const required = new Set(parameters.required ?? [])

  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-muted/30 border-b border-border/30">
            <th className="text-left px-2.5 py-1.5 font-semibold text-muted-foreground/70">
              {label}
            </th>
            <th className="text-left px-2.5 py-1.5 font-semibold text-muted-foreground/70">
              Type
            </th>
            <th className="text-left px-2.5 py-1.5 font-semibold text-muted-foreground/70">
              Description
            </th>
          </tr>
        </thead>
        <tbody>
          {props.map(([name, prop]) => (
            <tr
              key={name}
              className="border-b border-border/20 last:border-0"
            >
              <td className="px-2.5 py-1.5 font-mono text-foreground/80">
                {name}
                {required.has(name) && (
                  <span className="text-red-500 ml-0.5">*</span>
                )}
              </td>
              <td className="px-2.5 py-1.5 text-muted-foreground/70">
                {prop.enum
                  ? `enum(${prop.enum.length})`
                  : prop.type || "string"}
              </td>
              <td className="px-2.5 py-1.5 text-muted-foreground/70 max-w-[200px] truncate">
                {prop.description ||
                  (prop.default !== undefined
                    ? `Default: ${String(prop.default)}`
                    : "—")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
