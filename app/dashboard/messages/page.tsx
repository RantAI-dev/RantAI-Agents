"use client"

import { useState } from "react"
import { MessageSquare, Filter, ChevronDown, ArrowRight, Loader2, Users } from "@/lib/icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { DashboardPageHeader } from "@/app/dashboard/_components/dashboard-page-header"
import { useEmployeeMessages } from "@/hooks/use-employee-messages"
import {
  MESSAGE_TYPE_STYLES,
  MESSAGE_STATUS_STYLES,
} from "@/lib/digital-employee/messaging"

export default function MessagesPage() {
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { messages, isLoading, fetchMore, hasMore } = useEmployeeMessages({
    type: typeFilter !== "all" ? typeFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  })

  return (
    <div className="flex-1 flex flex-col h-full">
      <DashboardPageHeader
        title="Messages"
        subtitle="Inter-employee communication and task delegation"
      />

      <div className="flex-1 overflow-auto p-6">
        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="message">Message</SelectItem>
              <SelectItem value="task">Task</SelectItem>
              <SelectItem value="handoff">Handoff</SelectItem>
              <SelectItem value="broadcast">Broadcast</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="read">Read</SelectItem>
              <SelectItem value="replied">Replied</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Message List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">No messages yet</p>
            <p className="text-xs mt-1">Messages between digital employees will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((msg) => {
              const typeStyle = MESSAGE_TYPE_STYLES[msg.type] || MESSAGE_TYPE_STYLES.message
              const statusStyle = MESSAGE_STATUS_STYLES[msg.status] || MESSAGE_STATUS_STYLES.pending
              const isExpanded = expandedId === msg.id

              return (
                <Collapsible
                  key={msg.id}
                  open={isExpanded}
                  onOpenChange={() => setExpandedId(isExpanded ? null : msg.id)}
                >
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card text-left hover:bg-muted/50 transition-colors">
                      {/* Sender */}
                      <div className="flex items-center gap-1.5 min-w-0 shrink-0">
                        <span className="text-lg">{msg.fromEmployee.avatar || "\uD83E\uDD16"}</span>
                        <span className="text-xs font-medium truncate max-w-[100px]">
                          {msg.fromEmployee.name}
                        </span>
                      </div>

                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />

                      {/* Recipient */}
                      <div className="flex items-center gap-1.5 min-w-0 shrink-0">
                        {msg.toEmployee ? (
                          <>
                            <span className="text-lg">{msg.toEmployee.avatar || "\uD83E\uDD16"}</span>
                            <span className="text-xs font-medium truncate max-w-[100px]">
                              {msg.toEmployee.name}
                            </span>
                          </>
                        ) : msg.toGroup ? (
                          <>
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs font-medium">{msg.toGroup}</span>
                          </>
                        ) : null}
                      </div>

                      {/* Type badge */}
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {typeStyle.label}
                      </Badge>

                      {/* Subject */}
                      <span className="flex-1 text-sm truncate">{msg.subject}</span>

                      {/* Status */}
                      <Badge variant="outline" className={cn("text-[10px] shrink-0", statusStyle.className)}>
                        {statusStyle.label}
                      </Badge>

                      {/* Time */}
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                      </span>

                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 py-3 border-x border-b rounded-b-lg bg-muted/30 space-y-3">
                      <div className="text-sm whitespace-pre-wrap">{msg.content}</div>

                      {msg.responseData != null ? (
                        <div className="bg-muted/50 rounded p-2">
                          <p className="text-xs font-medium mb-1">Response</p>
                          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                            {typeof msg.responseData === "string"
                              ? msg.responseData
                              : JSON.stringify(msg.responseData, null, 2)}
                          </pre>
                        </div>
                      ) : null}

                      {msg.childMessages.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium">Thread ({msg.childMessages.length})</p>
                          {msg.childMessages.map((child) => (
                            <div
                              key={child.id}
                              className="text-xs bg-muted/50 rounded p-2"
                            >
                              <span className="text-muted-foreground">
                                {formatDistanceToNow(new Date(child.createdAt), { addSuffix: true })}
                              </span>
                              <p className="mt-0.5">{child.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )
            })}

            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button variant="ghost" size="sm" onClick={fetchMore}>
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
