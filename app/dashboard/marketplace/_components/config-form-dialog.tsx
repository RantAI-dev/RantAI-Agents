"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import type { MarketplaceItem } from "@/hooks/use-marketplace"

interface JsonSchemaProperty {
  type?: string
  description?: string
  default?: unknown
  enum?: string[]
}

interface JsonSchemaObject {
  type: "object"
  properties: Record<string, JsonSchemaProperty>
  required?: string[]
}

interface ConfigFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: MarketplaceItem
  onSubmit: (config: Record<string, unknown>) => Promise<void>
}

export function ConfigFormDialog({
  open,
  onOpenChange,
  item,
  onSubmit,
}: ConfigFormDialogProps) {
  const schema = item.configSchema as JsonSchemaObject | undefined
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open && schema?.properties) {
      const defaults: Record<string, unknown> = {}
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (prop.default !== undefined) {
          defaults[key] = prop.default
        }
      }
      setValues(defaults)
    }
  }, [open, schema])

  if (!schema?.properties) return null

  const isSensitiveField = (name: string) =>
    /key|secret|token|password/i.test(name)

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await onSubmit(values)
      onOpenChange(false)
    } catch (err) {
      console.error("Config submit failed:", err)
    } finally {
      setSubmitting(false)
    }
  }

  const properties = Object.entries(schema.properties)
  const required = new Set(schema.required ?? [])

  const setValue = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configure {item.displayName}</DialogTitle>
          <DialogDescription>
            Set up configuration before installing this skill.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {properties.map(([key, prop]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={key} className="text-sm font-medium">
                {formatLabel(key)}
                {required.has(key) && (
                  <span className="text-destructive ml-0.5">*</span>
                )}
              </Label>

              {prop.enum ? (
                <Select
                  value={String(values[key] ?? "")}
                  onValueChange={(v) => setValue(key, v)}
                >
                  <SelectTrigger id={key}>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {prop.enum.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : prop.type === "boolean" ? (
                <div className="flex items-center gap-2 pt-0.5">
                  <Switch
                    id={key}
                    checked={!!values[key]}
                    onCheckedChange={(v) => setValue(key, v)}
                  />
                </div>
              ) : prop.type === "number" || prop.type === "integer" ? (
                <Input
                  id={key}
                  type="number"
                  value={String(values[key] ?? "")}
                  onChange={(e) => setValue(key, Number(e.target.value))}
                  placeholder={prop.description}
                />
              ) : (
                <Input
                  id={key}
                  type={isSensitiveField(key) ? "password" : "text"}
                  value={String(values[key] ?? "")}
                  onChange={(e) => setValue(key, e.target.value)}
                  placeholder={prop.description}
                />
              )}

              {prop.description && (
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {prop.description}
                </p>
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Install
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim()
}
