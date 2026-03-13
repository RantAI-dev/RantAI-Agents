import type { DeployResult } from "./types"

export type ProgressCallback = (event: {
  step: number
  total: number
  message: string
  status: "in_progress" | "completed" | "error"
}) => void

export interface EmployeeOrchestrator {
  deployGroup(groupId: string, onProgress?: ProgressCallback): Promise<DeployResult>
  startGroupContainer(groupId: string, onProgress?: ProgressCallback): Promise<{ containerId: string; port: number }>
  stopGroupContainer(groupId: string): Promise<void>
  getGroupContainerUrl(groupId: string): Promise<string | null>
}
