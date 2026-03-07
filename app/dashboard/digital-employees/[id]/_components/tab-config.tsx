"use client"

import { useState, useCallback } from "react"
import { Loader2, Save, Trash2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"

interface TabConfigProps {
  employee: {
    id: string
    name: string
    description: string | null
    avatar: string | null
    autonomyLevel: string
  }
  fetchEmployee: () => Promise<void>
  onArchiveOpen: () => void
  onDeleteOpen: () => void
}

export function TabConfig({ employee, fetchEmployee, onArchiveOpen, onDeleteOpen }: TabConfigProps) {
  const [settingsName, setSettingsName] = useState(employee.name)
  const [settingsDesc, setSettingsDesc] = useState(employee.description || "")
  const [settingsAvatar, setSettingsAvatar] = useState(employee.avatar || "")
  const [settingsAutonomy, setSettingsAutonomy] = useState(employee.autonomyLevel)
  const [isSavingSettings, setIsSavingSettings] = useState(false)

  const handleSaveSettings = useCallback(async () => {
    setIsSavingSettings(true)
    try {
      const res = await fetch(`/api/dashboard/digital-employees/${employee.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: settingsName.trim(),
          description: settingsDesc.trim() || null,
          avatar: settingsAvatar.trim() || null,
          autonomyLevel: settingsAutonomy,
        }),
      })
      if (!res.ok) throw new Error("Failed to update")
      await fetchEmployee()
      toast.success("Settings saved")
    } catch {
      toast.error("Failed to save settings")
    } finally {
      setIsSavingSettings(false)
    }
  }, [employee.id, settingsName, settingsDesc, settingsAvatar, settingsAutonomy, fetchEmployee])

  return (
    <div className="flex-1 overflow-auto p-5 space-y-6">
      <div className="max-w-lg space-y-4">
        <h2 className="text-sm font-medium">General</h2>
        <div className="space-y-2">
          <Label htmlFor="settings-name">Name</Label>
          <Input
            id="settings-name"
            value={settingsName}
            onChange={(e) => setSettingsName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-desc">Description</Label>
          <Textarea
            id="settings-desc"
            value={settingsDesc}
            onChange={(e) => setSettingsDesc(e.target.value)}
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-avatar">Avatar</Label>
          <Input
            id="settings-avatar"
            value={settingsAvatar}
            onChange={(e) => setSettingsAvatar(e.target.value)}
            placeholder="🤖"
          />
        </div>
        <div className="space-y-2">
          <Label>Autonomy Level</Label>
          <Select value={settingsAutonomy} onValueChange={setSettingsAutonomy}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="supervised">Supervised</SelectItem>
              <SelectItem value="autonomous">Autonomous</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleSaveSettings} disabled={isSavingSettings}>
          {isSavingSettings ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          Save Settings
        </Button>
      </div>

      {/* Danger Zone */}
      <div className="max-w-lg pt-6 border-t">
        <h3 className="text-sm font-medium text-red-500 mb-3">Danger Zone</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Archive Employee</p>
              <p className="text-xs text-muted-foreground">Stop all tasks and set status to archived.</p>
            </div>
            <Button variant="outline" size="sm" onClick={onArchiveOpen}>
              Archive
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-destructive/50 p-3">
            <div>
              <p className="text-sm font-medium">Delete Employee</p>
              <p className="text-xs text-muted-foreground">Permanently delete. This cannot be undone.</p>
            </div>
            <Button variant="destructive" size="sm" onClick={onDeleteOpen}>
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
