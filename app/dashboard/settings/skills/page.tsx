"use client"

import { useState } from "react"
import {
  Sparkles,
  Plus,
  Trash2,
  Pencil,
  Search,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { useSkills, type SkillItem } from "@/hooks/use-skills"

export default function SkillsSettingsPage() {
  const { skills, isLoading, createSkill, updateSkill, deleteSkill, fetchSkills } = useSkills()
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [editSkill, setEditSkill] = useState<SkillItem | null>(null)
  const [saving, setSaving] = useState(false)

  // Create form state
  const [formName, setFormName] = useState("")
  const [formDisplayName, setFormDisplayName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formContent, setFormContent] = useState("")
  const [formCategory, setFormCategory] = useState("general")

  const filteredSkills = search
    ? skills.filter(
        (s) =>
          s.displayName.toLowerCase().includes(search.toLowerCase()) ||
          s.description.toLowerCase().includes(search.toLowerCase())
      )
    : skills

  const resetForm = () => {
    setFormName("")
    setFormDisplayName("")
    setFormDescription("")
    setFormContent("")
    setFormCategory("general")
  }

  const handleCreate = async () => {
    setSaving(true)
    try {
      await createSkill({
        name: formName || formDisplayName.toLowerCase().replace(/\s+/g, "-"),
        displayName: formDisplayName,
        description: formDescription,
        content: formContent,
        category: formCategory,
      })
      resetForm()
      setCreateOpen(false)
    } catch (err) {
      console.error("Failed to create skill:", err)
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
      })
      setEditSkill(null)
      resetForm()
    } catch (err) {
      console.error("Failed to update skill:", err)
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (skill: SkillItem) => {
    setFormName(skill.name)
    setFormDisplayName(skill.displayName)
    setFormDescription(skill.description)
    setFormContent(skill.content)
    setFormCategory(skill.category)
    setEditSkill(skill)
  }

  const handleToggleEnabled = async (skill: SkillItem) => {
    await updateSkill(skill.id, { enabled: !skill.enabled })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
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
          <Button size="sm" onClick={() => { resetForm(); setCreateOpen(true) }}>
            <Plus className="h-4 w-4 mr-1.5" />
            Create Skill
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search skills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-9"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="text-center py-12">
          <Sparkles className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground mt-3">No skills yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create a custom skill or install from the Marketplace.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredSkills.map((skill) => (
            <Card key={skill.id}>
              <CardContent className="p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
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
                  <p className="text-xs text-muted-foreground mt-1">{skill.description}</p>
                  {skill.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {skill.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={skill.enabled}
                    onCheckedChange={() => handleToggleEnabled(skill)}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(skill)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => deleteSkill(skill.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={createOpen || !!editSkill} onOpenChange={(open) => {
        if (!open) { setCreateOpen(false); setEditSkill(null); resetForm() }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editSkill ? "Edit Skill" : "Create Skill"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Display Name</label>
              <Input
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
                placeholder="My Custom Skill"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="What does this skill do?"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Category</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="general">General</option>
                <option value="productivity">Productivity</option>
                <option value="coding">Development</option>
                <option value="writing">Writing</option>
                <option value="communication">Communication</option>
                <option value="data">Data & Analytics</option>
                <option value="support">Customer Support</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Skill Instructions (Markdown)</label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Write the instructions that teach the agent this skill..."
                className="mt-1 min-h-[150px] font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setEditSkill(null); resetForm() }}>
              Cancel
            </Button>
            <Button
              onClick={editSkill ? handleEdit : handleCreate}
              disabled={saving || !formDisplayName || !formContent}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {editSkill ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
