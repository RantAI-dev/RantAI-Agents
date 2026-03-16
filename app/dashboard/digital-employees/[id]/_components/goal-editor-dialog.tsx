"use client"

import { useState } from "react"
import { Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { GOAL_TYPES, GOAL_PERIODS } from "@/lib/digital-employee/goals"

interface GoalEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (input: { name: string; type: string; target: number; unit: string; period: string }) => Promise<void>
}

export function GoalEditorDialog({ open, onOpenChange, onCreate }: GoalEditorDialogProps) {
  const [name, setName] = useState("")
  const [type, setType] = useState("counter")
  const [target, setTarget] = useState("")
  const [unit, setUnit] = useState("")
  const [period, setPeriod] = useState("daily")
  const [isCreating, setIsCreating] = useState(false)

  const handleCreate = async () => {
    setIsCreating(true)
    try {
      await onCreate({ name: name.trim(), type, target: Number(target), unit: unit.trim(), period })
      setName("")
      setTarget("")
      setUnit("")
      setType("counter")
      setPeriod("daily")
    } finally {
      setIsCreating(false)
    }
  }

  const canCreate = name.trim() && target && unit.trim() && Number(target) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Goal</DialogTitle>
          <DialogDescription>Track outcomes and performance metrics.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="goal-name">Name</Label>
            <Input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tickets resolved" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOAL_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Period</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOAL_PERIODS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-target">Target</Label>
              <Input id="goal-target" type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-unit">Unit</Label>
              <Input id="goal-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="tickets" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isCreating || !canCreate}>
              {isCreating && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
