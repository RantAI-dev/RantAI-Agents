"use client"

import { useState, useEffect, useCallback, use } from "react"
import { ArrowLeft, Plus, Trash2, GripVertical, Loader2, Save, Play } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DashboardPageHeader } from "@/app/dashboard/_components/dashboard-page-header"
import { toast } from "sonner"
import Link from "next/link"
import { useDigitalEmployees } from "@/hooks/use-digital-employees"
import { generateStepId } from "@/lib/digital-employee/pipelines"
import type { PipelineStep } from "@/lib/digital-employee/pipelines"

interface PipelineDetailProps {
  params: Promise<{ id: string }>
}

interface Pipeline {
  id: string
  name: string
  description: string | null
  steps: PipelineStep[]
  status: string
}

export default function PipelineDetailPage({ params }: PipelineDetailProps) {
  const { id } = use(params)
  const { employees } = useDigitalEmployees()
  const [pipeline, setPipeline] = useState<Pipeline | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const fetchPipeline = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`/api/dashboard/pipelines/${id}`)
      if (!res.ok) throw new Error("Not found")
      setPipeline(await res.json())
    } catch {
      toast.error("Pipeline not found")
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchPipeline()
  }, [fetchPipeline])

  const save = async () => {
    if (!pipeline) return
    try {
      setIsSaving(true)
      const res = await fetch(`/api/dashboard/pipelines/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: pipeline.name,
          description: pipeline.description,
          steps: pipeline.steps,
          status: pipeline.status,
        }),
      })
      if (!res.ok) throw new Error("Failed to save")
      toast.success("Pipeline saved")
    } catch {
      toast.error("Failed to save pipeline")
    } finally {
      setIsSaving(false)
    }
  }

  const addStep = () => {
    if (!pipeline) return
    const defaultEmployee = employees[0]
    if (!defaultEmployee) {
      toast.error("No employees available")
      return
    }
    setPipeline({
      ...pipeline,
      steps: [
        ...pipeline.steps,
        {
          id: generateStepId(),
          employeeId: defaultEmployee.id,
          instruction: "",
          waitForCompletion: true,
          timeoutMinutes: 30,
          onFailure: "stop",
        },
      ],
    })
  }

  const removeStep = (stepId: string) => {
    if (!pipeline) return
    setPipeline({
      ...pipeline,
      steps: pipeline.steps.filter((s) => s.id !== stepId),
    })
  }

  const updateStep = (stepId: string, updates: Partial<PipelineStep>) => {
    if (!pipeline) return
    setPipeline({
      ...pipeline,
      steps: pipeline.steps.map((s) =>
        s.id === stepId ? { ...s, ...updates } : s
      ),
    })
  }

  const handleRunPipeline = async () => {
    try {
      const res = await fetch(`/api/dashboard/pipelines/${id}/run`, { method: "POST" })
      if (!res.ok) throw new Error("Failed")
      toast.success("Pipeline started")
    } catch {
      toast.error("Failed to start pipeline")
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!pipeline) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p>Pipeline not found</p>
        <Link href="/dashboard/pipelines" className="text-sm text-primary mt-2">
          Back to pipelines
        </Link>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <DashboardPageHeader
        title={pipeline.name}
        subtitle="Pipeline Editor"
      />

      <div className="flex-1 overflow-auto p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Link href="/dashboard/pipelines">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              Back
            </Button>
          </Link>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleRunPipeline} disabled={pipeline.steps.length === 0}>
            <Play className="h-3.5 w-3.5 mr-1" />
            Run
          </Button>
          <Button size="sm" onClick={save} disabled={isSaving}>
            <Save className="h-3.5 w-3.5 mr-1" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Steps ({pipeline.steps.length})</h3>
            <Button variant="outline" size="sm" onClick={addStep}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Step
            </Button>
          </div>

          {pipeline.steps.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg border-dashed">
              No steps yet. Add a step to get started.
            </div>
          ) : (
            pipeline.steps.map((step, index) => (
              <div key={step.id} className="border rounded-lg p-4 space-y-3 bg-card">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                  <Badge variant="outline" className="text-xs">Step {index + 1}</Badge>
                  <Select
                    value={step.employeeId}
                    onValueChange={(v) => updateStep(step.id, { employeeId: v })}
                  >
                    <SelectTrigger className="w-[200px] h-8 text-xs">
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.avatar || "\uD83E\uDD16"} {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex-1" />
                  <Select
                    value={step.onFailure}
                    onValueChange={(v) => updateStep(step.id, { onFailure: v as PipelineStep["onFailure"] })}
                  >
                    <SelectTrigger className="w-[120px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stop">Stop on fail</SelectItem>
                      <SelectItem value="skip">Skip on fail</SelectItem>
                      <SelectItem value="retry">Retry on fail</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeStep(step.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
                <Textarea
                  placeholder="Instruction for this step..."
                  value={step.instruction}
                  onChange={(e) => updateStep(step.id, { instruction: e.target.value })}
                  className="text-sm min-h-[60px]"
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
