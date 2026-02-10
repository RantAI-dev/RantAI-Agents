"use client"

import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useWorkflowEditor } from "@/hooks/use-workflow-editor"
import type { WorkflowVariable } from "@/lib/workflow/types"

const VARIABLE_TYPES = ["string", "number", "boolean", "object", "array"] as const

export function VariablesPanel() {
  const variables = useWorkflowEditor((s) => s.variables)
  const setWorkflowMeta = useWorkflowEditor((s) => s.setWorkflowMeta)

  const addVariable = (kind: "inputs" | "outputs") => {
    const newVar: WorkflowVariable = {
      name: "",
      type: "string",
      required: false,
    }
    setWorkflowMeta({
      variables: {
        ...variables,
        [kind]: [...variables[kind], newVar],
      },
    })
  }

  const updateVariable = (
    kind: "inputs" | "outputs",
    index: number,
    partial: Partial<WorkflowVariable>
  ) => {
    const updated = [...variables[kind]]
    updated[index] = { ...updated[index], ...partial }
    setWorkflowMeta({
      variables: { ...variables, [kind]: updated },
    })
  }

  const removeVariable = (kind: "inputs" | "outputs", index: number) => {
    setWorkflowMeta({
      variables: {
        ...variables,
        [kind]: variables[kind].filter((_, i) => i !== index),
      },
    })
  }

  return (
    <div className="border-t bg-background max-h-[240px] overflow-y-auto">
      <div className="grid grid-cols-2 divide-x">
        {/* Input Variables */}
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs font-semibold">Input Variables</Label>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => addVariable("inputs")}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-2">
            {variables.inputs.map((v, i) => (
              <VariableRow
                key={i}
                variable={v}
                onUpdate={(p) => updateVariable("inputs", i, p)}
                onRemove={() => removeVariable("inputs", i)}
              />
            ))}
            {variables.inputs.length === 0 && (
              <p className="text-[10px] text-muted-foreground">No input variables</p>
            )}
          </div>
        </div>

        {/* Output Variables */}
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs font-semibold">Output Variables</Label>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => addVariable("outputs")}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-2">
            {variables.outputs.map((v, i) => (
              <VariableRow
                key={i}
                variable={v}
                onUpdate={(p) => updateVariable("outputs", i, p)}
                onRemove={() => removeVariable("outputs", i)}
              />
            ))}
            {variables.outputs.length === 0 && (
              <p className="text-[10px] text-muted-foreground">No output variables</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function VariableRow({
  variable,
  onUpdate,
  onRemove,
}: {
  variable: WorkflowVariable
  onUpdate: (partial: Partial<WorkflowVariable>) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={variable.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        className="h-6 text-[10px] flex-1"
        placeholder="name"
      />
      <Select
        value={variable.type}
        onValueChange={(v) => onUpdate({ type: v as WorkflowVariable["type"] })}
      >
        <SelectTrigger className="h-6 text-[10px] w-[70px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VARIABLE_TYPES.map((t) => (
            <SelectItem key={t} value={t} className="text-[10px]">
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Switch
        checked={variable.required}
        onCheckedChange={(v) => onUpdate({ required: v })}
        className="scale-75"
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 shrink-0"
        onClick={onRemove}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  )
}
