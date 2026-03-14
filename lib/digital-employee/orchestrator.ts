export type ProgressCallback = (event: {
  step: number
  total: number
  message: string
  status: "in_progress" | "completed" | "error"
}) => void

export interface EmployeeOrchestrator {
  startGroup(groupId: string, onProgress?: ProgressCallback): Promise<{ containerId: string; port: number }>
  stopGroup(groupId: string): Promise<void>
  deleteGroup(groupId: string): Promise<void>
  getGroupContainerUrl(groupId: string): Promise<string | null>
}
