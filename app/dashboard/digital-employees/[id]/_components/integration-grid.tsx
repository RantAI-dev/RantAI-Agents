"use client"

import { useState } from "react"
import { Plug, Check, X, Loader2, AlertCircle, Eye } from "@/lib/icons"
import { DynamicIcon } from "@/components/ui/dynamic-icon"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useEmployeeIntegrations, type EmployeeIntegrationItem } from "@/hooks/use-employee-integrations"
import { IntegrationSetupWizard } from "./integration-setup-wizard"
import { toast } from "sonner"
import { CATEGORY_LABELS } from "@/lib/digital-employee/integrations"

interface IntegrationGridProps {
  employeeId: string
  onOpenChat?: (message: string) => void
}

const STATUS_STYLES: Record<string, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  connected: { label: "Connected", className: "bg-emerald-500/10 text-emerald-500", icon: Check },
  disconnected: { label: "Not connected", className: "bg-muted text-muted-foreground", icon: Plug },
  error: { label: "Error", className: "bg-red-500/10 text-red-500", icon: AlertCircle },
  expired: { label: "Expired", className: "bg-amber-500/10 text-amber-500", icon: AlertCircle },
}

export function IntegrationGrid({ employeeId, onOpenChat }: IntegrationGridProps) {
  const { integrations, isLoading, connectIntegration, disconnectIntegration, testIntegration } = useEmployeeIntegrations(employeeId)
  const [selectedIntegration, setSelectedIntegration] = useState<EmployeeIntegrationItem | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [revealedCreds, setRevealedCreds] = useState<Set<string>>(new Set())

  const handleTest = async (integrationId: string) => {
    setTestingId(integrationId)
    try {
      const result = await testIntegration(integrationId)
      if (result.success) toast.success("Connection test passed")
      else toast.error(result.error || "Connection test failed")
    } catch {
      toast.error("Test failed")
    } finally {
      setTestingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Group by category
  const grouped: Record<string, EmployeeIntegrationItem[]> = {}
  for (const item of integrations) {
    if (!grouped[item.category]) grouped[item.category] = []
    grouped[item.category].push(item)
  }

  return (
    <div className="px-5 space-y-4">
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {CATEGORY_LABELS[category] || category}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {items.map((item) => {
              const statusStyle = STATUS_STYLES[item.status] || STATUS_STYLES.disconnected
              const StatusIcon = statusStyle.icon
              const isTesting = testingId === item.id

              return (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-lg border bg-card p-3 flex items-start gap-3 transition-colors",
                    item.status === "disconnected" && "cursor-pointer hover:bg-accent/50"
                  )}
                  onClick={item.status === "disconnected" ? () => setSelectedIntegration(item) : undefined}
                >
                  <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <DynamicIcon
                      icon={item.icon}
                      fallback={Plug}
                      className="h-5 w-5"
                      emojiClassName="text-lg leading-none"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h5 className="text-sm font-medium truncate">{item.name}</h5>
                      <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", statusStyle.className)}>
                        <StatusIcon className="h-3 w-3 mr-0.5" />
                        {statusStyle.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
                    {/* Masked credential display for connected integrations */}
                    {item.status === "connected" && item.fields.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {item.fields.slice(0, 2).map((field) => (
                          <div key={field.key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span className="w-16 truncate">{field.label}:</span>
                            <span className="font-mono">
                              {revealedCreds.has(`${item.id}:${field.key}`)
                                ? (item.metadata?.[field.key] as string || "••••••••")
                                : "••••••••"}
                            </span>
                            <button
                              className="ml-0.5 hover:text-foreground transition-colors"
                              onClick={() => setRevealedCreds((prev) => {
                                const next = new Set(prev)
                                const key = `${item.id}:${field.key}`
                                if (next.has(key)) next.delete(key)
                                else next.add(key)
                                return next
                              })}
                            >
                              <Eye className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {item.status !== "disconnected" && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs px-2"
                          onClick={() => handleTest(item.id)}
                          disabled={isTesting}
                        >
                          {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs px-2 text-muted-foreground"
                          onClick={() => setSelectedIntegration(item)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={async () => {
                            try {
                              await disconnectIntegration(item.id)
                              toast.success("Disconnected")
                            } catch {
                              toast.error("Failed to disconnect")
                            }
                          }}
                        >
                          Disconnect
                        </Button>
                        {item.lastError && (
                          <span className="text-[10px] text-red-500 truncate ml-auto" title={item.lastError}>
                            {item.lastError}
                          </span>
                        )}
                      </div>
                    )}
                    {item.status === "disconnected" && item.lastError && (
                      <span className="text-[10px] text-red-500 truncate mt-1 block" title={item.lastError}>
                        {item.lastError}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <IntegrationSetupWizard
        integration={selectedIntegration}
        employeeId={employeeId}
        onClose={() => setSelectedIntegration(null)}
        onConnect={connectIntegration}
        onOpenChat={onOpenChat}
      />
    </div>
  )
}
