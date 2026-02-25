"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  Sparkles,
  Plus,
  Trash2,
  Pencil,
  Search,
  Loader2,
  Store,
  Eye,
  ChevronDown,
  ChevronRight,
  FileText,
  Wrench,
  Tag,
  X,
  SlidersHorizontal,
  Check,
} from "lucide-react"
import Picker from "@emoji-mart/react"
import data from "@emoji-mart/data"
import { DynamicIcon } from "@/components/ui/dynamic-icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useSkills, type SkillItem } from "@/hooks/use-skills"
import { useTools, type ToolItem } from "@/hooks/use-tools"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "productivity", label: "Productivity" },
  { value: "coding", label: "Development" },
  { value: "writing", label: "Writing" },
  { value: "communication", label: "Communication" },
  { value: "data", label: "Data & Analytics" },
  { value: "support", label: "Customer Support" },
]

export default function SkillsSettingsPage() {
  const { skills, isLoading, createSkill, updateSkill, deleteSkill } = useSkills()
  const { tools } = useTools()
  const [search, setSearch] = useState("")
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [sortOption, setSortOption] = useState<"az" | "recent" | "enabled">("recent")
  const [createOpen, setCreateOpen] = useState(false)
  const [editSkill, setEditSkill] = useState<SkillItem | null>(null)
  const [viewSkill, setViewSkill] = useState<SkillItem | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [formDisplayName, setFormDisplayName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formContent, setFormContent] = useState("")
  const [formCategory, setFormCategory] = useState("general")
  const [formIcon, setFormIcon] = useState("")
  const [formTagInput, setFormTagInput] = useState("")
  const [formTags, setFormTags] = useState<string[]>([])
  const [formToolIds, setFormToolIds] = useState<string[]>([])
  const [toolSearch, setToolSearch] = useState("")

  // Distinct categories and tags from installed skills
  const skillCategories = useMemo(() => {
    const cats = new Set(skills.map((s) => s.category))
    return [...cats].sort()
  }, [skills])

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    skills.forEach((s) => s.tags.forEach((tag) => tags.add(tag)))
    return [...tags].sort()
  }, [skills])

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const activeFilterCount = selectedCategories.size + selectedTags.size
  const hasActiveFilters = search.trim().length > 0 || activeFilterCount > 0

  const clearAllFilters = () => {
    setSearch("")
    setSelectedCategories(new Set())
    setSelectedTags(new Set())
  }

  const filteredSkills = useMemo(() => {
    let result = [...skills]

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (s) =>
          s.displayName.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    // Category filter
    if (selectedCategories.size > 0) {
      result = result.filter((s) => selectedCategories.has(s.category))
    }

    // Tag filter
    if (selectedTags.size > 0) {
      result = result.filter((s) => s.tags.some((tag) => selectedTags.has(tag)))
    }

    // Sort
    if (sortOption === "az") {
      result.sort((a, b) => a.displayName.localeCompare(b.displayName))
    } else if (sortOption === "enabled") {
      result.sort((a, b) => {
        if (a.enabled && !b.enabled) return -1
        if (!a.enabled && b.enabled) return 1
        return 0
      })
    }
    // "recent" keeps API order

    return result
  }, [skills, search, selectedCategories, selectedTags, sortOption])

  const availableTools = useMemo(() => {
    const enabledTools = tools.filter((t) => t.enabled)
    if (!toolSearch.trim()) return enabledTools
    const q = toolSearch.toLowerCase()
    return enabledTools.filter(
      (t) =>
        t.displayName.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q)
    )
  }, [tools, toolSearch])

  const resetForm = () => {
    setFormDisplayName("")
    setFormDescription("")
    setFormContent("")
    setFormCategory("general")
    setFormIcon("")
    setFormTagInput("")
    setFormTags([])
    setFormToolIds([])
    setToolSearch("")
  }

  const openCreate = () => {
    resetForm()
    setCreateOpen(true)
  }

  const openEdit = (skill: SkillItem) => {
    setFormDisplayName(skill.displayName)
    setFormDescription(skill.description)
    setFormContent(skill.content)
    setFormCategory(skill.category)
    setFormIcon(skill.icon ?? "")
    setFormTags(skill.tags)
    setFormTagInput("")
    // Load attached tool IDs from metadata if available
    const meta = skill.metadata as Record<string, unknown> | null
    setFormToolIds(Array.isArray(meta?.toolIds) ? (meta.toolIds as string[]) : [])
    setToolSearch("")
    setEditSkill(skill)
  }

  const handleAddTag = () => {
    const tag = formTagInput.trim().toLowerCase()
    if (tag && !formTags.includes(tag)) {
      setFormTags([...formTags, tag])
    }
    setFormTagInput("")
  }

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      handleAddTag()
    }
  }

  const handleCreate = async () => {
    setSaving(true)
    try {
      await createSkill({
        name: formDisplayName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
        displayName: formDisplayName,
        description: formDescription,
        content: formContent,
        category: formCategory,
        tags: formTags,
      })
      toast.success("Skill created")
      resetForm()
      setCreateOpen(false)
    } catch (err) {
      toast.error("Failed to create skill")
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!editSkill) return
    setSaving(true)
    try {
      await updateSkill(editSkill.id, {
        displayName: formDisplayName,
        description: formDescription,
        content: formContent,
        category: formCategory,
        tags: formTags,
      })
      toast.success("Skill updated")
      setEditSkill(null)
      resetForm()
    } catch (err) {
      toast.error("Failed to update skill")
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingId) return
    try {
      await deleteSkill(deletingId)
      toast.success("Skill deleted")
    } catch {
      toast.error("Failed to delete skill")
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleEnabled = async (skill: SkillItem) => {
    try {
      await updateSkill(skill.id, { enabled: !skill.enabled })
      toast.success(skill.enabled ? "Skill disabled" : "Skill enabled")
    } catch {
      toast.error("Failed to update skill")
    }
  }

  const isFormOpen = createOpen || !!editSkill

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Skills
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage instruction-based skills that teach agents specific behaviors.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/marketplace/skills">
              <Store className="h-4 w-4 mr-1.5" />
              Browse Marketplace
            </Link>
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Create Skill
          </Button>
        </div>
      </div>

      {/* Search + Filter + Sort */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter popover (categories + tags) */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 shrink-0">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filter
              {activeFilterCount > 0 && (
                <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[10px] font-medium text-background">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[240px] p-0">
            <Command>
              <CommandInput placeholder="Search filters..." />
              <CommandList className="max-h-[300px] overflow-y-auto">
                <CommandEmpty>No match found.</CommandEmpty>
                {skillCategories.length > 1 && (
                  <CommandGroup heading="Category">
                    {skillCategories.map((cat) => {
                      const active = selectedCategories.has(cat)
                      const label = CATEGORIES.find((c) => c.value === cat)?.label ?? cat
                      return (
                        <CommandItem
                          key={`cat-${cat}`}
                          value={`category: ${label}`}
                          onSelect={() => toggleCategory(cat)}
                          className="cursor-pointer"
                        >
                          <div
                            className={cn(
                              "h-4 w-4 rounded border shrink-0 mr-2 flex items-center justify-center",
                              active ? "border-primary bg-primary/10" : "border-border"
                            )}
                          >
                            {active && <Check className="h-3 w-3 text-primary" />}
                          </div>
                          <span className="truncate">{label}</span>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                )}
                {allTags.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading="Tags">
                      {allTags.map((tag) => {
                        const active = selectedTags.has(tag)
                        return (
                          <CommandItem
                            key={`tag-${tag}`}
                            value={`tag: ${tag}`}
                            onSelect={() => toggleTag(tag)}
                            className="cursor-pointer"
                          >
                            <div
                              className={cn(
                                "h-4 w-4 rounded border shrink-0 mr-2 flex items-center justify-center",
                                active ? "border-primary bg-primary/10" : "border-border"
                              )}
                            >
                              {active && <Check className="h-3 w-3 text-primary" />}
                            </div>
                            <span className="truncate">{tag}</span>
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  </>
                )}
                {activeFilterCount > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => { setSelectedCategories(new Set()); setSelectedTags(new Set()) }}
                        className="cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                        <span className="text-muted-foreground">Clear all filters</span>
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Sort */}
        <Select value={sortOption} onValueChange={(v) => setSortOption(v as typeof sortOption)}>
          <SelectTrigger className="h-9 w-[140px] text-sm shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="recent">Recent</SelectItem>
            <SelectItem value="az">A &ndash; Z</SelectItem>
            <SelectItem value="enabled">Enabled first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Skills List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="text-center py-12">
          <Sparkles className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground mt-3">
            {search ? `No skills match "${search}"` : "No skills yet"}
          </p>
          {!search && (
            <p className="text-xs text-muted-foreground mt-1">
              Create a custom skill or install from the Marketplace.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredSkills.map((skill) => (
            <Card
              key={skill.id}
              className={cn(!skill.enabled && "opacity-60")}
            >
              <CardContent className="p-4 flex items-start gap-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0">
                  <DynamicIcon
                    icon={skill.icon ?? undefined}
                    fallback={Sparkles}
                    className="h-4 w-4 text-muted-foreground"
                    emojiClassName="text-lg"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{skill.displayName}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {skill.source}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {skill.category}
                    </Badge>
                    {skill.assistantCount > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {skill.assistantCount} agent{skill.assistantCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {skill.description}
                  </p>
                  {skill.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {skill.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant={selectedTags.has(tag) ? "default" : "outline"}
                          className="text-[10px] px-1.5 py-0 cursor-pointer hover:bg-muted"
                          onClick={() => toggleTag(tag)}
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Switch
                    checked={skill.enabled}
                    onCheckedChange={() => handleToggleEnabled(skill)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setViewSkill(skill)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(skill)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeletingId(skill.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Create / Edit Dialog ─── */}
      <Dialog
        open={isFormOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false)
            setEditSkill(null)
            resetForm()
          }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40 shrink-0">
            <DialogTitle>
              {editSkill ? "Edit Skill" : "Create Skill"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-6 py-4 space-y-4">
              {/* Display Name */}
              <div className="space-y-1.5">
                <Label>Display Name</Label>
                <Input
                  value={formDisplayName}
                  onChange={(e) => setFormDisplayName(e.target.value)}
                  placeholder="My Custom Skill"
                />
              </div>

              {/* Icon — Emoji Picker */}
              <div className="space-y-1.5">
                <Label>Icon</Label>
                <div className="flex items-center gap-3">
                  <EmojiPickerButton
                    value={formIcon}
                    onChange={setFormIcon}
                  />
                  {formIcon && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => setFormIcon("")}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="What does this skill do?"
                />
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <Label>Category</Label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <Label>Tags</Label>
                {formTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {formTags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-[11px] px-2 py-0.5 gap-1"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => setFormTags(formTags.filter((t) => t !== tag))}
                          className="hover:text-destructive"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <Input
                  value={formTagInput}
                  onChange={(e) => setFormTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={handleAddTag}
                  placeholder="Type a tag and press Enter"
                />
              </div>

              {/* Skill Instructions */}
              <div className="space-y-1.5">
                <Label>Skill Instructions (Markdown)</Label>
                <Textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="Write the instructions that teach the agent this skill..."
                  className="min-h-[120px] max-h-[200px] font-mono text-xs resize-y"
                />
              </div>

              {/* Attach Tools */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5" />
                  Attach Tools
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Select tools that this skill provides or requires.
                </p>
                {formToolIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {formToolIds.map((tid) => {
                      const tool = tools.find((t) => t.id === tid)
                      return (
                        <Badge
                          key={tid}
                          variant="outline"
                          className="text-[11px] px-2 py-0.5 gap-1"
                        >
                          {tool?.displayName ?? tid}
                          <button
                            type="button"
                            onClick={() => setFormToolIds(formToolIds.filter((id) => id !== tid))}
                            className="hover:text-destructive"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </Badge>
                      )
                    })}
                  </div>
                )}
                <div className="rounded-md border border-input">
                  <div className="p-2 border-b border-border/40">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <Input
                        value={toolSearch}
                        onChange={(e) => setToolSearch(e.target.value)}
                        placeholder="Search tools..."
                        className="h-7 pl-7 text-xs border-0 shadow-none focus-visible:ring-0"
                      />
                    </div>
                  </div>
                  <div className="max-h-[140px] overflow-y-auto p-1.5 space-y-0.5">
                    {availableTools.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground text-center py-3">
                        {tools.length === 0 ? "No tools available" : "No matching tools"}
                      </p>
                    ) : (
                      availableTools.map((tool) => (
                        <label
                          key={tool.id}
                          className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
                        >
                          <Checkbox
                            checked={formToolIds.includes(tool.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setFormToolIds([...formToolIds, tool.id])
                              } else {
                                setFormToolIds(formToolIds.filter((id) => id !== tool.id))
                              }
                            }}
                          />
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-5 w-5 rounded bg-muted flex items-center justify-center shrink-0">
                              <DynamicIcon
                                icon={tool.icon ?? undefined}
                                fallback={Wrench}
                                className="h-3 w-3 text-muted-foreground"
                                emojiClassName="text-xs"
                              />
                            </div>
                            <span className="text-xs font-medium truncate">
                              {tool.displayName}
                            </span>
                            <Badge variant="secondary" className="text-[9px] shrink-0">
                              {tool.category}
                            </Badge>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-3 border-t border-border/40 shrink-0">
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false)
                setEditSkill(null)
                resetForm()
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={editSkill ? handleEdit : handleCreate}
              disabled={saving || !formDisplayName || !formContent}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {editSkill ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail / Info Dialog ─── */}
      <SkillDetailDialog
        skill={viewSkill}
        tools={tools}
        open={!!viewSkill}
        onOpenChange={(open) => !open && setViewSkill(null)}
        onEdit={(skill) => {
          setViewSkill(null)
          openEdit(skill)
        }}
      />

      {/* ─── Delete Confirmation ─── */}
      <AlertDialog
        open={!!deletingId}
        onOpenChange={(open) => !open && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Skill</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the skill and detach it from all agents. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Skill Detail Dialog ──────────────────────────────────────

function SkillDetailDialog({
  skill,
  tools,
  open,
  onOpenChange,
  onEdit,
}: {
  skill: SkillItem | null
  tools: ToolItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (skill: SkillItem) => void
}) {
  const [promptExpanded, setPromptExpanded] = useState(false)

  if (!open || !skill) return null

  const meta = skill.metadata as Record<string, unknown> | null
  const attachedToolIds = Array.isArray(meta?.toolIds) ? (meta.toolIds as string[]) : []
  const attachedTools = attachedToolIds
    .map((id) => tools.find((t) => t.id === id))
    .filter(Boolean) as ToolItem[]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/40 shrink-0">
          <div className="flex items-start gap-3.5">
            <div className="h-11 w-11 rounded-xl bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center shrink-0">
              <DynamicIcon
                icon={skill.icon ?? undefined}
                fallback={Sparkles}
                className="h-5 w-5 text-violet-600 dark:text-violet-400"
                emojiClassName="text-xl"
              />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold leading-tight">
                {skill.displayName}
              </DialogTitle>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium leading-none bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                  skill
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {skill.source}
                </Badge>
                {skill.version && (
                  <span className="text-[10px] text-muted-foreground/70 font-medium">
                    v{skill.version}
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-6 py-4 space-y-5">
            {/* Description */}
            <p className="text-sm text-muted-foreground leading-relaxed">
              {skill.description}
            </p>

            {/* Category & Status */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px]">
                {skill.category}
              </Badge>
              <Badge
                variant={skill.enabled ? "default" : "secondary"}
                className="text-[10px]"
              >
                {skill.enabled ? "Enabled" : "Disabled"}
              </Badge>
              {skill.assistantCount > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  Used by {skill.assistantCount} agent{skill.assistantCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Tags */}
            {skill.tags.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Tag className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                {skill.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-muted/60 text-[10px] text-muted-foreground font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Attached Tools */}
            {attachedTools.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <Wrench className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <span className="text-xs font-semibold text-foreground/80">
                    Attached Tools ({attachedTools.length})
                  </span>
                </div>
                <div className="space-y-2">
                  {attachedTools.map((tool) => (
                    <div
                      key={tool.id}
                      className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-md bg-sky-100 dark:bg-sky-500/15 flex items-center justify-center shrink-0">
                          <DynamicIcon
                            icon={tool.icon ?? undefined}
                            fallback={Wrench}
                            className="h-3 w-3 text-sky-600 dark:text-sky-400"
                            emojiClassName="text-xs"
                          />
                        </div>
                        <span className="text-xs font-semibold truncate">
                          {tool.displayName}
                        </span>
                        <Badge variant="secondary" className="text-[9px] ml-auto shrink-0">
                          {tool.category}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                        {tool.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skill Prompt (collapsible) */}
            {skill.content && (
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
                      {skill.content}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-3 border-t border-border/40 shrink-0">
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
              {skill.category}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => onEdit(skill)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Emoji Picker Button ──────────────────────────────────────

function EmojiPickerButton({
  value,
  onChange,
}: {
  value: string
  onChange: (emoji: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-10 w-10 rounded-lg border border-input bg-muted/30 hover:bg-muted/50 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
        >
          {value ? (
            <span className="text-xl">{value}</span>
          ) : (
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[352px] p-0" align="start" side="right">
        <Picker
          data={data}
          onEmojiSelect={(emojiData: { native: string }) => {
            onChange(emojiData.native)
            setOpen(false)
          }}
          theme="dark"
          set="native"
          previewPosition="none"
          skinTonePosition="search"
          perLine={9}
          maxFrequentRows={1}
          navPosition="bottom"
          dynamicWidth={false}
        />
      </PopoverContent>
    </Popover>
  )
}
