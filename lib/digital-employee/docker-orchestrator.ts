import Dockerode from "dockerode"
import path from "path"
import { prisma } from "@/lib/prisma"
import type { EmployeeOrchestrator, ProgressCallback } from "./orchestrator"
import { generateGroupPackage } from "./group-package-generator"
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

  /**
   * Start a group — merged deploy+start. Single atomic operation.
   * Creates volume, writes config, creates container, and sets status=RUNNING in one DB update.
   * Idempotent: if container already running, returns it.
   * On failure: cleans up any created container, DB stays IDLE.
   */
  async startGroup(groupId: string, onProgress?: ProgressCallback): Promise<{ containerId: string; port: number }> {
    const progress = onProgress || (() => {})
    const total = 7

    progress({ step: 1, total, message: "Validating group...", status: "in_progress" })

    const group = await prisma.employeeGroup.findUnique({
      where: { id: groupId },
      include: { members: true },
    })

    if (!group) throw new Error("Group not found")
    if (group.members.length === 0) throw new Error("Group has no members to start")

    // Idempotent: if container already running, return it
    if (group.containerId) {
      try {
        const existing = this.docker.getContainer(group.containerId)
        const info = await existing.inspect()
        if (info.State.Running && group.containerPort) {
          progress({ step: total, total, message: "Container already running!", status: "completed" })
          return { containerId: group.containerId, port: group.containerPort }
        }
        // Container exists but not running — remove it
        if (!info.State.Running) {
          await existing.remove({ force: true }).catch(() => {})
        }
      } catch {
        // Container gone entirely
      }
      // Clear stale container data
      await prisma.employeeGroup.update({
        where: { id: groupId },
        data: { containerId: null, containerPort: null, noVncPort: null, gatewayToken: null, status: "IDLE" },
      })
    }

    // Create or reuse volume
    const volumeName = `emp-group-vol-${groupId}`
    try {
      await this.docker.getVolume(volumeName).inspect()
    } catch {
      await this.docker.createVolume({ Name: volumeName })
    }

    // Generate and write group package
    progress({ step: 2, total, message: "Generating group package...", status: "in_progress" })
    const groupPkg = await generateGroupPackage(groupId)
    await this.ensureImage(HELPER_IMAGE)

    // Create directory structure
    const dirs = [
      "/data/config",
      ...group.members.map((m) => `/data/employees/${m.id}`),
    ]
    const mkdirContainer = await this.docker.createContainer({
      Image: HELPER_IMAGE,
      Cmd: ["mkdir", "-p", ...dirs],
      HostConfig: { Binds: [`${volumeName}:/data`] },
    })
    await mkdirContainer.start()
    await mkdirContainer.wait()
    await mkdirContainer.remove({ force: true }).catch(() => {})

    // Write packages to volume
    progress({ step: 3, total, message: "Writing configuration...", status: "in_progress" })
    await writeFileToVolume(this.docker, volumeName, "config/group-package.json", JSON.stringify(groupPkg), HELPER_IMAGE)
    for (const empPkg of groupPkg.employees) {
      await writeFileToVolume(
        this.docker, volumeName,
        `employees/${empPkg.employee.id}/employee-package.json`,
        JSON.stringify(empPkg), HELPER_IMAGE,
      )
    }

    // Ensure employee image
    progress({ step: 4, total, message: "Preparing container image...", status: "in_progress" })
    await this.ensureImage(EMPLOYEE_IMAGE)

    // Create runtime token
    progress({ step: 5, total, message: "Generating auth token...", status: "in_progress" })
    const token = await createRuntimeToken(groupId, "gateway", { expiresIn: "24h" })

    const employeeIds = group.members.map((m) => m.id).join(",")
    const AI_API_KEY = process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || ""

    // Create and start container — with cleanup on failure
    progress({ step: 6, total, message: "Starting container...", status: "in_progress" })
    let container: Dockerode.Container | null = null
    try {
      container = await this.docker.createContainer({
        Image: EMPLOYEE_IMAGE,
        Env: [
          `MODE=group-gateway`,
          `GROUP_ID=${groupId}`,
          `EMPLOYEE_IDS=${employeeIds}`,
          `RUNTIME_TOKEN=${token}`,
          `PLATFORM_API_URL=${PLATFORM_API_URL}`,
          `AI_API_KEY=${AI_API_KEY}`,
          `AI_PROVIDER=openrouter`,
        ],
        Labels: {
          "rantai.group": groupId,
          "rantai.mode": "group-gateway",
        },
        ExposedPorts: { "8080/tcp": {}, "6080/tcp": {} },
        HostConfig: {
          Binds: [`${volumeName}:/data`],
          PortBindings: {
            "8080/tcp": [{ HostPort: "0" }],
            "6080/tcp": [{ HostPort: "0" }],
          },
          ExtraHosts: ["host.docker.internal:host-gateway"],
        },
      })

      await container.start()

      // Inspect for mapped ports
      const inspectInfo = await container.inspect()
      const portBindings = inspectInfo.NetworkSettings.Ports["8080/tcp"]
      const mappedPort = portBindings?.[0]?.HostPort
      if (!mappedPort) throw new Error("Failed to get mapped port")

      const port = parseInt(mappedPort, 10)
      const containerId = inspectInfo.Id
      const vncBindings = inspectInfo.NetworkSettings.Ports["6080/tcp"]
      const noVncPort = vncBindings?.[0]?.HostPort ? parseInt(vncBindings[0].HostPort, 10) : null

      // Single atomic DB update — status + container fields together
      progress({ step: 7, total, message: "Finalizing...", status: "in_progress" })
      await prisma.employeeGroup.update({
        where: { id: groupId },
        data: {
          status: "RUNNING",
          containerId,
          containerPort: port,
          noVncPort,
          gatewayToken: token,
        },
      })

      // Mark members as ACTIVE
      await prisma.digitalEmployee.updateMany({
        where: { id: { in: group.members.map((m) => m.id) } },
        data: { status: "ACTIVE", lastActiveAt: new Date() },
      })

      progress({ step: 7, total, message: "Started successfully!", status: "completed" })
      return { containerId, port }
    } catch (err) {
      // Clean up container on partial failure
      if (container) {
        await container.stop({ t: 0 }).catch(() => {})
        await container.remove({ force: true }).catch(() => {})
      }
      throw err
    }
  }

  /**
   * Stop a group — kills container, sets status=IDLE, clears container fields.
   * Idempotent: calling stop on an already-idle group is a no-op.
   */
  async stopGroup(groupId: string): Promise<void> {
    const group = await prisma.employeeGroup.findUnique({
      where: { id: groupId },
    })

    if (!group) throw new Error("Group not found")

    // Kill container if exists
    if (group.containerId) {
      try {
        const container = this.docker.getContainer(group.containerId)
        await container.stop({ t: 10 })
        await container.remove({ force: true })
      } catch {
        // Container may already be stopped/removed — that's fine
      }
    }

    // Single atomic DB update — status + clear container fields
    await prisma.employeeGroup.update({
      where: { id: groupId },
      data: {
        status: "IDLE",
        containerId: null,
        containerPort: null,
        noVncPort: null,
        gatewayToken: null,
      },
    })
  }

  /**
   * Delete a group — stops container if running, removes volume, deletes DB record.
   * No precondition deadlocks. Members must still be removed first (Prisma onDelete: Restrict).
   */
  async deleteGroup(groupId: string): Promise<void> {
    // Stop container first if running
    await this.stopGroup(groupId)

    // Remove Docker volume
    const volumeName = `emp-group-vol-${groupId}`
    try {
      const volume = this.docker.getVolume(volumeName)
      await volume.remove()
    } catch {
      // Volume may not exist — that's fine
    }

    // Delete DB record
    await prisma.employeeGroup.delete({ where: { id: groupId } })
  }

  async getGroupContainerUrl(groupId: string): Promise<string | null> {
    const group = await prisma.employeeGroup.findUnique({
      where: { id: groupId },
      select: { containerId: true, containerPort: true },
    })

    if (!group?.containerId || !group.containerPort) return null

    try {
      const container = this.docker.getContainer(group.containerId)
      const info = await container.inspect()
      if (!info.State.Running) return null
    } catch {
      return null
    }

    return `http://localhost:${group.containerPort}`
  }
}
