import Dockerode from "dockerode"
import { prisma } from "@/lib/prisma"

const THEIA_IMAGE = process.env.THEIA_DOCKER_IMAGE || "rantai/theia:latest"
/** Host used in Theia URLs. In production, set to your server's public hostname/IP. */
const THEIA_HOST = process.env.THEIA_HOST || "localhost"

const docker = new Dockerode({ socketPath: "/var/run/docker.sock" })

function theiaContainerName(employeeId: string) {
  return `theia-${employeeId}`
}

export interface TheiaStatus {
  running: boolean
  url?: string
  port?: number
}

/**
 * Find the running employee container ID from the database.
 * Validates it's actually running before returning.
 */
async function getEmployeeContainerId(employeeId: string): Promise<string> {
  const employee = await prisma.digitalEmployee.findUnique({
    where: { id: employeeId },
    select: { containerId: true },
  })

  if (!employee?.containerId) {
    throw new Error("Employee container is not running. Start the employee first.")
  }

  try {
    const container = docker.getContainer(employee.containerId)
    const info = await container.inspect()
    if (!info.State.Running) {
      throw new Error("Employee container exists but is not running. Start the employee first.")
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("not running")) throw err
    throw new Error("Employee container not found. Start the employee first.")
  }

  return employee.containerId
}

/**
 * Start a Theia IDE sidecar sharing the employee container's PID namespace
 * and workspace volume.
 *
 * - PidMode=container: Theia's terminal can see/exec employee processes (bun, python, rantaiclaw)
 * - Shared volume: same /data files as the employee
 * - Own network: allows normal port binding so the browser can reach Theia via localhost
 */
export async function startTheiaForEmployee(
  employeeId: string
): Promise<{ url: string; port: number }> {
  const name = theiaContainerName(employeeId)
  const volumeName = `emp-vol-${employeeId}`

  // Check if already running
  const existing = await getTheiaStatus(employeeId)
  if (existing.running && existing.url && existing.port) {
    return { url: existing.url, port: existing.port }
  }

  // Employee container must be running to share PID namespace
  const empContainerId = await getEmployeeContainerId(employeeId)

  // Remove stale Theia container if exists
  try {
    const old = docker.getContainer(name)
    await old.stop({ t: 2 }).catch(() => {})
    await old.remove({ force: true }).catch(() => {})
  } catch {
    // No existing container
  }

  // Ensure Theia image is available
  try {
    await docker.getImage(THEIA_IMAGE).inspect()
  } catch {
    console.log(`[Theia] Pulling image: ${THEIA_IMAGE}`)
    const stream = await docker.pull(THEIA_IMAGE)
    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  const container = await docker.createContainer({
    Image: THEIA_IMAGE,
    name,
    Labels: {
      "rantai.employee": employeeId,
      "rantai.mode": "theia",
    },
    ExposedPorts: { "3000/tcp": {} },
    HostConfig: {
      PidMode: `container:${empContainerId}`,
      Binds: [`${volumeName}:/workspace:rw`],
      PortBindings: { "3000/tcp": [{ HostPort: "0" }] },
      Memory: 512 * 1024 * 1024,
      NanoCpus: 0.5 * 1e9,
    },
  })

  await container.start()

  const info = await container.inspect()
  const portBindings = info.NetworkSettings.Ports["3000/tcp"]
  const mappedPort = portBindings?.[0]?.HostPort
  if (!mappedPort) {
    await container.stop({ t: 2 }).catch(() => {})
    await container.remove({ force: true }).catch(() => {})
    throw new Error("Failed to get mapped port for Theia")
  }

  const port = parseInt(mappedPort, 10)

  // Wait for Theia to be ready (up to 15s)
  await waitForReady(port)

  return { url: `http://${THEIA_HOST}:${mappedPort}`, port }
}

/**
 * Poll Theia's HTTP endpoint until it responds (or timeout).
 */
async function waitForReady(port: number, timeoutMs = 15000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/`, {
        signal: AbortSignal.timeout(1000),
      })
      if (res.ok || res.status === 200 || res.status === 304) return
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  // Don't throw — Theia may still be loading but the container is running
}

/**
 * Stop and remove the Theia sidecar container for an employee.
 */
export async function stopTheia(employeeId: string): Promise<void> {
  const name = theiaContainerName(employeeId)
  try {
    const container = docker.getContainer(name)
    await container.stop({ t: 5 }).catch(() => {})
    await container.remove({ force: true }).catch(() => {})
  } catch {
    // Container doesn't exist or already removed
  }
}

/**
 * Check if the Theia sidecar container is running for an employee.
 */
export async function getTheiaStatus(
  employeeId: string
): Promise<TheiaStatus> {
  const name = theiaContainerName(employeeId)
  try {
    const container = docker.getContainer(name)
    const info = await container.inspect()

    if (!info.State.Running) {
      return { running: false }
    }

    const portBindings = info.NetworkSettings.Ports?.["3000/tcp"]
    const mappedPort = portBindings?.[0]?.HostPort
    if (!mappedPort) {
      return { running: false }
    }

    const port = parseInt(mappedPort, 10)
    return {
      running: true,
      url: `http://${THEIA_HOST}:${mappedPort}`,
      port,
    }
  } catch {
    return { running: false }
  }
}
