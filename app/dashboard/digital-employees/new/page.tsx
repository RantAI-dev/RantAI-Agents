"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  Eye,
  Loader2,
  Users,
  Zap,
  Shield,
} from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { AvatarPicker } from "@/app/dashboard/agent-builder/_components/avatar-picker"
import { useAssistants } from "@/hooks/use-assistants"
import { useEmployeeGroups } from "@/hooks/use-employee-groups"
import { BlurText } from "@/components/reactbits/blur-text"
import { SpotlightCard } from "@/components/reactbits/spotlight-card"
import { toast } from "sonner"
import { TemplateGallery } from "./_components/template-gallery"
import type { EmployeeTemplate } from "@/lib/digital-employee/templates/employee-templates"

const STEPS = [
  { label: "Template", description: "Choose a starting point" },
  { label: "Identity", description: "Name and appearance" },
  { label: "Select Agent", description: "Choose an assistant" },
  { label: "Autonomy Level", description: "Set decision authority" },
  { label: "Team", description: "Assign to a team" },
  { label: "Review & Create", description: "Confirm and deploy" },
]

const AUTONOMY_LEVELS = [
  {
    value: "L1",
    label: "L1 — Observer",
    icon: Eye,
    description: "All actions require approval. Employee observes and learns. Best for initial onboarding.",
    className: "border-blue-500/30 hover:border-blue-500/60",
    badgeClass: "bg-blue-500/10 text-blue-500",
  },
  {
    value: "L2",
    label: "L2 — Assistant",
    icon: Shield,
    description: "Low-risk actions auto-approved. Medium and high-risk actions need approval.",
    className: "border-sky-500/30 hover:border-sky-500/60",
    badgeClass: "bg-sky-500/10 text-sky-500",
  },
  {
    value: "L3",
    label: "L3 — Collaborator",
    icon: Users,
    description: "Low and medium-risk actions auto-approved. Only high-risk actions need approval.",
    className: "border-emerald-500/30 hover:border-emerald-500/60",
    badgeClass: "bg-emerald-500/10 text-emerald-500",
  },
  {
    value: "L4",
    label: "L4 — Autonomous",
    icon: Zap,
    description: "Full authority. Only escalates critical exceptions. Best for proven, low-risk workflows.",
    className: "border-purple-500/30 hover:border-purple-500/60",
    badgeClass: "bg-purple-500/10 text-purple-500",
  },
]

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 24 },
  },
}

export default function NewDigitalEmployeePage() {
  const router = useRouter()
  const { assistants, isLoading: assistantsLoading } = useAssistants()
  const { groups } = useEmployeeGroups()

  const [step, setStep] = useState(0)
  const [isCreating, setIsCreating] = useState(false)

  // Form state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [avatar, setAvatar] = useState("🤖")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [selectedAssistantId, setSelectedAssistantId] = useState<string | null>(null)
  const [autonomyLevel, setAutonomyLevel] = useState("L1")
  const [teamMode, setTeamMode] = useState<"existing" | "new">("new")
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [newTeamName, setNewTeamName] = useState("")
  const [newTeamDesc, setNewTeamDesc] = useState("")

  const handleTemplateSelect = (template: EmployeeTemplate | null) => {
    if (template) {
      setSelectedTemplateId(template.id)
      setName(template.identity.name)
      setDescription(template.identity.description)
      setAvatar(template.identity.avatar)
      setAvatarUrl(null)
      setAutonomyLevel(template.suggestedAutonomy)
    } else {
      setSelectedTemplateId(null)
    }
  }

  useEffect(() => {
    if (teamMode === "new" && !newTeamName) {
      setNewTeamName(name)
    }
  }, [name, teamMode, newTeamName])

  const selectedAssistant = assistants.find((a) => a.id === selectedAssistantId)

  const canProceed = () => {
    switch (step) {
      case 0:
        return true // Template step — always can proceed
      case 1:
        return name.trim().length > 0
      case 2:
        return selectedAssistantId !== null
      case 3:
        return true
      case 4:
        return teamMode === "existing" ? selectedGroupId !== null : true
      default:
        return true
    }
  }

  const handleCreate = useCallback(async () => {
    if (!selectedAssistantId) return
    setIsCreating(true)
    try {
      let groupId: string | undefined

      if (teamMode === "existing" && selectedGroupId) {
        groupId = selectedGroupId
      } else if (teamMode === "new" && newTeamName.trim()) {
        const res = await fetch("/api/dashboard/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newTeamName.trim(), description: newTeamDesc.trim() || undefined }),
        })
        if (!res.ok) throw new Error("Failed to create team")
        const team = await res.json()
        groupId = team.id
      }

      const res = await fetch("/api/dashboard/digital-employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          avatar: avatarUrl || avatar.trim() || undefined,
          assistantId: selectedAssistantId,
          autonomyLevel,
          groupId,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to create employee")
      }
      const employee = await res.json()
      toast.success("Digital employee created")
      router.push(`/dashboard/digital-employees/${employee.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create employee")
    } finally {
      setIsCreating(false)
    }
  }, [name, description, avatar, avatarUrl, selectedAssistantId, autonomyLevel, teamMode, selectedGroupId, newTeamName, newTeamDesc, router])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <motion.div
        className="px-6 pt-6 pb-4 space-y-3"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } },
        }}
      >
        <motion.div variants={fadeUp} className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push("/dashboard/digital-employees")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <BlurText
            text="New Digital Employee"
            className="text-3xl font-bold tracking-tight"
            delay={40}
          />
        </motion.div>

        {/* Step indicator */}
        <motion.div variants={fadeUp} className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2">
              <button
                onClick={() => i < step && setStep(i)}
                className={cn(
                  "flex items-center gap-2 text-xs px-2.5 py-1 rounded-full transition-colors",
                  i === step
                    ? "bg-foreground text-background font-medium"
                    : i < step
                    ? "bg-emerald-500/10 text-emerald-500 cursor-pointer hover:bg-emerald-500/20"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {i < step ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span>{i + 1}</span>
                )}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className="w-6 h-px bg-border" />
              )}
            </div>
          ))}
        </motion.div>
      </motion.div>

      {/* Step Content */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className={cn("max-w-2xl", step === 0 && "max-w-4xl")}
        >
          {/* Step 0: Template */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Choose a Template</h2>
                <p className="text-sm text-muted-foreground">Start from a template or build from scratch.</p>
              </div>
              <TemplateGallery
                selectedTemplateId={selectedTemplateId}
                onSelect={handleTemplateSelect}
              />
            </div>
          )}

          {/* Step 1: Identity */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Identity</h2>
                <p className="text-sm text-muted-foreground">Give your digital employee a name and personality.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="emp-name">Name</Label>
                  <Input
                    id="emp-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Support Agent, Content Writer..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emp-desc">Description (optional)</Label>
                  <Textarea
                    id="emp-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What does this employee do?"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Avatar</Label>
                  <AvatarPicker
                    emoji={avatar}
                    avatarUrl={avatarUrl}
                    onEmojiChange={setAvatar}
                    onAvatarUpload={(_key, url) => setAvatarUrl(url)}
                    onAvatarRemove={() => setAvatarUrl(null)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Select Agent */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Select Agent</h2>
                <p className="text-sm text-muted-foreground">Choose an assistant to power this employee.</p>
              </div>
              {assistantsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {assistants.map((assistant) => (
                    <SpotlightCard
                      key={assistant.id}
                      className={cn(
                        "rounded-lg border bg-card cursor-pointer transition-all hover:border-foreground/30",
                        selectedAssistantId === assistant.id && "border-foreground ring-1 ring-foreground/20"
                      )}
                      spotlightColor="rgba(var(--primary-rgb, 124,58,237), 0.06)"
                      onClick={() => setSelectedAssistantId(assistant.id)}
                    >
                      <div className="p-4 flex items-start gap-3">
                        <span className="text-2xl">{assistant.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-medium truncate">{assistant.name}</h3>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {assistant.description || "No description"}
                          </p>
                          {assistant.model && (
                            <Badge variant="secondary" className="text-[10px] mt-1.5">
                              {assistant.model}
                            </Badge>
                          )}
                        </div>
                        {selectedAssistantId === assistant.id && (
                          <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                        )}
                      </div>
                    </SpotlightCard>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Autonomy Level */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Autonomy Level</h2>
                <p className="text-sm text-muted-foreground">How much decision-making authority should this employee have?</p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {AUTONOMY_LEVELS.map((level) => {
                  const Icon = level.icon
                  return (
                    <SpotlightCard
                      key={level.value}
                      className={cn(
                        "rounded-lg border bg-card cursor-pointer transition-all",
                        level.className,
                        autonomyLevel === level.value && "ring-1 ring-foreground/20"
                      )}
                      spotlightColor="rgba(var(--primary-rgb, 124,58,237), 0.06)"
                      onClick={() => setAutonomyLevel(level.value)}
                    >
                      <div className="p-5 flex items-start gap-4">
                        <div className={cn("rounded-lg p-2.5", level.badgeClass)}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium">{level.label}</h3>
                            {autonomyLevel === level.value && (
                              <Check className="h-4 w-4 text-emerald-500" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                            {level.description}
                          </p>
                        </div>
                      </div>
                    </SpotlightCard>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 4: Team */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold mb-1">Team Assignment</h2>
                <p className="text-sm text-muted-foreground">Assign this employee to a team.</p>
              </div>

              <div className="flex gap-3">
                <Button variant={teamMode === "new" ? "default" : "outline"} onClick={() => setTeamMode("new")}>
                  Create new team
                </Button>
                <Button variant={teamMode === "existing" ? "default" : "outline"} onClick={() => setTeamMode("existing")}>
                  Add to existing team
                </Button>
              </div>

              {teamMode === "new" && (
                <div className="space-y-3">
                  <Input placeholder="Team name" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} />
                  <Input placeholder="Description (optional)" value={newTeamDesc} onChange={(e) => setNewTeamDesc(e.target.value)} />
                </div>
              )}

              {teamMode === "existing" && (
                <div className="space-y-2">
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-colors",
                        selectedGroupId === g.id ? "border-primary bg-primary/5" : "hover:bg-muted"
                      )}
                      onClick={() => setSelectedGroupId(g.id)}
                    >
                      <div className="font-medium text-sm">{g.name}</div>
                      {g.description && <div className="text-xs text-muted-foreground">{g.description}</div>}
                      <div className="text-xs text-muted-foreground mt-1">{g.members.length} members</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 5: Review & Create */}
          {step === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">Review & Create</h2>
                <p className="text-sm text-muted-foreground">Confirm the details for your new digital employee.</p>
              </div>
              <div className="rounded-lg border bg-card p-5 space-y-4">
                <div className="flex items-center gap-3">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={name} className="h-10 w-10 rounded-xl object-cover" />
                  ) : (
                    <span className="text-3xl">{avatar || "🤖"}</span>
                  )}
                  <div>
                    <h3 className="text-base font-semibold">{name}</h3>
                    {description && (
                      <p className="text-sm text-muted-foreground">{description}</p>
                    )}
                  </div>
                </div>
                <div className="h-px bg-border" />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Agent</span>
                    <div className="flex items-center gap-1.5 mt-1 font-medium">
                      {selectedAssistant && (
                        <>
                          <span>{selectedAssistant.emoji}</span>
                          <span>{selectedAssistant.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Autonomy</span>
                    <div className="mt-1">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-xs",
                          AUTONOMY_LEVELS.find((l) => l.value === autonomyLevel)?.badgeClass
                        )}
                      >
                        {AUTONOMY_LEVELS.find((l) => l.value === autonomyLevel)?.label}
                      </Badge>
                    </div>
                  </div>
                  {selectedAssistant?.model && (
                    <div>
                      <span className="text-muted-foreground">Model</span>
                      <div className="mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {selectedAssistant.model}
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Navigation buttons */}
        <div className="flex items-center gap-3 mt-8 max-w-2xl">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back
            </Button>
          )}
          <div className="flex-1" />
          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
            >
              Next
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={isCreating || !canProceed()}
            >
              {isCreating && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Create Employee
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
