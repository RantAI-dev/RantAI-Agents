# Team = Instance Model Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Digital Employee belong to a team, where each team maps to exactly one RantaiClaw container instance.

**Architecture:** Remove solo container fields from DigitalEmployee, make groupId required, and route all container operations through EmployeeGroup. Auto-create implicit solo teams for employees without explicit teams. Update all API routes to resolve containers through the group, and build frontend for team management.

**Tech Stack:** Prisma + PostgreSQL, Next.js 15 App Router, React, Tailwind + shadcn/ui, Docker orchestrator

**Spec:** `docs/superpowers/specs/2026-03-13-team-instance-model-design.md`

**Terminology:** Group (code) = Team (UI). Prisma model is `EmployeeGroup`, API routes use `/groups/`, code uses `groupId`. UI says "Team" everywhere.

---

## Chunk 1: Schema Migration & Orchestrator Cleanup

### Task 1: Update Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma:948-965` (EmployeeGroup model)
- Modify: `prisma/schema.prisma:896-945` (DigitalEmployee model)

- [ ] **Step 1: Add `isImplicit` to EmployeeGroup**

In `prisma/schema.prisma`, inside the `EmployeeGroup` model (line ~958, before `members`), add:

```prisma
  isImplicit   Boolean          @default(false)
```

- [ ] **Step 2: Remove container fields from DigitalEmployee**

In `prisma/schema.prisma`, inside the `DigitalEmployee` model, delete these four lines (916-919):

```prisma
  containerId    String?
  containerPort  Int?
  noVncPort      Int?
  gatewayToken   String?
```

- [ ] **Step 3: Make `groupId` required on DigitalEmployee**

Change line 938 from:
```prisma
  groupId        String?
```
to:
```prisma
  groupId        String
```

And change line 939 from:
```prisma
  group          EmployeeGroup?  @relation(fields: [groupId], references: [id], onDelete: SetNull)
```
to:
```prisma
  group          EmployeeGroup   @relation(fields: [groupId], references: [id], onDelete: Restrict)
```

**Important:** `onDelete` must change from `SetNull` to `Restrict` — `SetNull` is incompatible with a non-nullable `groupId`. This is consistent with the spec's requirement that groups with members cannot be deleted (Task 9).

- [ ] **Step 4: Write migration seed script**

Create file `prisma/seed-teams.ts`:

```typescript
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  // Find all employees without a group
  const ungrouped = await prisma.digitalEmployee.findMany({
    where: { groupId: null },
    select: {
      id: true,
      name: true,
      organizationId: true,
      createdBy: true,
      containerId: true,
      containerPort: true,
      noVncPort: true,
      gatewayToken: true,
    },
  })

  console.log(`Found ${ungrouped.length} ungrouped employees`)

  for (const emp of ungrouped) {
    // Create implicit team
    const group = await prisma.employeeGroup.create({
      data: {
        name: emp.name,
        description: `Auto-created team for ${emp.name}`,
        organizationId: emp.organizationId,
        createdBy: emp.createdBy,
        isImplicit: true,
        // Copy solo container fields if they exist
        containerId: emp.containerId,
        containerPort: emp.containerPort,
        noVncPort: emp.noVncPort,
        gatewayToken: emp.gatewayToken,
        status: emp.containerPort ? "ACTIVE" : "IDLE",
      },
    })

    // Assign employee to the new team
    await prisma.digitalEmployee.update({
      where: { id: emp.id },
      data: { groupId: group.id },
    })

    console.log(`Created implicit team "${group.name}" for employee ${emp.id}`)
  }

  console.log("Done!")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 5: Run migration seed BEFORE schema push**

Run the seed script while the old schema still has both fields:

```bash
bunx tsx prisma/seed-teams.ts
```

Expected: All ungrouped employees now have a groupId.

- [ ] **Step 6: Push schema changes**

```bash
bunx prisma db push
```

Expected: Schema updates successfully. `containerId`, `containerPort`, `noVncPort`, `gatewayToken` removed from DigitalEmployee. `groupId` is now required. `isImplicit` added to EmployeeGroup.

- [ ] **Step 7: Regenerate Prisma client**

```bash
bunx prisma generate
```

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/seed-teams.ts
git commit -m "feat: schema migration — team=instance model, groupId required, remove solo container fields"
```

---

### Task 2: Clean Up Orchestrator Interface

**Files:**
- Modify: `lib/digital-employee/orchestrator.ts:1-29`

- [ ] **Step 1: Remove solo methods from EmployeeOrchestrator interface**

Replace the entire file with:

```typescript
import type { DeployResult } from "./types"

export type ProgressCallback = (event: {
  step: number
  total: number
  message: string
  status: "in_progress" | "completed" | "error"
}) => void

export interface EmployeeOrchestrator {
  // All container operations go through the group/team
  deployGroup(groupId: string, onProgress?: ProgressCallback): Promise<DeployResult>
  startGroupContainer(groupId: string, onProgress?: ProgressCallback): Promise<{ containerId: string; port: number }>
  stopGroupContainer(groupId: string): Promise<void>
  getGroupContainerUrl(groupId: string): Promise<string | null>
}
```

This removes:
- Solo methods: `deploy`, `startRun`, `resumeRun`, `terminate`, `undeploy`, `getStatus`, `startContainer`, `stopContainer`, `getContainerUrl`
- Dead type imports: `TriggerContext`, `EmployeeRuntimeStatus`, `ApprovalResponse`

- [ ] **Step 2: Commit**

```bash
git add lib/digital-employee/orchestrator.ts
git commit -m "feat: remove solo methods from EmployeeOrchestrator interface"
```

---

### Task 3: Clean Up Docker Orchestrator Implementation

**Files:**
- Modify: `lib/digital-employee/docker-orchestrator.ts:167-653` (remove solo methods)

- [ ] **Step 1: Remove all solo method implementations**

Delete lines 167-653 (the solo methods: `deploy`, `startRun`, `resumeRun`, `terminate`, `undeploy`, `getStatus`, `startContainer`, `stopContainer`, `getContainerUrl`).

Keep lines 655-905 (group methods: `deployGroup`, `startGroupContainer`, `stopGroupContainer`, `getGroupContainerUrl`).

Also remove any imports or helper functions only used by the solo methods. Check `import` statements at the top of the file and remove references to types that are no longer used (e.g. `TriggerContext`, `EmployeeRuntimeStatus`, `ApprovalResponse` if imported here too).

- [ ] **Step 2: Fix any TypeScript errors**

Run:
```bash
bunx tsc --noEmit 2>&1 | head -50
```

Fix any compilation errors from the removed methods. API routes that call these methods will fail — that's expected and will be fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add lib/digital-employee/docker-orchestrator.ts
git commit -m "feat: remove solo container methods from docker orchestrator"
```

---

### Task 4: Update Task Aggregator

**Files:**
- Modify: `lib/digital-employee/task-aggregator.ts:26-173`

- [ ] **Step 1: Narrow `ContainerTarget` type and rewrite `getActiveContainers`**

Replace lines 26-82 with:

```typescript
interface ContainerTarget {
  url: string
  token: string
  sourceId: string
  sourceType: "group"
}

// ─── Active Container Resolution ──────────────────────────────────────────────

export async function getActiveContainers(orgId: string): Promise<ContainerTarget[]> {
  const groups = await prisma.employeeGroup.findMany({
    where: {
      organizationId: orgId,
      containerPort: { not: null },
      gatewayToken: { not: null },
    },
    select: { id: true, containerPort: true, gatewayToken: true },
  })

  const targets: ContainerTarget[] = []
  for (const grp of groups) {
    if (grp.containerPort !== null && grp.gatewayToken !== null) {
      targets.push({
        url: `http://localhost:${grp.containerPort}`,
        token: grp.gatewayToken,
        sourceId: grp.id,
        sourceType: "group",
      })
    }
  }

  return targets
}
```

**Note:** `sourceType` is narrowed from `"employee" | "group"` to just `"group"`. Any downstream code that branches on `target.sourceType === "employee"` (e.g. in `fanOutTaskQuery` around line 452) should have the dead `"employee"` branch removed.

- [ ] **Step 2: Simplify `resolveWriteTarget`**

Replace lines 84-125 with:

```typescript
export async function resolveWriteTarget(
  assigneeId: string | null | undefined,
  orgId: string,
): Promise<ContainerTarget | null> {
  if (assigneeId) {
    // Look up employee's group
    const emp = await prisma.digitalEmployee.findFirst({
      where: { id: assigneeId, organizationId: orgId },
      select: { groupId: true },
    })

    if (emp?.groupId) {
      const grp = await prisma.employeeGroup.findFirst({
        where: { id: emp.groupId, containerPort: { not: null }, gatewayToken: { not: null } },
        select: { id: true, containerPort: true, gatewayToken: true },
      })
      if (grp && grp.containerPort !== null && grp.gatewayToken !== null) {
        return {
          url: `http://localhost:${grp.containerPort}`,
          token: grp.gatewayToken,
          sourceId: grp.id,
          sourceType: "group",
        }
      }
    }
  }

  // Fallback: first active group container in org
  const all = await getActiveContainers(orgId)
  return all[0] ?? null
}
```

- [ ] **Step 3: Simplify `resolveContainerForSource`**

Replace lines 138-173 with:

```typescript
async function resolveContainerForSource(
  sourceEmployeeId: string,
  sourceGroupId: string | null,
): Promise<ContainerTarget | null> {
  // Resolve through the employee's group
  const groupId = sourceGroupId ?? (await prisma.digitalEmployee.findFirst({
    where: { id: sourceEmployeeId },
    select: { groupId: true },
  }))?.groupId

  if (!groupId) return null

  const grp = await prisma.employeeGroup.findFirst({
    where: { id: groupId, containerPort: { not: null }, gatewayToken: { not: null } },
    select: { id: true, containerPort: true, gatewayToken: true },
  })
  if (grp && grp.containerPort !== null && grp.gatewayToken !== null) {
    return {
      url: `http://localhost:${grp.containerPort}`,
      token: grp.gatewayToken,
      sourceId: grp.id,
      sourceType: "group",
    }
  }

  return null
}
```

- [ ] **Step 4: Clean up dead `sourceType === "employee"` branches**

Search the rest of `task-aggregator.ts` for any code that branches on `sourceType === "employee"` and remove those dead branches. Grep for `"employee"` in the file.

- [ ] **Step 5: Commit**

```bash
git add lib/digital-employee/task-aggregator.ts
git commit -m "feat: task aggregator routes all container queries through groups"
```

---

## Chunk 2: API Route Updates

### Task 5: Update Per-Employee Action Routes

**Files:**
- Modify: `app/api/dashboard/digital-employees/[id]/deploy/route.ts`
- Modify: `app/api/dashboard/digital-employees/[id]/start/route.ts`
- Modify: `app/api/dashboard/digital-employees/[id]/stop/route.ts`
- Modify: `app/api/dashboard/digital-employees/[id]/resume/route.ts`

All four routes follow the same pattern: look up employee → get groupId → delegate to group method.

**Important:** The deploy and start routes use SSE streaming (`ReadableStream`). The employee/group lookup and error check must happen **before** the stream is created, not inside the `start()` callback.

- [ ] **Step 1: Update deploy route**

Replace the entire POST handler in `app/api/dashboard/digital-employees/[id]/deploy/route.ts` with:

```typescript
export async function POST(req: Request, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
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
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Resolve group BEFORE creating stream
  const groupId = employee.groupId
  if (!groupId) {
    return new Response(JSON.stringify({ error: "Employee has no team" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const result = await orchestrator.deployGroup(groupId, (event) => {
          send(event)
        })

        if (!result.success) {
          send({ step: 0, total: 0, message: result.error, status: "error" })
        }
      } catch (error) {
        console.error("Deploy failed:", error)
        send({
          step: 0,
          total: 0,
          message: error instanceof Error ? error.message : "Deploy failed",
          status: "error",
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
```

- [ ] **Step 2: Update start route**

Replace the entire POST handler in `app/api/dashboard/digital-employees/[id]/start/route.ts` with the same pattern — lookup employee + groupId BEFORE creating the stream, then call `orchestrator.startGroupContainer(groupId, ...)` inside the stream.

```typescript
export async function POST(req: Request, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
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
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

  const groupId = employee.groupId
  if (!groupId) {
    return new Response(JSON.stringify({ error: "Employee has no team" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        await orchestrator.startGroupContainer(groupId, (event) => {
          send(event)
        })
      } catch (error) {
        console.error("Start container failed:", error)
        send({
          step: 0,
          total: 0,
          message: error instanceof Error ? error.message : "Start failed",
          status: "error",
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
```

- [ ] **Step 3: Update stop route**

Replace the POST handler in `app/api/dashboard/digital-employees/[id]/stop/route.ts`:

```typescript
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

    if (!employee.groupId) {
      return NextResponse.json({ error: "Employee has no team" }, { status: 400 })
    }

    await orchestrator.stopGroupContainer(employee.groupId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Stop container failed:", error)
    const message = error instanceof Error ? error.message : "Stop failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

- [ ] **Step 4: Update resume route**

Replace the POST handler in `app/api/dashboard/digital-employees/[id]/resume/route.ts`. **Important:** check deploy result before proceeding to start.

```typescript
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

    if (!employee.groupId) {
      return NextResponse.json({ error: "Employee has no team" }, { status: 400 })
    }

    const result = await orchestrator.deployGroup(employee.groupId)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Auto-start the container after deploying
    try {
      const { containerId, port } = await orchestrator.startGroupContainer(employee.groupId)
      return NextResponse.json({ success: true, containerId, port })
    } catch (startError) {
      console.error("Auto-start after resume failed:", startError)
      return NextResponse.json({ success: true, warning: "Deployed but container start failed" })
    }
  } catch (error) {
    console.error("Resume failed:", error)
    return NextResponse.json({ error: "Resume failed" }, { status: 500 })
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboard/digital-employees/[id]/deploy/route.ts \
        app/api/dashboard/digital-employees/[id]/start/route.ts \
        app/api/dashboard/digital-employees/[id]/stop/route.ts \
        app/api/dashboard/digital-employees/[id]/resume/route.ts
git commit -m "feat: redirect employee deploy/start/stop/resume to group container"
```

---

### Task 6: Update Chat Route

**Files:**
- Modify: `app/api/dashboard/digital-employees/[id]/chat/route.ts:410-460`

- [ ] **Step 1: Update employee query to include groupId**

In the employee query (line ~410), ensure the select includes `groupId`:

```typescript
const employee = await prisma.digitalEmployee.findFirst({
  where: {
    id,
    ...(orgContext ? { organizationId: orgContext.organizationId } : {}),
  },
})
```

This already returns all fields since there's no `select`, so `employee.groupId` will be available.

- [ ] **Step 2: Replace container resolution block**

Replace lines 421-460 (the container URL resolution + auto-start) with:

```typescript
    // Resolve container through employee's team
    let containerUrl: string | null = null
    let gatewayToken: string | null = null
    let agentIdHeader: string | undefined

    if (employee.groupId) {
      const group = await prisma.employeeGroup.findUnique({
        where: { id: employee.groupId },
        select: { containerPort: true, gatewayToken: true, containerId: true, status: true },
      })

      if (group?.containerPort && group.containerId) {
        containerUrl = await orchestrator.getGroupContainerUrl(employee.groupId)
        gatewayToken = group.gatewayToken
        agentIdHeader = id // Route to specific agent within group gateway
      }

      // Auto-start container if group is ACTIVE but container isn't running
      if (!containerUrl && group?.status === "ACTIVE") {
        try {
          const { port } = await orchestrator.startGroupContainer(employee.groupId)
          containerUrl = `http://localhost:${port}`
          // Wait for gateway to become responsive (up to 30s)
          for (let i = 0; i < 15; i++) {
            await new Promise((r) => setTimeout(r, 2000))
            try {
              const probe = await fetch(`${containerUrl}/health`, { signal: AbortSignal.timeout(2000) })
              if (probe.ok) break
            } catch {
              // Not ready yet
            }
          }
        } catch (startErr) {
          console.error("Auto-start container failed:", startErr)
        }
      }
    }

    if (!containerUrl) {
      return NextResponse.json(
        { error: "Employee is not running. Start it first." },
        { status: 409 }
      )
    }
```

Remove references to `employee.gatewayToken`, `employee.containerPort`, and `orchestrator.getContainerUrl(id)` / `orchestrator.startContainer(id)`.

- [ ] **Step 3: Commit**

```bash
git add app/api/dashboard/digital-employees/[id]/chat/route.ts
git commit -m "feat: chat route resolves container through group"
```

---

### Task 7: Update VNC, Workspace Proxy, and Workspace Proxy Lib

**Files:**
- Modify: `app/api/dashboard/digital-employees/[id]/vnc/route.ts`
- Modify: `app/api/dashboard/digital-employees/[id]/workspace/` (check all files)
- Modify: `lib/digital-employee/workspace-proxy.ts` (**critical** — this reads `employee.containerPort` and `employee.gatewayToken` directly)

- [ ] **Step 1: Update workspace-proxy.ts**

Replace `lib/digital-employee/workspace-proxy.ts` — resolve through the employee's group instead of reading container fields from employee:

```typescript
import { prisma } from "@/lib/prisma"

/**
 * Proxy a request to an employee's RantaiClaw gateway.
 * Resolves containerPort + gatewayToken through the employee's group,
 * forwards the request with bearer auth, and returns the parsed JSON response.
 */
export async function proxyToGateway(
  employeeId: string,
  path: string,
  options?: { method?: string; body?: unknown; timeout?: number }
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const employee = await prisma.digitalEmployee.findUnique({
    where: { id: employeeId },
    select: { groupId: true },
  })

  if (!employee?.groupId) {
    return { ok: false, status: 503, data: { error: "Employee has no team" } }
  }

  const group = await prisma.employeeGroup.findUnique({
    where: { id: employee.groupId },
    select: { containerPort: true, gatewayToken: true },
  })

  if (!group?.containerPort) {
    return { ok: false, status: 503, data: { error: "Team container not running" } }
  }

  const url = `http://localhost:${group.containerPort}${path}`

  const fetchOptions: RequestInit = {
    method: options?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(group.gatewayToken
        ? { Authorization: `Bearer ${group.gatewayToken}` }
        : {}),
    },
    signal: AbortSignal.timeout(options?.timeout ?? 30000),
  }

  if (options?.body) {
    fetchOptions.body = JSON.stringify(options.body)
  }

  try {
    const res = await fetch(url, fetchOptions)
    const data = await res.json()
    return { ok: res.ok, status: res.status, data }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Gateway request failed"
    return { ok: false, status: 502, data: { error: message } }
  }
}
```

- [ ] **Step 2: Update VNC route**

In `app/api/dashboard/digital-employees/[id]/vnc/route.ts`, replace direct `employee.noVncPort` read with group resolution:

```typescript
// Resolve VNC port through employee's team
const employee = await prisma.digitalEmployee.findUnique({
  where: { id },
  select: { groupId: true },
})
if (!employee?.groupId) {
  return NextResponse.json({ error: "Employee has no team" }, { status: 400 })
}
const group = await prisma.employeeGroup.findFirst({
  where: { id: employee.groupId },
  select: { noVncPort: true },
})
if (!group?.noVncPort) {
  return NextResponse.json({ error: "Container not running" }, { status: 503 })
}
const noVncPort = group.noVncPort
```

- [ ] **Step 3: Update workspace proxy route(s)**

Check all files in `app/api/dashboard/digital-employees/[id]/workspace/`. Most should already use `proxyToGateway` from `workspace-proxy.ts` (which was fixed in Step 1). If any read `employee.containerPort` directly, apply the same group lookup pattern.

- [ ] **Step 4: Commit**

```bash
git add lib/digital-employee/workspace-proxy.ts \
        app/api/dashboard/digital-employees/[id]/vnc/ \
        app/api/dashboard/digital-employees/[id]/workspace/
git commit -m "feat: VNC, workspace proxy resolve through group container"
```

---

### Task 8: Update Employee Creation API

**Files:**
- Modify: `app/api/dashboard/digital-employees/route.ts` (POST handler)

- [ ] **Step 1: Add implicit team creation to POST handler**

In the POST handler, after validating the request body but before creating the employee, add team resolution:

```typescript
// Resolve or create team
let resolvedGroupId: string

if (body.groupId) {
  // Validate team exists and belongs to org
  const group = await prisma.employeeGroup.findFirst({
    where: { id: body.groupId, organizationId: orgCtx.organizationId },
  })
  if (!group) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 })
  }
  resolvedGroupId = group.id
} else {
  // Auto-create implicit team
  const implicitTeam = await prisma.employeeGroup.create({
    data: {
      name: body.name,
      organizationId: orgCtx.organizationId,
      createdBy: session.user.id,
      isImplicit: true,
    },
  })
  resolvedGroupId = implicitTeam.id
}
```

Then include `groupId: resolvedGroupId` in the `prisma.digitalEmployee.create()` data.

- [ ] **Step 2: Commit**

```bash
git add app/api/dashboard/digital-employees/route.ts
git commit -m "feat: auto-create implicit team on employee creation"
```

---

### Task 9: Update Groups DELETE Route

**Files:**
- Modify: `app/api/dashboard/groups/[id]/route.ts:107-154` (DELETE handler)

- [ ] **Step 1: Return 409 if group has members**

Replace lines 139-145 (the "unlink all members" block) with a rejection. Keep the existing org-scoped query and auth checks:

```typescript
    // Block deletion if group has members — they must be moved first
    if (existing.members.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete team with members. Move or remove members first." },
        { status: 409 }
      )
    }

    // Safe to delete — no members
    await prisma.employeeGroup.delete({ where: { id } })
```

**Important:** Keep the existing `findFirst({ where: { id, organizationId: orgContext.organizationId } })` — do NOT change it to `findUnique({ where: { id } })` as that would remove the org authorization check.

- [ ] **Step 2: Commit**

```bash
git add app/api/dashboard/groups/[id]/route.ts
git commit -m "feat: prevent group deletion when members exist (409)"
```

---

### Task 10: TypeScript Verification

- [ ] **Step 1: Run full TypeScript check**

```bash
bunx tsc --noEmit 2>&1 | head -200
```

Fix any remaining compilation errors. Common issues:
- References to `employee.containerPort` or `employee.gatewayToken` in files not yet updated
- `groupId` now required where `null` was passed
- Removed orchestrator methods still called somewhere
- `sourceType === "employee"` dead branches

- [ ] **Step 2: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve TypeScript errors from team=instance migration"
```

---

## Chunk 3: Frontend — Teams Tab, Team Card, Employee Cards

### Task 11: Update `use-employee-groups` Hook

**Files:**
- Modify: `hooks/use-employee-groups.ts`
- Modify: `app/api/dashboard/groups/route.ts:23-39` (GET handler — add `avatar` to members select)

- [ ] **Step 1: Update Groups API GET — add `avatar` to members select**

In `app/api/dashboard/groups/route.ts`, line 25-29, change the members select to include `avatar`:

```typescript
      include: {
        members: {
          select: {
            id: true,
            name: true,
            avatar: true,
            status: true,
          },
        },
      },
```

- [ ] **Step 2: Update hook interfaces**

Replace the interfaces in `hooks/use-employee-groups.ts`:

```typescript
export interface EmployeeGroupMember {
  id: string
  name: string
  avatar: string | null
}

export interface EmployeeGroupItem {
  id: string
  name: string
  description: string | null
  status: string
  isImplicit: boolean
  containerPort: number | null
  noVncPort: number | null
  members: EmployeeGroupMember[]
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 3: Add CRUD and container control methods**

Add these methods to the `useEmployeeGroups` hook, before the return statement:

```typescript
const createGroup = useCallback(
  async (data: { name: string; description?: string }): Promise<EmployeeGroupItem> => {
    const res = await fetch("/api/dashboard/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || "Failed to create team")
    }
    const result = await res.json()
    await fetchGroups()
    return result
  },
  [fetchGroups]
)

const updateGroup = useCallback(
  async (groupId: string, data: { name?: string; description?: string; isImplicit?: boolean }): Promise<void> => {
    const res = await fetch(`/api/dashboard/groups/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || "Failed to update team")
    }
    await fetchGroups()
  },
  [fetchGroups]
)

const addMembers = useCallback(
  async (groupId: string, employeeIds: string[]): Promise<void> => {
    const res = await fetch(`/api/dashboard/groups/${groupId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeIds }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || "Failed to add members")
    }
    await fetchGroups()
  },
  [fetchGroups]
)

const removeMembers = useCallback(
  async (groupId: string, employeeIds: string[]): Promise<void> => {
    const res = await fetch(`/api/dashboard/groups/${groupId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeIds }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || "Failed to remove members")
    }
    await fetchGroups()
  },
  [fetchGroups]
)

const deployGroup = useCallback(
  async (groupId: string): Promise<void> => {
    const res = await fetch(`/api/dashboard/groups/${groupId}/deploy`, { method: "POST" })
    if (!res.ok) throw new Error("Failed to deploy team")
    await fetchGroups()
  },
  [fetchGroups]
)

const startGroup = useCallback(
  async (groupId: string): Promise<void> => {
    const res = await fetch(`/api/dashboard/groups/${groupId}/start`, { method: "POST" })
    if (!res.ok) throw new Error("Failed to start team")
    await fetchGroups()
  },
  [fetchGroups]
)

const stopGroup = useCallback(
  async (groupId: string): Promise<void> => {
    const res = await fetch(`/api/dashboard/groups/${groupId}/stop`, { method: "POST" })
    if (!res.ok) throw new Error("Failed to stop team")
    await fetchGroups()
  },
  [fetchGroups]
)
```

- [ ] **Step 4: Update the hook return statement**

Replace the return statement with:

```typescript
return {
  groups,
  isLoading,
  error,
  refresh: fetchGroups,
  createGroup,
  updateGroup,
  addMembers,
  removeMembers,
  deployGroup,
  startGroup,
  stopGroup,
}
```

- [ ] **Step 5: Commit**

```bash
git add hooks/use-employee-groups.ts app/api/dashboard/groups/route.ts
git commit -m "feat: update groups hook with container controls, CRUD, and isImplicit"
```

---

### Task 12: Update Team Card Component

**Files:**
- Modify: `app/dashboard/digital-employees/_components/team-card.tsx`

- [ ] **Step 1: Update TeamMember interface**

Remove `containerPort` from `TeamMember` interface (line 13):

```typescript
interface TeamMember {
  id: string
  name: string
  avatar: string | null
}
```

- [ ] **Step 2: Update online status to use group status**

Replace the per-member online check (line 72, `m.containerPort !== null`) with a group-level indicator:

```typescript
const isOnline = group.status === "ACTIVE"
```

Show a single status indicator on the card based on `group.status`, not per-member.

- [ ] **Step 3: Add instance control buttons**

Update the props interface:

```typescript
interface TeamCardProps {
  group: {
    id: string
    name: string
    description: string | null
    status: string
    isImplicit: boolean
    members: TeamMember[]
    updatedAt?: string | null
  }
  taskCounts?: { todo: number; inProgress: number; inReview: number; done: number; total: number }
  onManage?: () => void
  onDeploy?: () => void
  onStart?: () => void
  onStop?: () => void
}
```

In the footer, render based on `group.status`. The EmployeeGroup model uses these statuses:
- `"IDLE"` → Show "Deploy" button (calls onDeploy)
- `"DEPLOYING"` → Show disabled spinner + "Deploying..."
- `"ACTIVE"` → Show "Stop" button (calls onStop) + green status dot
- `"STOPPING"` → Show disabled spinner + "Stopping..."

Note: There is no separate "deployed but not started" state — `deployGroup` is followed by `startGroupContainer` which transitions directly to ACTIVE. The "Start" button is not needed as a separate state.

- [ ] **Step 4: Handle implicit solo teams differently**

If `group.isImplicit && group.members.length === 1`:
- Show the single employee's avatar large instead of the avatar stack
- Use the employee's name as the display name

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/digital-employees/_components/team-card.tsx
git commit -m "feat: team card with instance controls and implicit team handling"
```

---

### Task 13: Update Teams Tab

**Files:**
- Modify: `app/dashboard/digital-employees/_components/tab-teams.tsx`

- [ ] **Step 1: Make "Create Team" functional**

Replace the "coming soon" toast (line 90) with a dialog. Add state:

```typescript
const [showCreateDialog, setShowCreateDialog] = useState(false)
const [newTeamName, setNewTeamName] = useState("")
const [newTeamDesc, setNewTeamDesc] = useState("")
const [creating, setCreating] = useState(false)
```

Update the hook destructuring to include new methods:

```typescript
const { groups, isLoading, error, refresh, createGroup, deployGroup, startGroup, stopGroup } = useEmployeeGroups()
```

Add a create handler:

```typescript
const handleCreateTeam = async () => {
  if (!newTeamName.trim()) return
  setCreating(true)
  try {
    await createGroup({ name: newTeamName.trim(), description: newTeamDesc.trim() || undefined })
    toast.success("Team created")
    setShowCreateDialog(false)
    setNewTeamName("")
    setNewTeamDesc("")
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Failed to create team")
  } finally {
    setCreating(false)
  }
}
```

Add a Dialog component with name/description inputs and a Create button that calls `handleCreateTeam`. Import `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter` from `@/components/ui/dialog`.

- [ ] **Step 2: Add status filter**

Add status filter buttons (All / Active / Idle) alongside the search bar:

```typescript
const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "IDLE">("ALL")

const filtered = useMemo(() => {
  let result = [...groups]
  if (search.trim()) {
    const q = search.toLowerCase()
    result = result.filter(g => g.name.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q))
  }
  if (statusFilter !== "ALL") {
    result = result.filter(g => g.status === statusFilter)
  }
  return result
}, [groups, search, statusFilter])
```

- [ ] **Step 3: Wire up team card callbacks**

Pass `onDeploy`, `onStart`, `onStop` from the hook to each TeamCard:

```typescript
<TeamCard
  group={group}
  taskCounts={groupTaskCounts[group.id]}
  onManage={() => router.push(`/dashboard/groups/${group.id}`)}
  onDeploy={() => deployGroup(group.id).catch(e => toast.error(e.message))}
  onStart={() => startGroup(group.id).catch(e => toast.error(e.message))}
  onStop={() => stopGroup(group.id).catch(e => toast.error(e.message))}
/>
```

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/digital-employees/_components/tab-teams.tsx
git commit -m "feat: functional create team dialog and instance controls on teams tab"
```

---

### Task 14: Update Employee Cards — Show Team Badge

**Files:**
- Modify: `app/dashboard/digital-employees/page.tsx`
- Modify: `app/api/dashboard/digital-employees/route.ts` (if needed — check if `group` is already included)
- Modify: `hooks/use-digital-employees.ts` (if it exists — add `group` to interface)

- [ ] **Step 1: Verify group data is returned from API**

Check `app/api/dashboard/digital-employees/route.ts` GET handler — it should already include `group` in its Prisma query. If not, add:

```typescript
include: { group: { select: { id: true, name: true } } }
```

- [ ] **Step 2: Update hook type if needed**

If `hooks/use-digital-employees.ts` exists and has a TypeScript interface for employees, add:

```typescript
group?: { id: string; name: string } | null
```

If the hook doesn't exist (employees are fetched inline in the page), update the inline type accordingly.

- [ ] **Step 3: Add team badge to employee grid cards**

In `app/dashboard/digital-employees/page.tsx`, in the employee grid card, add a small team badge:

```tsx
{emp.group && (
  <Badge
    variant="secondary"
    className="text-[10px] px-1.5 py-0.5 shrink-0 bg-muted"
  >
    {emp.group.name}
  </Badge>
)}
```

- [ ] **Step 4: Add "Team" column to table view**

Add a "Team" column to the table view showing the group name.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/digital-employees/page.tsx app/api/dashboard/digital-employees/route.ts hooks/use-digital-employees.ts
git commit -m "feat: show team badge on employee cards"
```

---

## Chunk 4: Frontend — Employee Wizard & Team Management Page

### Task 15: Update New Employee Wizard — Team Assignment Step

**Files:**
- Modify: `app/dashboard/digital-employees/new/page.tsx`

- [ ] **Step 1: Add Team Assignment step to STEPS array**

Insert a new step after "Autonomy Level" (index 3) and before "Review & Create". **Important:** Use `label` not `title` — the existing code uses `label`:

```typescript
const STEPS = [
  { label: "Template", description: "Choose a starting point" },
  { label: "Identity", description: "Name and appearance" },
  { label: "Select Agent", description: "Choose an assistant" },
  { label: "Autonomy Level", description: "Set decision authority" },
  { label: "Team", description: "Assign to a team" },           // NEW
  { label: "Review & Create", description: "Confirm and deploy" },
]
```

- [ ] **Step 2: Update `canProceed()` for the new Team step**

The new Team step is at index 4. Update `canProceed()` (line ~114) to handle it:

```typescript
const canProceed = () => {
  switch (step) {
    case 0:
      return true // Template step — always can proceed
    case 1:
      return name.trim().length > 0
    case 2:
      return selectedAssistantId !== null
    case 3:
      return true // Autonomy level always has a default
    case 4:
      // Team step — valid if existing team selected, or new team has a name, or default (auto-create)
      return teamMode === "existing" ? selectedGroupId !== null : true
    default:
      return true
  }
}
```

- [ ] **Step 3: Add team state and UI**

Add state for team selection:

```typescript
const [teamMode, setTeamMode] = useState<"existing" | "new">("new")
const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
const [newTeamName, setNewTeamName] = useState("")
const [newTeamDesc, setNewTeamDesc] = useState("")
```

Fetch groups:

```typescript
const { groups } = useEmployeeGroups()
```

Import `useEmployeeGroups` from `@/hooks/use-employee-groups`.

Render the Team step (step index 4):

```tsx
{step === 4 && (
  <div className="space-y-4">
    <div className="flex gap-3">
      <Button
        variant={teamMode === "new" ? "default" : "outline"}
        onClick={() => setTeamMode("new")}
      >
        Create new team
      </Button>
      <Button
        variant={teamMode === "existing" ? "default" : "outline"}
        onClick={() => setTeamMode("existing")}
      >
        Add to existing team
      </Button>
    </div>

    {teamMode === "new" && (
      <div className="space-y-3">
        <Input
          placeholder="Team name"
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
        />
        <Input
          placeholder="Description (optional)"
          value={newTeamDesc}
          onChange={(e) => setNewTeamDesc(e.target.value)}
        />
      </div>
    )}

    {teamMode === "existing" && (
      <div className="space-y-2">
        {groups.map((g) => (
          <button
            key={g.id}
            className={cn(
              "w-full text-left p-3 rounded-lg border transition-colors",
              selectedGroupId === g.id ? "border-primary bg-primary/5" : "hover:bg-muted"
            )}
            onClick={() => setSelectedGroupId(g.id)}
          >
            <div className="font-medium text-sm">{g.name}</div>
            {g.description && <div className="text-xs text-muted-foreground">{g.description}</div>}
            <div className="text-xs text-muted-foreground mt-1">{g.members.length} members</div>
          </button>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: Update `handleCreate` to include team**

In the `handleCreate` callback (line ~129), add team logic before the POST:

```typescript
let groupId: string | undefined

if (teamMode === "existing" && selectedGroupId) {
  groupId = selectedGroupId
} else if (teamMode === "new" && newTeamName.trim()) {
  // Create the team first
  const res = await fetch("/api/dashboard/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: newTeamName.trim(), description: newTeamDesc.trim() || undefined }),
  })
  if (!res.ok) throw new Error("Failed to create team")
  const team = await res.json()
  groupId = team.id
}
// If neither, the API will auto-create an implicit team
```

Then include `groupId` in the POST body:

```typescript
body: JSON.stringify({
  name: name.trim(),
  description: description.trim() || undefined,
  avatar: avatarUrl || avatar.trim() || undefined,
  assistantId: selectedAssistantId,
  autonomyLevel,
  groupId,
})
```

Add `groupId, teamMode, selectedGroupId, newTeamName, newTeamDesc` to the `useCallback` dependency array.

- [ ] **Step 5: Pre-fill new team name with employee name**

Add a `useEffect` to sync the employee name to the team name:

```typescript
useEffect(() => {
  if (teamMode === "new" && !newTeamName) {
    setNewTeamName(name)
  }
}, [name, teamMode, newTeamName])
```

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/digital-employees/new/page.tsx
git commit -m "feat: add team assignment step to new employee wizard"
```

---

### Task 16: Build Team Management Page

**Files:**
- Modify: `app/dashboard/groups/[id]/page.tsx` (already exists as a stub)
- Modify: `app/dashboard/digital-employees/_components/tab-tasks.tsx` (accept optional `groupId` prop)

- [ ] **Step 1: Update TabTasks to accept optional groupId**

In `app/dashboard/digital-employees/_components/tab-tasks.tsx`, add a props interface and wire groupId into useTasks:

```typescript
interface TabTasksProps {
  groupId?: string
}

export default function TabTasks({ groupId }: TabTasksProps = {}) {
  const { tasks, isLoading, error, createTask, refresh } = useTasks({
    filter: groupId ? { groupId } : undefined,
  })
  // ... rest of component unchanged
```

- [ ] **Step 2: Wire up the group detail page with real hooks**

The existing page at `app/dashboard/groups/[id]/page.tsx` already has placeholder UI for:
- Deploy/Start/Stop handlers
- Description editing
- Members management

It destructures `updateGroup`, `addMembers`, `removeMembers`, `deployGroup`, `startGroup`, `stopGroup` from `useEmployeeGroups` — these were added in Task 11 Step 3. Wire them up:

```typescript
const {
  groups,
  updateGroup,
  addMembers,
  removeMembers,
  deployGroup,
  startGroup,
  stopGroup,
  refresh,
} = useEmployeeGroups()
```

Find the current group from the list:

```typescript
const group = groups.find(g => g.id === id) ?? null
```

Or add a dedicated fetch for the single group detail:

```typescript
const [group, setGroup] = useState<GroupDetail | null>(null)

useEffect(() => {
  fetch(`/api/dashboard/groups/${id}`)
    .then(r => r.json())
    .then(setGroup)
    .catch(console.error)
}, [id])
```

- [ ] **Step 3: Add tasks section**

Add a section that renders `TabTasks` with the group's ID:

```tsx
import TabTasks from "@/app/dashboard/digital-employees/_components/tab-tasks"

// In the page JSX:
<section>
  <h2 className="text-lg font-semibold mb-4">Tasks</h2>
  <TabTasks groupId={id} />
</section>
```

- [ ] **Step 4: Handle implicit → explicit conversion**

When "Add member" is clicked on an implicit team, call `updateGroup` to set `isImplicit: false`:

```typescript
const handleAddMember = async (employeeId: string) => {
  await addMembers(id, [employeeId])
  // If this was an implicit team, convert to explicit
  if (group?.isImplicit) {
    await updateGroup(id, { isImplicit: false })
  }
}
```

Verify that the PATCH endpoint at `app/api/dashboard/groups/[id]/route.ts` accepts `isImplicit` as an updatable field. If not, add it to the allowed fields in the PATCH handler.

- [ ] **Step 5: Normalize status casing**

Check that the status values used in the detail page match what the API returns (uppercase: `"IDLE"`, `"ACTIVE"`, `"DEPLOYING"`, `"STOPPING"`). If the existing page code uses lowercase (e.g., `"idle"`, `"running"`), update to match the API.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/groups/[id]/page.tsx \
        app/dashboard/digital-employees/_components/tab-tasks.tsx
git commit -m "feat: team management page with members, tasks, and instance controls"
```

---

### Task 17: Final TypeScript Verification & Build Check

- [ ] **Step 1: Full TypeScript check**

```bash
bunx tsc --noEmit 2>&1 | head -200
```

Fix all errors.

- [ ] **Step 2: Dev server smoke test**

```bash
bun dev
```

Navigate to:
- `/dashboard/digital-employees` — Employees tab, Teams tab, Tasks tab all load
- `/dashboard/digital-employees?tab=teams` — Teams show with status badges and controls
- `/dashboard/digital-employees/new` — Wizard has Team step
- `/dashboard/groups/{id}` — Team management page loads

- [ ] **Step 3: Commit any remaining fixes**

```bash
git add prisma/schema.prisma lib/ app/ hooks/
git commit -m "fix: resolve remaining TypeScript and runtime errors"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Prisma schema migration | `prisma/schema.prisma`, `prisma/seed-teams.ts` |
| 2 | Clean orchestrator interface | `lib/digital-employee/orchestrator.ts` |
| 3 | Remove solo container methods | `lib/digital-employee/docker-orchestrator.ts` |
| 4 | Update task aggregator | `lib/digital-employee/task-aggregator.ts` |
| 5 | Update deploy/start/stop/resume routes | 4 API route files |
| 6 | Update chat route | `app/api/dashboard/digital-employees/[id]/chat/route.ts` |
| 7 | Update VNC/workspace proxy | `lib/digital-employee/workspace-proxy.ts`, 2 API route dirs |
| 8 | Employee creation with team | `app/api/dashboard/digital-employees/route.ts` |
| 9 | Groups DELETE returns 409 | `app/api/dashboard/groups/[id]/route.ts` |
| 10 | TypeScript verification | All files |
| 11 | Update groups hook | `hooks/use-employee-groups.ts`, `app/api/dashboard/groups/route.ts` |
| 12 | Update team card | `team-card.tsx` |
| 13 | Update teams tab | `tab-teams.tsx` |
| 14 | Employee cards team badge | `page.tsx`, hooks |
| 15 | Employee wizard team step | `new/page.tsx` |
| 16 | Team management page | `groups/[id]/page.tsx`, `tab-tasks.tsx` |
| 17 | Final verification | All files |
