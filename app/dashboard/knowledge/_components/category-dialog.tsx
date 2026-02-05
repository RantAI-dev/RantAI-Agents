"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export interface Category {
  id: string
  name: string
  label: string
  color: string
  isSystem: boolean
}

interface CategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  editingCategory?: Category | null
}

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
]

export function CategoryDialog({
  open,
  onOpenChange,
  onSuccess,
  editingCategory,
}: CategoryDialogProps) {
  const [label, setLabel] = useState("")
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      if (editingCategory) {
        setLabel(editingCategory.label)
        setColor(editingCategory.color)
      } else {
        setLabel("")
        setColor(PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)])
      }
      setError("")
    }
  }, [open, editingCategory])

  const handleSave = async () => {
    if (!label.trim()) {
      setError("Label is required")
      return
    }

    setSaving(true)
    setError("")

    try {
      const url = editingCategory
        ? `/api/dashboard/knowledge/categories/${editingCategory.id}`
        : "/api/dashboard/knowledge/categories"

      const response = await fetch(url, {
        method: editingCategory ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          color,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || "Failed to save category")
        return
      }

      onOpenChange(false)
      onSuccess()
    } catch (err) {
      console.error("Failed to save category:", err)
      setError("Failed to save category")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 p-6">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {editingCategory ? "Edit Category" : "Create Category"}
          </DialogTitle>
          <DialogDescription>
            {editingCategory
              ? "Update the category details."
              : "Create a new category to classify your documents."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="category-label">Label</Label>
            <Input
              id="category-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Product FAQ"
              disabled={editingCategory?.isSystem}
            />
            {editingCategory?.isSystem && (
              <p className="text-xs text-muted-foreground">
                System category labels cannot be changed.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-8 w-8 rounded-full transition-all",
                    color === c ? "ring-2 ring-offset-2 ring-primary" : ""
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!label.trim() || saving || editingCategory?.isSystem}
          >
            {saving ? "Saving..." : editingCategory ? "Save Changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
