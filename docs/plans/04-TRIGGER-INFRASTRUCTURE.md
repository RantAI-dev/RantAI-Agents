# 04 — Trigger Infrastructure

## Problem

Workflow triggers are schema-only placeholders. The `trigger` JSON field on `Workflow` supports `manual`, `webhook`, `schedule`, and `event` types, and the UI lets you configure cron expressions and event names — but no scheduler or event bus exists to actually fire them.

- **Manual**: Works (UI "Run" button)
- **Webhook**: Works (public `POST /api/workflows/[apiKey]`)
- **Schedule (cron)**: UI configurable, but nothing polls or dispatches. Dead code.
- **Event**: UI configurable, but no event bus exists. Dead code.

## Why This Matters

Digital Employees run on schedules and events — "every day at 8 AM, write a LinkedIn post" or "when a new lead comes in, draft an email." Without trigger infrastructure, employees can only work when manually poked.

## Solution

### Phase 1: Cron Scheduler (Minimum Viable)

For the **current Next.js platform** (before Firecracker runtime), implement a lightweight cron scheduler:

#### Option A: In-Process (Simplest, works for small scale)

```typescript
// lib/scheduler/cron-scheduler.ts

import Cron from "croner"  // or node-cron
import { prisma } from "@/lib/prisma"
import { executeWorkflow } from "@/lib/workflow/engine"

const activeJobs = new Map<string, Cron>()

export async function initScheduler() {
  // Load all active workflows with schedule triggers
  const workflows = await prisma.workflow.findMany({
    where: {
      status: "ACTIVE",
      trigger: { path: ["type"], equals: "schedule" },
    },
  })

  for (const wf of workflows) {
    const trigger = wf.trigger as TriggerConfig
    if (trigger.schedule) {
      scheduleWorkflow(wf.id, trigger.schedule)
    }
  }
}

export function scheduleWorkflow(workflowId: string, cronExpression: string) {
  // Remove existing job if any
  activeJobs.get(workflowId)?.stop()

  const job = new Cron(cronExpression, async () => {
    await executeWorkflow(workflowId, {
      triggeredBy: "scheduler",
      triggeredAt: new Date().toISOString(),
    })
  })

  activeJobs.set(workflowId, job)
}

export function unscheduleWorkflow(workflowId: string) {
  activeJobs.get(workflowId)?.stop()
  activeJobs.delete(workflowId)
}
```

Initialize in Next.js instrumentation file:
```typescript
// instrumentation.ts (Next.js)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initScheduler } = await import("@/lib/scheduler/cron-scheduler")
    await initScheduler()
  }
}
```

**Pros**: Zero infrastructure. Works immediately.
**Cons**: Dies when the Next.js process restarts. Not distributed. Single-instance only.

#### Option B: Redis-Based (Production-ready)

Use BullMQ (Redis-backed job queue) for durable, distributed scheduling:

```typescript
// lib/scheduler/queue-scheduler.ts

import { Queue, Worker } from "bullmq"
import { executeWorkflow } from "@/lib/workflow/engine"

const workflowQueue = new Queue("workflow-triggers", {
  connection: { url: process.env.REDIS_URL },
})

// Schedule a workflow
export async function scheduleWorkflow(workflowId: string, cronExpression: string) {
  await workflowQueue.upsertJobScheduler(
    `cron-${workflowId}`,
    { pattern: cronExpression },
    {
      name: "execute-workflow",
      data: { workflowId, triggeredBy: "scheduler" },
    }
  )
}

// Worker processes jobs
const worker = new Worker("workflow-triggers", async (job) => {
  const { workflowId } = job.data
  await executeWorkflow(workflowId, job.data)
}, {
  connection: { url: process.env.REDIS_URL },
})
```

**Pros**: Survives restarts. Distributed. Has retry, backoff, dead-letter. Production-grade.
**Cons**: Requires Redis. More setup.

#### Recommendation

Start with **Option A** for development and local testing. Switch to **Option B** when deploying to production or when building the Digital Employee runtime (which will need a task queue anyway).

### Phase 2: Event Bus

For event-driven triggers ("when X happens, run this workflow"):

```typescript
// lib/events/event-bus.ts

type EventHandler = (payload: unknown) => Promise<void>
const handlers = new Map<string, EventHandler[]>()

export function on(eventName: string, handler: EventHandler) {
  const list = handlers.get(eventName) || []
  list.push(handler)
  handlers.set(eventName, list)
}

export async function emit(eventName: string, payload: unknown) {
  const list = handlers.get(eventName) || []
  await Promise.allSettled(list.map(h => h(payload)))
}
```

At startup, register handlers for all event-triggered workflows:
```typescript
const eventWorkflows = await prisma.workflow.findMany({
  where: { status: "ACTIVE", trigger: { path: ["type"], equals: "event" } },
})

for (const wf of eventWorkflows) {
  const trigger = wf.trigger as TriggerConfig
  if (trigger.eventName) {
    on(trigger.eventName, async (payload) => {
      await executeWorkflow(wf.id, { event: trigger.eventName, payload })
    })
  }
}
```

Platform code can then `emit("lead.created", leadData)` or `emit("document.uploaded", docData)` to trigger workflows.

### Phase 3: Scheduler Management UI

Add to the workflow editor:
- **Schedule trigger config**: Cron expression builder (visual), timezone selector, next-run preview
- **Workflow status effects**: When workflow status changes to `ACTIVE`, register its schedule. When `PAUSED`, unregister.
- **Run history**: Show recent cron-triggered runs in the workflow detail page

### How This Connects to Digital Employees

In the Digital Employee runtime:
- The platform's scheduler fires the trigger
- The orchestrator spins up a microVM for the employee
- The employee's workflow executes inside the VM with full agent capabilities
- VM tears down after completion

The scheduler doesn't need to know about microVMs — it just calls an execution endpoint. The orchestrator decides whether to run locally (dev mode) or in a VM (production mode).

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `lib/scheduler/cron-scheduler.ts` | Create — cron job management |
| `lib/events/event-bus.ts` | Create — simple event emitter |
| `instrumentation.ts` | Create/modify — init scheduler on startup |
| `app/api/dashboard/workflows/[id]/route.ts` | Modify — register/unregister schedule on status change |
| `package.json` | Add `croner` or `bullmq` dependency |

## Dependencies

- Independent of 01-03 (can be built in parallel)
- Required before Digital Employee runtime (employees need triggers)
