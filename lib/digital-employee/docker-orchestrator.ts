import Dockerode from "dockerode"
import path from "path"
import { prisma } from "@/lib/prisma"
import type { EmployeeOrchestrator, ProgressCallback } from "./orchestrator"
import type {
  TriggerContext,
  DeployResult,
  EmployeeRuntimeStatus,
  ApprovalResponse,
  EmployeeDeploymentConfig,
} from "./types"
import { generateEmployeePackage } from "./package-generator"
import { createRuntimeToken } from "./runtime-auth"

const EMPLOYEE_IMAGE = process.env.EMPLOYEE_DOCKER_IMAGE || "rantai/employee:latest"
const PLATFORM_API_URL = process.env.PLATFORM_API_URL || "http://host.docker.internal:3000"
const HELPER_IMAGE = process.env.EMPLOYEE_HELPER_IMAGE || "alpine:3.19"

/** Repo root — used as Docker build context for the employee image */
const REPO_ROOT = path.resolve(process.cwd())

/**
 * Build a minimal tar archive in memory containing a single file.
 * Tar header = 512 bytes, then file content padded to 512-byte blocks,
 * then two 512-byte zero end-of-archive blocks.
 */
function buildTar(filePath: string, content: string): Buffer {
  const data = Buffer.from(content, "utf-8")
  const headerBuf = Buffer.alloc(512, 0)

  // name (0..100)
  headerBuf.write(filePath, 0, 100, "utf-8")
  // mode (100..108)
  headerBuf.write("0000644\0", 100, 8, "utf-8")
  // uid (108..116)
  headerBuf.write("0000000\0", 108, 8, "utf-8")
  // gid (116..124)
  headerBuf.write("0000000\0", 116, 8, "utf-8")
  // size (124..136) — octal
  headerBuf.write(data.length.toString(8).padStart(11, "0") + "\0", 124, 12, "utf-8")
  // mtime (136..148)
  const mtime = Math.floor(Date.now() / 1000)
  headerBuf.write(mtime.toString(8).padStart(11, "0") + "\0", 136, 12, "utf-8")
  // typeflag (156) — '0' = regular file
  headerBuf.write("0", 156, 1, "utf-8")

  // checksum (148..156): fill with spaces first, then compute
  headerBuf.write("        ", 148, 8, "utf-8")
  let chksum = 0
  for (let i = 0; i < 512; i++) chksum += headerBuf[i]
  headerBuf.write(chksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf-8")

  // Pad file data to 512-byte boundary
  const rem = data.length % 512
  const padding = rem === 0 ? 0 : 512 - rem
  const endBlock = Buffer.alloc(1024, 0) // two zero blocks = end of archive

  return Buffer.concat([
    headerBuf,
    data,
    padding > 0 ? Buffer.alloc(padding, 0) : Buffer.alloc(0),
    endBlock,
  ])
}

/**
 * Write a file to a Docker volume using a temporary helper container + putArchive.
 * This avoids all shell escaping / stdin piping issues.
 */
async function writeFileToVolume(
  docker: Dockerode,
  volumeName: string,
  filePath: string,
  content: string,
  helperImage: string,
): Promise<void> {
  // Determine the directory part (e.g. "config" from "config/employee-package.json")
  const dir = filePath.includes("/") ? filePath.substring(0, filePath.lastIndexOf("/")) : ""

  // Create a helper container with the volume mounted
  const container = await docker.createContainer({
    Image: helperImage,
    Cmd: ["sleep", "10"],
    HostConfig: {
      Binds: [`${volumeName}:/data`],
    },
  })

  try {
    await container.start()

    // Create directories first
    if (dir) {
      const exec = await container.exec({
        Cmd: ["mkdir", "-p", `/data/${dir}`],
        AttachStdout: true,
        AttachStderr: true,
      })
      await exec.start({})
    }

    // Use putArchive to write the file — this is the Docker API's native file copy
    const tar = buildTar(filePath, content)
    await container.putArchive(tar, { path: "/data" })
  } finally {
    await container.stop({ t: 0 }).catch(() => {})
    await container.remove({ force: true }).catch(() => {})
  }
}

export class DockerOrchestrator implements EmployeeOrchestrator {
  private docker: Dockerode

  constructor() {
    this.docker = new Dockerode({ socketPath: "/var/run/docker.sock" })
  }

  /**
   * Ensure image exists locally.
   *
   * For the employee image: checks locally first. If not found, tries to build
   * from the local Dockerfile via `docker build` CLI (Rust compilation takes time).
   * If build fails, falls back to pulling from registry.
   *
   * For helper images: pulls from registry.
   */
  private async ensureImage(image: string): Promise<void> {
    try {
      await this.docker.getImage(image).inspect()
      return // Already available
    } catch {
      // Image not found locally
    }

    // For the employee image, try building from local Dockerfile
    if (image === EMPLOYEE_IMAGE) {
      const dockerfilePath = path.join(REPO_ROOT, "docker/employee/Dockerfile")
      const fs = await import("fs")
      if (fs.existsSync(dockerfilePath)) {
        console.log(`[DockerOrchestrator] Building image ${image} from local Dockerfile...`)
        console.log(`[DockerOrchestrator] This includes Rust compilation and may take several minutes.`)
        const { execSync } = await import("child_process")
        try {
          execSync(
            `docker build -f docker/employee/Dockerfile -t ${image} .`,
            { cwd: REPO_ROOT, stdio: "inherit", timeout: 600_000 }
          )
          return
        } catch (buildErr) {
          console.warn(`[DockerOrchestrator] Local build failed, falling back to registry pull:`, buildErr)
        }
      }
    }

    // Pull from registry
    console.log(`[DockerOrchestrator] Pulling image: ${image}`)
    const stream = await this.docker.pull(image)
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async deploy(employeeId: string, onProgress?: ProgressCallback): Promise<DeployResult> {
    const progress = onProgress || (() => {})
    const total = 6

    progress({ step: 1, total, message: "Validating employee configuration...", status: "in_progress" })

    const employee = await prisma.digitalEmployee.findUnique({
      where: { id: employeeId },
      include: { assistant: true },
    })

    if (!employee) return { success: false, error: "Employee not found" }
    if (!employee.assistant) return { success: false, error: "Assistant not configured" }

    try {
      // Create or reuse Docker volume
      progress({ step: 2, total, message: "Creating storage volume...", status: "in_progress" })
      const volumeName = `emp-vol-${employeeId}`
      try {
        await this.docker.getVolume(volumeName).inspect()
      } catch {
        await this.docker.createVolume({ Name: volumeName })
      }

      // Generate package JSON
      progress({ step: 3, total, message: "Generating employee package...", status: "in_progress" })
      const pkg = await generateEmployeePackage(employeeId)
      const pkgJson = JSON.stringify(pkg)

      // Ensure helper image is available
      progress({ step: 4, total, message: "Preparing container environment...", status: "in_progress" })
      await this.ensureImage(HELPER_IMAGE)

      // Create directory structure via helper container
      const dirs = [
        "/data/config", "/data/workspace", "/data/skills",
        "/data/memory/daily", "/data/state", "/data/logs/runs", "/data/secrets",
      ]

      const mkdirContainer = await this.docker.createContainer({
        Image: HELPER_IMAGE,
        Cmd: ["mkdir", "-p", ...dirs],
        HostConfig: {
          Binds: [`${volumeName}:/data`],
        },
      })

      await mkdirContainer.start()
      await mkdirContainer.wait()
      await mkdirContainer.remove({ force: true }).catch(() => {})

      // Write config via putArchive (Docker native file copy — no shell escaping needed)
      progress({ step: 5, total, message: "Writing configuration files...", status: "in_progress" })
      await writeFileToVolume(this.docker, volumeName, "config/employee-package.json", pkgJson, HELPER_IMAGE)

      // Update employee status
      progress({ step: 6, total, message: "Activating employee...", status: "in_progress" })
      await prisma.digitalEmployee.update({
        where: { id: employeeId },
        data: { status: "ACTIVE", lastActiveAt: new Date() },
      })

      progress({ step: 6, total, message: "Employee deployed successfully!", status: "completed" })
      return { success: true, volumeId: volumeName }
    } catch (error) {
      console.error("Deploy failed:", error)
      progress({ step: 0, total, message: String(error), status: "error" })
      return { success: false, error: String(error) }
    }
  }

  async startRun(employeeId: string, trigger: TriggerContext): Promise<string> {
    const employee = await prisma.digitalEmployee.findUnique({
      where: { id: employeeId },
    })

    if (!employee) throw new Error("Employee not found")
    if (employee.status !== "ACTIVE") throw new Error("Employee not active")

    const config = employee.deploymentConfig as unknown as EmployeeDeploymentConfig

    // Check concurrency
    const runningRuns = await prisma.employeeRun.count({
      where: {
        digitalEmployeeId: employeeId,
        status: "RUNNING",
      },
    })

    if (runningRuns >= (config.concurrency || 1)) {
      throw new Error("Concurrency limit reached")
    }

    // Create run record
    const run = await prisma.employeeRun.create({
      data: {
        digitalEmployeeId: employeeId,
        trigger: trigger.type,
        triggerData: trigger.input ? trigger as object : undefined,
        workflowId: trigger.workflowId,
        status: "RUNNING",
      },
    })

    // Generate runtime JWT
    const token = await createRuntimeToken(employeeId, run.id)

    const volumeName = `emp-vol-${employeeId}`
    const resourceLimits = (employee.resourceLimits as Record<string, unknown>) || {}

    const AI_API_KEY = process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || ""

    try {
      const container = await this.docker.createContainer({
        Image: EMPLOYEE_IMAGE,
        Env: [
          `MODE=run`,
          `RUNTIME_TOKEN=${token}`,
          `PLATFORM_API_URL=${PLATFORM_API_URL}`,
          `RUN_ID=${run.id}`,
          `EMPLOYEE_ID=${employeeId}`,
          `TRIGGER_TYPE=${trigger.type}`,
          `AI_API_KEY=${AI_API_KEY}`,
          `AI_PROVIDER=openrouter`,
          ...(trigger.workflowId ? [`WORKFLOW_ID=${trigger.workflowId}`] : []),
          ...(trigger.input ? [`TRIGGER_INPUT=${JSON.stringify(trigger.input)}`] : []),
          ...(trigger.scheduleId ? [`SCHEDULE_ID=${trigger.scheduleId}`] : []),
        ],
        Labels: {
          "rantai.employee": employeeId,
          "rantai.run": run.id,
        },
        HostConfig: {
          Binds: [`${volumeName}:/data`],
          AutoRemove: true,
          ExtraHosts: ["host.docker.internal:host-gateway"],
          Memory: (resourceLimits.memoryMb as number || 512) * 1024 * 1024,
          NanoCpus: (resourceLimits.cpuCores as number || 0.5) * 1e9,
        },
      })

      await container.start()

      // Update employee stats
      await prisma.digitalEmployee.update({
        where: { id: employeeId },
        data: {
          lastActiveAt: new Date(),
          lastRunId: run.id,
          totalRuns: { increment: 1 },
        },
      })

      return run.id
    } catch (error) {
      // Mark run as failed if container fails to start
      await prisma.employeeRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          error: String(error),
          completedAt: new Date(),
        },
      })
      throw error
    }
  }

  async resumeRun(runId: string, approval: ApprovalResponse): Promise<void> {
    const run = await prisma.employeeRun.findUnique({
      where: { id: runId },
      include: { digitalEmployee: true },
    })

    if (!run) throw new Error("Run not found")
    if (run.status !== "PAUSED") throw new Error("Run not paused")

    const volumeName = `emp-vol-${run.digitalEmployeeId}`

    // Write approval response to volume via putArchive (Docker native file copy)
    const responseJson = JSON.stringify(approval)
    await this.ensureImage(HELPER_IMAGE)
    await writeFileToVolume(this.docker, volumeName, "state/approval-response.json", responseJson, HELPER_IMAGE)

    // Start new container with resume context
    const token = await createRuntimeToken(run.digitalEmployeeId, runId)

    const AI_API_KEY = process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || ""

    const container = await this.docker.createContainer({
      Image: EMPLOYEE_IMAGE,
      Env: [
        `MODE=run`,
        `RUNTIME_TOKEN=${token}`,
        `PLATFORM_API_URL=${PLATFORM_API_URL}`,
        `RUN_ID=${runId}`,
        `EMPLOYEE_ID=${run.digitalEmployeeId}`,
        `RESUME_RUN_ID=${runId}`,
        `TRIGGER_TYPE=resume`,
        `AI_API_KEY=${AI_API_KEY}`,
        `AI_PROVIDER=openrouter`,
      ],
      Labels: {
        "rantai.employee": run.digitalEmployeeId,
        "rantai.run": runId,
      },
      HostConfig: {
        Binds: [`${volumeName}:/data`],
        AutoRemove: true,
        ExtraHosts: ["host.docker.internal:host-gateway"],
      },
    })

    await container.start()

    await prisma.employeeRun.update({
      where: { id: runId },
      data: { status: "RUNNING" },
    })
  }

  async terminate(runId: string): Promise<void> {
    const run = await prisma.employeeRun.findUnique({
      where: { id: runId },
    })

    if (!run) throw new Error("Run not found")

    // Find and stop running containers for this run
    const containers = await this.docker.listContainers({
      filters: { label: [`rantai.run=${runId}`] },
    })

    for (const containerInfo of containers) {
      try {
        const container = this.docker.getContainer(containerInfo.Id)
        await container.stop({ t: 10 })
      } catch {
        // Container may already be stopped
      }
    }

    await prisma.employeeRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        error: "Terminated by user",
        completedAt: new Date(),
      },
    })
  }

  async undeploy(employeeId: string): Promise<void> {
    // Stop all running containers
    const containers = await this.docker.listContainers({
      filters: { label: [`rantai.employee=${employeeId}`] },
    })

    for (const containerInfo of containers) {
      try {
        const container = this.docker.getContainer(containerInfo.Id)
        await container.stop({ t: 10 })
      } catch {
        // Ignore
      }
    }

    // Mark running runs as failed
    await prisma.employeeRun.updateMany({
      where: {
        digitalEmployeeId: employeeId,
        status: { in: ["RUNNING", "PENDING"] },
      },
      data: {
        status: "FAILED",
        error: "Employee undeployed",
        completedAt: new Date(),
      },
    })

    await prisma.digitalEmployee.update({
      where: { id: employeeId },
      data: { status: "PAUSED" },
    })
  }

  async getStatus(employeeId: string): Promise<EmployeeRuntimeStatus> {
    const employee = await prisma.digitalEmployee.findUnique({
      where: { id: employeeId },
    })

    if (!employee) throw new Error("Employee not found")

    const containers = await this.docker.listContainers({
      filters: { label: [`rantai.employee=${employeeId}`] },
    })

    const runningRuns = await prisma.employeeRun.findFirst({
      where: {
        digitalEmployeeId: employeeId,
        status: "RUNNING",
      },
      orderBy: { startedAt: "desc" },
    })

    // Check if persistent gateway container is running
    const containerRunning = !!employee.containerId && containers.some(
      (c) => c.Id === employee.containerId || c.Id.startsWith(employee.containerId!)
    )

    return {
      status: containers.length > 0 ? "running" : employee.status === "ACTIVE" ? "idle" : "stopped",
      runningContainers: containers.length,
      lastActiveAt: employee.lastActiveAt || undefined,
      currentRunId: runningRuns?.id,
      containerRunning,
      gatewayUrl: containerRunning && employee.containerPort
        ? `http://localhost:${employee.containerPort}`
        : undefined,
    }
  }

  async startContainer(employeeId: string, onProgress?: ProgressCallback): Promise<{ containerId: string; port: number }> {
    const progress = onProgress || (() => {})
    const total = 7

    progress({ step: 1, total, message: "Checking employee status...", status: "in_progress" })

    const employee = await prisma.digitalEmployee.findUnique({
      where: { id: employeeId },
      include: { assistant: true },
    })

    if (!employee) throw new Error("Employee not found")
    if (employee.status !== "ACTIVE") throw new Error("Employee must be deployed (ACTIVE) before starting")

    // If container already running, return existing
    if (employee.containerId) {
      try {
        const existing = this.docker.getContainer(employee.containerId)
        const info = await existing.inspect()
        if (info.State.Running && employee.containerPort) {
          progress({ step: total, total, message: "Container already running!", status: "completed" })
          return { containerId: employee.containerId, port: employee.containerPort }
        }
      } catch {
        // Container gone, clean up and create new
      }
    }

    const volumeName = `emp-vol-${employeeId}`

    // Re-generate and write employee package
    progress({ step: 2, total, message: "Generating employee package...", status: "in_progress" })
    const pkg = await generateEmployeePackage(employeeId)
    await this.ensureImage(HELPER_IMAGE)
    await writeFileToVolume(this.docker, volumeName, "config/employee-package.json", JSON.stringify(pkg), HELPER_IMAGE)

    // Ensure employee image is available
    progress({ step: 3, total, message: "Pulling container image...", status: "in_progress" })
    await this.ensureImage(EMPLOYEE_IMAGE)

    // Create gateway JWT (24h)
    progress({ step: 4, total, message: "Generating authentication token...", status: "in_progress" })
    const token = await createRuntimeToken(employeeId, "gateway", { expiresIn: "24h" })

    const resourceLimits = (employee.resourceLimits as Record<string, unknown>) || {}

    // Pass AI provider API key to the container
    const AI_API_KEY = process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || ""

    progress({ step: 5, total, message: "Creating gateway container...", status: "in_progress" })
    const container = await this.docker.createContainer({
      Image: EMPLOYEE_IMAGE,
      Env: [
        `MODE=gateway`,
        `RUNTIME_TOKEN=${token}`,
        `PLATFORM_API_URL=${PLATFORM_API_URL}`,
        `EMPLOYEE_ID=${employeeId}`,
        `AI_API_KEY=${AI_API_KEY}`,
        `AI_PROVIDER=openrouter`,
      ],
      Labels: {
        "rantai.employee": employeeId,
        "rantai.mode": "gateway",
      },
      ExposedPorts: { "8080/tcp": {} },
      HostConfig: {
        Binds: [`${volumeName}:/data`],
        PortBindings: { "8080/tcp": [{ HostPort: "0" }] },
        ExtraHosts: ["host.docker.internal:host-gateway"],
        Memory: (resourceLimits.memoryMb as number || 512) * 1024 * 1024,
        NanoCpus: (resourceLimits.cpuCores as number || 0.5) * 1e9,
      },
    })

    progress({ step: 6, total, message: "Starting gateway...", status: "in_progress" })
    await container.start()

    // Inspect to get mapped port
    const inspectInfo = await container.inspect()
    const portBindings = inspectInfo.NetworkSettings.Ports["8080/tcp"]
    const mappedPort = portBindings?.[0]?.HostPort
    if (!mappedPort) throw new Error("Failed to get mapped port")

    const port = parseInt(mappedPort, 10)
    const containerId = inspectInfo.Id

    // Save to DB
    progress({ step: 7, total, message: "Finalizing...", status: "in_progress" })
    await prisma.digitalEmployee.update({
      where: { id: employeeId },
      data: {
        containerId,
        containerPort: port,
        gatewayToken: token,
        lastActiveAt: new Date(),
      },
    })

    progress({ step: 7, total, message: "Gateway started successfully!", status: "completed" })
    return { containerId, port }
  }

  async stopContainer(employeeId: string): Promise<void> {
    const employee = await prisma.digitalEmployee.findUnique({
      where: { id: employeeId },
    })

    if (!employee) throw new Error("Employee not found")

    if (employee.containerId) {
      try {
        const container = this.docker.getContainer(employee.containerId)
        await container.stop({ t: 10 })
        await container.remove({ force: true })
      } catch {
        // Container may already be stopped/removed
      }
    }

    await prisma.digitalEmployee.update({
      where: { id: employeeId },
      data: {
        containerId: null,
        containerPort: null,
        gatewayToken: null,
      },
    })
  }

  async getContainerUrl(employeeId: string): Promise<string | null> {
    const employee = await prisma.digitalEmployee.findUnique({
      where: { id: employeeId },
      select: { containerId: true, containerPort: true },
    })

    if (!employee?.containerId || !employee.containerPort) return null

    // Verify container is actually running
    try {
      const container = this.docker.getContainer(employee.containerId)
      const info = await container.inspect()
      if (!info.State.Running) return null
    } catch {
      return null
    }

    return `http://localhost:${employee.containerPort}`
  }
}
