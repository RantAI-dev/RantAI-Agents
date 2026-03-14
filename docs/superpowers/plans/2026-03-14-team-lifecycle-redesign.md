# Team Container Lifecycle Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the buggy 3-step deploy/start/stop lifecycle with a reliable 2-state (IDLE/RUNNING) Start/Stop/Delete model where Docker is the source of truth.

**Architecture:** Merge deploy+start into a single atomic `startGroup()` that writes volume, creates container, and sets `status = "RUNNING"` in one DB update. Stop kills container and sets `IDLE`. List endpoint reconciles stale state by batch-checking Docker. Remove all employee-level lifecycle code.

**Tech Stack:** Next.js API routes, Prisma ORM, Dockerode, React hooks

**Spec:** `docs/superpowers/specs/2026-03-14-team-lifecycle-redesign.md`

---

## Chunk 1: Backend — Orchestrator + API Routes

### Task 1: Rewrite orchestrator interface

**Files:**
- Modify: `lib/digital-employee/orchestrator.ts`

- [ ] **Step 1: Update interface to new method signatures**

Replace the entire file:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/digital-employee/orchestrator.ts
git commit -m "refactor: update orchestrator interface — startGroup/stopGroup/deleteGroup"
```

### Task 2: Rewrite DockerOrchestrator

**Files:**
- Modify: `lib/digital-employee/docker-orchestrator.ts`

- [ ] **Step 1: Rewrite the full orchestrator**

Keep `buildTar`, `writeFileToVolume`, `ensureImage` helper functions unchanged. Replace the class body:

**`startGroup(groupId)`** — merged deploy+start:
1. Fetch group with members. Validate has members.
2. If `containerId` set and container is running → return early (idempotent).
3. If `containerId` set but container is dead → remove container, clear DB fields.
4. Create/reuse volume `emp-group-vol-{groupId}`.
5. Generate group package, write to volume via helper containers.
6. Ensure employee image.
7. Create runtime token (24h JWT).
8. Create and start container.
9. Inspect for mapped ports.
10. **Single atomic DB update:** `status = "RUNNING"`, `containerId`, `containerPort`, `noVncPort`, `gatewayToken`.
11. Mark all member employees `status = "ACTIVE"`, `lastActiveAt = now()`.
12. On any failure: cleanup created container, throw error. DB stays `IDLE`.

The full implementation (replace everything from `export class DockerOrchestrator` to end of file):

```typescript
export class DockerOrchestrator implements EmployeeOrchestrator {
  private docker: Dockerode

  constructor() {
    this.docker = new Dockerode({ socketPath: "/var/run/docker.sock" })
  }

  private async ensureImage(image: string): Promise<void> {
    // ... keep existing ensureImage unchanged ...
  }

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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep -i "docker-orchestrator\|orchestrator.ts"
```

- [ ] **Step 3: Commit**

```bash
git add lib/digital-employee/docker-orchestrator.ts
git commit -m "refactor: rewrite DockerOrchestrator — merge deploy+start, atomic status updates"
```

### Task 3: Update the orchestrator singleton export

**Files:**
- Modify: `lib/digital-employee/index.ts` (if it re-exports orchestrator)

- [ ] **Step 1: Check if there's a barrel export and update it**

Look at `lib/digital-employee/index.ts` — if it exports `orchestrator`, ensure the type is compatible with the new interface. The `DockerOrchestrator` class already `implements EmployeeOrchestrator`, so as long as the singleton creation matches, this should be fine.

- [ ] **Step 2: Commit if changed**

### Task 4: Rewrite start route + add concurrency guard

**Files:**
- Modify: `app/api/dashboard/groups/[id]/start/route.ts`

- [ ] **Step 1: Rewrite the route**

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { hasPermission } from "@/lib/digital-employee/rbac"
import { DockerOrchestrator } from "@/lib/digital-employee/docker-orchestrator"

interface RouteParams {
  params: Promise<{ id: string }>
}

// In-memory concurrency guard — prevents double-start races
const startingGroups = new Set<string>()

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    if (!hasPermission(orgContext.membership.role, "employee.create")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const { id } = await params

    const group = await prisma.employeeGroup.findFirst({
      where: { id, organizationId: orgContext.organizationId },
    })
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 })
    }

    // Concurrency guard
    if (startingGroups.has(id)) {
      return NextResponse.json({ error: "Already starting" }, { status: 409 })
    }

    startingGroups.add(id)
    try {
      const orchestrator = new DockerOrchestrator()
      const { containerId, port } = await orchestrator.startGroup(id)
      return NextResponse.json({ success: true, containerId, port })
    } finally {
      startingGroups.delete(id)
    }
  } catch (error) {
    console.error("Failed to start group:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start group" },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/dashboard/groups/[id]/start/route.ts
git commit -m "refactor: rewrite start route — merged deploy+start with concurrency guard"
```

### Task 5: Update stop route

**Files:**
- Modify: `app/api/dashboard/groups/[id]/stop/route.ts`

- [ ] **Step 1: Update to call `stopGroup()` (which now sets IDLE)**

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContextWithFallback } from "@/lib/organization"
import { hasPermission } from "@/lib/digital-employee/rbac"
import { DockerOrchestrator } from "@/lib/digital-employee/docker-orchestrator"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: groupId } = await params
    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "No organization" }, { status: 403 })
    }

    if (!hasPermission(orgContext.membership.role, "employee.delete")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const group = await prisma.employeeGroup.findFirst({
      where: { id: groupId, organizationId: orgContext.organizationId },
    })
    if (!group) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    await new DockerOrchestrator().stopGroup(groupId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Stop group failed:", error)
    const message = error instanceof Error ? error.message : "Stop failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/dashboard/groups/[id]/stop/route.ts
git commit -m "refactor: update stop route — calls stopGroup which sets IDLE"
```

### Task 6: Delete deploy route

**Files:**
- Delete: `app/api/dashboard/groups/[id]/deploy/route.ts`

- [ ] **Step 1: Delete the file**

```bash
rm app/api/dashboard/groups/[id]/deploy/route.ts
rmdir app/api/dashboard/groups/[id]/deploy 2>/dev/null || true
```

- [ ] **Step 2: Commit**

```bash
git add -A app/api/dashboard/groups/[id]/deploy/
git commit -m "refactor: delete deploy route — merged into start"
```

### Task 7: Update DELETE handler in groups/[id]/route.ts

**Files:**
- Modify: `app/api/dashboard/groups/[id]/route.ts`

- [ ] **Step 1: Update the DELETE handler**

Remove the `status !== "IDLE"` guard. Use `orchestrator.deleteGroup()` which auto-stops before deleting. Keep the members check (Prisma `onDelete: Restrict` needs empty group).

Replace the DELETE handler:

```typescript
// DELETE /api/dashboard/groups/:id
export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContextWithFallback(req, session.user.id)
    if (!orgContext) {
      return NextResponse.json({ error: "Organization required" }, { status: 400 })
    }

    if (!hasPermission(orgContext.membership.role, "employee.delete")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const existing = await prisma.employeeGroup.findFirst({
      where: { id, organizationId: orgContext.organizationId },
      include: { members: { select: { id: true } } },
    })
    if (!existing) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 })
    }

    // Members must be moved first (Prisma onDelete: Restrict)
    if (existing.members.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete team with members. Move or remove members first." },
        { status: 409 }
      )
    }

    // deleteGroup auto-stops container if running
    const { DockerOrchestrator } = await import("@/lib/digital-employee/docker-orchestrator")
    await new DockerOrchestrator().deleteGroup(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete group:", error)
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 })
  }
}
```

Also update the PATCH handler — change the status check from `status !== "IDLE" && status !== "ACTIVE"` to `status !== "IDLE" && status !== "RUNNING"`.

- [ ] **Step 2: Commit**

```bash
git add app/api/dashboard/groups/[id]/route.ts
git commit -m "refactor: update group DELETE — auto-stops, no status guard deadlock"
```

### Task 8: Update list endpoint reconciliation

**Files:**
- Modify: `app/api/dashboard/groups/route.ts`

- [ ] **Step 1: Rewrite reconciliation to batch-check Docker and handle ACTIVE→IDLE/RUNNING migration**

Replace the reconciliation logic. Use `docker.listContainers()` to get all running container IDs in one call, then cross-reference:

```typescript
import Dockerode from "dockerode"

const docker = new Dockerode({ socketPath: "/var/run/docker.sock" })

/** Batch-reconcile group container states against Docker */
async function reconcileGroups(groups: Array<{ id: string; status: string; containerId: string | null; [key: string]: unknown }>) {
  // Get all running container IDs in one Docker API call
  const runningContainers = await docker.listContainers({ all: false })
  const runningIds = new Set(runningContainers.map((c) => c.Id))

  const reconciled = await Promise.all(
    groups.map(async (g) => {
      // Groups with a containerId — check if container is actually running
      if (g.containerId) {
        if (runningIds.has(g.containerId)) {
          // Container is alive — ensure status is RUNNING
          if (g.status !== "RUNNING") {
            await prisma.employeeGroup.update({
              where: { id: g.id },
              data: { status: "RUNNING" },
            })
            return { ...g, status: "RUNNING" }
          }
          return g
        }
        // Container is dead — clear fields, set IDLE
        await prisma.employeeGroup.update({
          where: { id: g.id },
          data: { status: "IDLE", containerId: null, containerPort: null, noVncPort: null, gatewayToken: null },
        })
        return { ...g, status: "IDLE", containerId: null, containerPort: null, noVncPort: null, gatewayToken: null }
      }

      // No containerId but status isn't IDLE (e.g. legacy "ACTIVE") — set IDLE
      if (g.status !== "IDLE") {
        await prisma.employeeGroup.update({
          where: { id: g.id },
          data: { status: "IDLE" },
        })
        return { ...g, status: "IDLE" }
      }

      return g
    })
  )

  return reconciled
}
```

Replace the old `reconcileContainerState` function and the inline reconciliation in GET with a call to `reconcileGroups(groups)`.

- [ ] **Step 2: Commit**

```bash
git add app/api/dashboard/groups/route.ts
git commit -m "refactor: batch Docker reconciliation — ACTIVE→IDLE/RUNNING migration"
```

### Task 9: Update resume route

**Files:**
- Modify: `app/api/dashboard/digital-employees/[id]/resume/route.ts`

- [ ] **Step 1: Rewrite to use `startGroup()` instead of `deployGroup()` + `startGroupContainer()`**

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationContext } from "@/lib/organization"
import { DockerOrchestrator } from "@/lib/digital-employee/docker-orchestrator"

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const orgContext = await getOrganizationContext(req, session.user.id)

    const employee = await prisma.digitalEmployee.findFirst({
      where: {
        id,
        ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
      },
      select: { groupId: true },
    })

    if (!employee) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const orchestrator = new DockerOrchestrator()
    const { containerId, port } = await orchestrator.startGroup(employee.groupId)

    return NextResponse.json({ success: true, containerId, port })
  } catch (error) {
    console.error("Resume failed:", error)
    return NextResponse.json({ error: "Resume failed" }, { status: 500 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/dashboard/digital-employees/[id]/resume/route.ts
git commit -m "refactor: resume route uses startGroup instead of deploy+start"
```

### Task 10: Update chat route — group status check

**Files:**
- Modify: `app/api/dashboard/digital-employees/[id]/chat/route.ts`

- [ ] **Step 1: Find and replace `status === "ACTIVE"` with `status === "RUNNING"` for group checks**

Search for any group status check like `group?.status === "ACTIVE"` and change to `group?.status === "RUNNING"`. Also update any call to `orchestrator.startGroupContainer()` to `orchestrator.startGroup()`.

- [ ] **Step 2: Commit**

```bash
git add app/api/dashboard/digital-employees/[id]/chat/route.ts
git commit -m "refactor: chat route checks group RUNNING status"
```

### Task 11: Delete employee-level lifecycle routes

**Files:**
- Delete: `app/api/dashboard/digital-employees/[id]/deploy/route.ts`
- Delete: `app/api/dashboard/digital-employees/[id]/start/route.ts`
- Delete: `app/api/dashboard/digital-employees/[id]/stop/route.ts`

- [ ] **Step 1: Delete all three files**

```bash
rm -f app/api/dashboard/digital-employees/[id]/deploy/route.ts
rm -f app/api/dashboard/digital-employees/[id]/start/route.ts
rm -f app/api/dashboard/digital-employees/[id]/stop/route.ts
rmdir app/api/dashboard/digital-employees/[id]/deploy 2>/dev/null || true
rmdir app/api/dashboard/digital-employees/[id]/start 2>/dev/null || true
rmdir app/api/dashboard/digital-employees/[id]/stop 2>/dev/null || true
```

- [ ] **Step 2: Commit**

```bash
git add -A app/api/dashboard/digital-employees/[id]/deploy/ app/api/dashboard/digital-employees/[id]/start/ app/api/dashboard/digital-employees/[id]/stop/
git commit -m "refactor: delete employee-level deploy/start/stop routes — lifecycle is team-level"
```

### Task 12: Verify backend compiles

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v ".next/" | head -30
```

Fix any errors found. The most likely issues are imports of removed methods or `ACTIVE` status checks.

- [ ] **Step 2: Commit any fixes**

---

## Chunk 2: Frontend — Hooks + Components

### Task 13: Update use-employee-groups hook

**Files:**
- Modify: `hooks/use-employee-groups.ts`

- [ ] **Step 1: Remove `deployGroup` callback and export**

Delete the `deployGroup` useCallback block entirely. Remove `deployGroup` from the return object.

- [ ] **Step 2: Commit**

```bash
git add hooks/use-employee-groups.ts
git commit -m "refactor: remove deployGroup from groups hook — merged into startGroup"
```

### Task 14: Update use-digital-employee hook

**Files:**
- Modify: `hooks/use-digital-employee.ts`

- [ ] **Step 1: Remove `deploy`, `start`, `stop` callbacks and their exports**

Find and delete the `deploy()`, `start()`, and `stop()` useCallback blocks. Remove them from the return statement.

- [ ] **Step 2: Commit**

```bash
git add hooks/use-digital-employee.ts
git commit -m "refactor: remove deploy/start/stop from employee hook — lifecycle is team-level"
```

### Task 15: Simplify team-card component

**Files:**
- Modify: `app/dashboard/digital-employees/_components/team-card.tsx`

- [ ] **Step 1: Rewrite to 2-state model**

Remove `onDeploy` prop. Remove `DEPLOYING`, `STOPPING`, `DEPLOYED` handling. Simplify to:

- `IDLE` → "Start" button (calls `onStart`)
- `RUNNING` → "Stop" button (calls `onStop`)

Replace the `TeamCardProps` interface — remove `onDeploy`:

```typescript
interface TeamCardProps {
  group: {
    id: string
    name: string
    description: string | null
    status: string
    isImplicit: boolean
    containerPort: number | null
    members: TeamMember[]
    updatedAt?: string | null
  }
  taskCounts?: { ... }
  onManage?: () => void
  onStart?: () => void
  onStop?: () => void
}
```

Replace `getStatusBadgeClass`:

```typescript
function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "RUNNING":
      return "bg-emerald-500/10 text-emerald-500"
    default:
      return "bg-muted text-muted-foreground"
  }
}
```

Replace the derived state:

```typescript
const isRunning = group.status === "RUNNING"
const displayStatus = isRunning ? "Running" : "Idle"
const statusBadgeClass = getStatusBadgeClass(group.status)
```

Replace the actions row buttons:

```typescript
{group.status === "IDLE" && (
  <Button size="sm" variant="outline" className="h-7 text-xs px-2.5"
    onClick={(e) => { e.stopPropagation(); onStart?.() }}>
    Start
  </Button>
)}
{isRunning && (
  <Button size="sm" variant="outline" className="h-7 text-xs px-2.5"
    onClick={(e) => { e.stopPropagation(); onStop?.() }}>
    Stop
  </Button>
)}
```

Remove all `DEPLOYING`, `STOPPING`, `isDeployed` blocks.

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/digital-employees/_components/team-card.tsx
git commit -m "refactor: simplify team-card to IDLE/RUNNING 2-state model"
```

### Task 16: Update tab-teams component

**Files:**
- Modify: `app/dashboard/digital-employees/_components/tab-teams.tsx`

- [ ] **Step 1: Remove deployGroup, update filter and card props**

In the `useEmployeeGroups()` destructure, remove `deployGroup`.

In the status filter buttons, change `"ACTIVE"` to `"RUNNING"`:

```typescript
{(["ALL", "RUNNING", "IDLE"] as const).map((s) => (
  <Button ...>
    {s === "ALL" ? "All" : s === "RUNNING" ? "Running" : "Idle"}
  </Button>
))}
```

Update `statusFilter` state type from `"ALL" | "ACTIVE" | "IDLE"` to `"ALL" | "RUNNING" | "IDLE"`.

In the `filtered` memo, the filter check `g.status === statusFilter` already works since DB now stores `RUNNING`.

In `TeamCard` props, remove `onDeploy`:

```typescript
<TeamCard
  key={group.id}
  group={group}
  taskCounts={taskCountsByGroup.get(group.id)}
  onManage={() => router.push(`/dashboard/groups/${group.id}`)}
  onStart={() => startGroup(group.id).catch(e => toast.error(e.message))}
  onStop={() => stopGroup(group.id).catch(e => toast.error(e.message))}
/>
```

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/digital-employees/_components/tab-teams.tsx
git commit -m "refactor: tab-teams uses RUNNING status, no deploy"
```

### Task 17: Simplify team detail page

**Files:**
- Modify: `app/dashboard/groups/[id]/page.tsx`

- [ ] **Step 1: Remove deploy handler and simplify status**

Remove `deployGroup` from the `useEmployeeGroups()` destructure.

Remove `handleDeploy` callback entirely.

Remove the `displayStatus` derivation hack. Replace with:

```typescript
const statusStyle =
  GROUP_STATUS_STYLES[group.status] || GROUP_STATUS_STYLES.IDLE
```

Simplify `GROUP_STATUS_STYLES` to just:

```typescript
const GROUP_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  IDLE: { label: "Idle", className: "bg-muted text-muted-foreground" },
  RUNNING: { label: "Running", className: "bg-emerald-500/10 text-emerald-500" },
}
```

Remove the `DEPLOYED`, `STOPPING`, `DEPLOYING` entries.

Simplify action buttons to:

```typescript
{group.status === "IDLE" && (
  <Button size="sm" onClick={handleStart} disabled={isActionLoading}>
    {isActionLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
    Start
  </Button>
)}
{group.status === "RUNNING" && (
  <Button size="sm" variant="outline" onClick={handleStop} disabled={isActionLoading}>
    {isActionLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Pause className="h-3.5 w-3.5 mr-1.5" />}
    Stop
  </Button>
)}
```

Update the delete dialog — remove the "must be Idle" warning and the `status !== "IDLE"` disable guard. Delete now auto-stops:

```typescript
<AlertDialogDescription>
  This will permanently delete the team &quot;{group.name}&quot;.
  {group.status === "RUNNING" && (
    <span className="block mt-2 text-amber-500 font-medium">
      The running container will be stopped automatically.
    </span>
  )}
  {group.members.length > 0 && (
    <span className="block mt-2 text-destructive font-medium">
      This team has {group.members.length} member{group.members.length !== 1 ? "s" : ""}. Remove all members before deleting.
    </span>
  )}
</AlertDialogDescription>
...
<AlertDialogAction
  onClick={handleDelete}
  disabled={group.members.length > 0}
  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
>
  Delete Permanently
</AlertDialogAction>
```

Remove the `Rocket` import if no longer used (was for Deploy button).

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/groups/[id]/page.tsx
git commit -m "refactor: team detail page — IDLE/RUNNING, delete auto-stops"
```

### Task 18: Remove lifecycle UI from employee detail page

**Files:**
- Modify: `app/dashboard/digital-employees/[id]/page.tsx`

- [ ] **Step 1: Remove all deploy/start/stop related code**

Remove from the `useDigitalEmployee()` destructure: `deploy`, `start`, `stop`.

Remove state variables: `deployProgress`, `deployStepMessages`, `isDeploying`, `containerRunning`, `containerLoading`.

Remove callbacks: `handleProgressEvent`, `handleDeploy`, `handleActivate`, `handleDeactivate`, `autoRedeploy`.

Remove the `useEffect` that fetches container status.

Remove the Deploy/Activate/Deactivate buttons from the header.

Remove the `DeployProgressDialog` component usage.

Remove `autoRedeploy` prop from child components (TabTools, TabSkills, etc.).

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/digital-employees/[id]/page.tsx
git commit -m "refactor: remove lifecycle UI from employee detail — managed at team level"
```

### Task 19: Update employee sub-components

**Files:**
- Modify: `app/dashboard/digital-employees/[id]/_components/tab-activity.tsx`
- Modify: `app/dashboard/digital-employees/[id]/_components/tab-chat.tsx`
- Modify: `app/dashboard/digital-employees/[id]/chat/page.tsx`

- [ ] **Step 1: Update tab-activity.tsx**

Remove `onDeploy` prop if present. Employee-level `status === "ACTIVE"` checks are about the employee status (stays unchanged), not group container status.

- [ ] **Step 2: Update tab-chat.tsx**

Employee-level `status === "ACTIVE"` checks refer to employee readiness — these stay. No changes needed unless they reference group container state.

- [ ] **Step 3: Update chat/page.tsx**

Same as above — employee `ACTIVE` is about employee status, not group container. These stay.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/digital-employees/[id]/_components/ app/dashboard/digital-employees/[id]/chat/
git commit -m "refactor: clean up employee sub-components — remove deploy props"
```

### Task 20: Final TypeScript check + fix

- [ ] **Step 1: Run full TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -v ".next/" | head -40
```

Fix any remaining errors. Common issues:
- References to `deployGroup` in destructures
- References to `onDeploy` in component props
- `status === "ACTIVE"` where it should be `"RUNNING"` (group-level only)

- [ ] **Step 2: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve TypeScript errors from lifecycle redesign"
```

### Task 21: Manual smoke test

- [ ] **Step 1: Start the dev server**

```bash
bun run dev
```

- [ ] **Step 2: Test the lifecycle**

1. Navigate to Digital Employees → Teams tab
2. Click on a team → should see Start button (if IDLE) or Stop button (if RUNNING)
3. Click Start → should see spinner → should transition to Running
4. Refresh page → should still show Running (not Start!)
5. Click Stop → should transition to Idle
6. Refresh → should show Idle
7. Delete → should work even if running (auto-stops)

- [ ] **Step 3: Final commit if any fixes needed**
