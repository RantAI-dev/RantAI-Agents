import type {
  TriggerContext,
  DeployResult,
  EmployeeRuntimeStatus,
  ApprovalResponse,
} from "./types"

export type ProgressCallback = (event: {
  step: number
  total: number
  message: string
  status: "in_progress" | "completed" | "error"
}) => void

export interface EmployeeOrchestrator {
  deploy(employeeId: string, onProgress?: ProgressCallback): Promise<DeployResult>
  startRun(employeeId: string, trigger: TriggerContext): Promise<string>
  resumeRun(runId: string, approval: ApprovalResponse): Promise<void>
  terminate(runId: string): Promise<void>
  undeploy(employeeId: string): Promise<void>
  getStatus(employeeId: string): Promise<EmployeeRuntimeStatus>
  startContainer(employeeId: string, onProgress?: ProgressCallback): Promise<{ containerId: string; port: number }>
  stopContainer(employeeId: string): Promise<void>
  getContainerUrl(employeeId: string): Promise<string | null>
}
