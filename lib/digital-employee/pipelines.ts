export interface PipelineStep {
  id: string
  employeeId: string
  instruction: string
  waitForCompletion: boolean
  timeoutMinutes: number
  onFailure: "stop" | "skip" | "retry"
}

export interface Pipeline {
  id: string
  organizationId: string
  name: string
  description?: string
  steps: PipelineStep[]
  status: "draft" | "active" | "archived"
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface PipelineExecution {
  pipelineId: string
  currentStep: number
  status: "running" | "completed" | "failed" | "paused"
  stepResults: Array<{
    stepId: string
    messageId: string
    status: "pending" | "completed" | "failed" | "skipped"
    startedAt: string
    completedAt?: string
  }>
  startedAt: string
  completedAt?: string
}

export function generateStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function createDefaultStep(employeeId: string): PipelineStep {
  return {
    id: generateStepId(),
    employeeId,
    instruction: "",
    waitForCompletion: true,
    timeoutMinutes: 30,
    onFailure: "stop",
  }
}
