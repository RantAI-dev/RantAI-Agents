"use client"

import { Users, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"

interface TeamMember {
  id: string
  name: string
  avatar: string | null
}

interface TeamCardProps {
  group: {
    id: string
    name: string
    description: string | null
    status: string
    isImplicit: boolean
    containerPort: number | null
    members: TeamMember[]
    updatedAt?: string | null
  }
  taskCounts?: {
    todo: number
    inProgress: number
    inReview: number
    done: number
    total: number
  }
  onManage?: () => void
  onStart?: () => void
  onStop?: () => void
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "RUNNING":
      return "bg-emerald-500/10 text-emerald-500"
    default:
      return "bg-muted text-muted-foreground"
  }
}

const avatarColors = [
  "bg-blue-500/20 text-blue-600",
  "bg-violet-500/20 text-violet-600",
  "bg-emerald-500/20 text-emerald-600",
  "bg-amber-500/20 text-amber-600",
  "bg-rose-500/20 text-rose-600",
  "bg-cyan-500/20 text-cyan-600",
]

function getAvatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return avatarColors[Math.abs(hash) % avatarColors.length]
}

function AvatarStack({ members }: { members: TeamMember[] }) {
  const visible = members.slice(0, 5)
  const rest = members.length - visible.length

  return (
    <div className="flex items-center">
      {visible.map((m, i) => (
        <div
          key={m.id}
          className={cn(
            "relative flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-semibold border-2 border-card",
            i !== 0 && "-ml-2",
            getAvatarColor(m.name)
          )}
          title={m.name}
        >
          {m.name.charAt(0).toUpperCase()}
        </div>
      ))}
      {rest > 0 && (
        <div
          className={cn(
            "relative flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-semibold border-2 border-card -ml-2",
            "bg-muted text-muted-foreground"
          )}
        >
          +{rest}
        </div>
      )}
    </div>
  )
}

function SoloAvatar({ member }: { member: TeamMember }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center w-10 h-10 rounded-full text-sm font-semibold",
        getAvatarColor(member.name)
      )}
      title={member.name}
    >
      {member.name.charAt(0).toUpperCase()}
    </div>
  )
}

function ProgressBar({
  taskCounts,
}: {
  taskCounts: TeamCardProps["taskCounts"]
}) {
  if (!taskCounts || taskCounts.total === 0) return null

  const total = taskCounts.total
  const donePct = (taskCounts.done / total) * 100
  const reviewPct = (taskCounts.inReview / total) * 100
  const progressPct = (taskCounts.inProgress / total) * 100

  return (
    <div className="flex h-1 rounded-full overflow-hidden bg-muted/30">
      <div className="bg-emerald-500 h-full" style={{ width: `${donePct}%` }} />
      <div className="bg-violet-500 h-full" style={{ width: `${reviewPct}%` }} />
      <div className="bg-blue-500 h-full" style={{ width: `${progressPct}%` }} />
    </div>
  )
}

export function TeamCard({ group, taskCounts, onManage, onStart, onStop }: TeamCardProps) {
  const isEmpty = group.members.length === 0
  const isImplicitSolo = group.isImplicit && group.members.length === 1
  const isRunning = group.status === "RUNNING"

  const displayStatus = isRunning ? "Running" : "Idle"
  const statusBadgeClass = getStatusBadgeClass(group.status)

  const displayName = isImplicitSolo ? group.members[0].name : group.name

  const updatedText = group.updatedAt
    ? `Updated ${formatDistanceToNow(new Date(group.updatedAt), { addSuffix: true })}`
    : null

  return (
    <div
      className={cn(
        "bg-card border rounded-lg overflow-hidden cursor-pointer hover:border-border/80 transition-all hover:-translate-y-0.5",
        isEmpty && "border-dashed opacity-70"
      )}
      onClick={onManage}
    >
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            {isImplicitSolo ? (
              <SoloAvatar member={group.members[0]} />
            ) : (
              <div className="flex items-center justify-center h-7 w-7 rounded-md bg-muted shrink-0">
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <h3 className="text-sm font-semibold truncate">{displayName}</h3>
            {isRunning && (
              <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
            )}
          </div>
          <Badge
            variant="secondary"
            className={cn("text-[10px] px-1.5 py-0.5 shrink-0", statusBadgeClass)}
          >
            {displayStatus}
          </Badge>
        </div>
        {group.description && (
          <p className="text-xs text-muted-foreground/70 line-clamp-2 ml-9">
            {group.description}
          </p>
        )}
      </div>

      {/* Members row — hide for implicit solo since avatar is already in header */}
      {!isImplicitSolo && (
        <div className="px-4 pb-3">
          {isEmpty ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
              <UserPlus className="h-3.5 w-3.5" />
              No members yet
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <AvatarStack members={group.members} />
              <span className="text-xs text-muted-foreground">
                {group.members.length} member{group.members.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      {taskCounts && taskCounts.total > 0 && (
        <div className="px-4 pb-3">
          <ProgressBar taskCounts={taskCounts} />
        </div>
      )}

      {/* Task summary strip */}
      {taskCounts && taskCounts.total > 0 && (
        <div className="px-4 pb-3 flex items-center gap-4 border-t bg-muted/[0.02] pt-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
            <span className="tabular-nums font-medium">{taskCounts.todo}</span>
            <span>todo</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
            <span className="tabular-nums font-medium">{taskCounts.inProgress}</span>
            <span>in progress</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500 shrink-0" />
            <span className="tabular-nums font-medium">{taskCounts.inReview}</span>
            <span>review</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="tabular-nums font-medium">{taskCounts.done}</span>
            <span>done</span>
          </div>
        </div>
      )}

      {/* Actions row */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-t"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[10px] text-muted-foreground/50">{updatedText}</span>
        <div className="flex items-center gap-2">
          {group.status === "IDLE" && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5"
              onClick={(e) => {
                e.stopPropagation()
                onStart?.()
              }}
            >
              Start
            </Button>
          )}
          {isRunning && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5"
              onClick={(e) => {
                e.stopPropagation()
                onStop?.()
              }}
            >
              Stop
            </Button>
          )}
          {isEmpty ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5"
              onClick={(e) => {
                e.stopPropagation()
                onManage?.()
              }}
            >
              <UserPlus className="h-3 w-3 mr-1" />
              Add Members
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs px-2.5"
              onClick={(e) => {
                e.stopPropagation()
                onManage?.()
              }}
            >
              Manage
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default TeamCard
