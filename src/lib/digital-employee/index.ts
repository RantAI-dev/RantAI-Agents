import type { EmployeeOrchestrator } from "./orchestrator"
import { DockerOrchestrator } from "./docker-orchestrator"

function getOrchestrator(): EmployeeOrchestrator {
  const runtime = process.env.EMPLOYEE_RUNTIME || "docker"

  switch (runtime) {
    case "docker":
      return new DockerOrchestrator()
    // case "firecracker":
    //   return new FirecrackerOrchestrator()  // Future
    default:
      return new DockerOrchestrator()
  }
}

export const orchestrator = getOrchestrator()

export type { EmployeeOrchestrator } from "./orchestrator"
export * from "./types"
