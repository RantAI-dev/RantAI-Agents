# Team Container Lifecycle Redesign

## Problem

The current deploy/start/stop cycle is unreliable. Three separate operations (deploy → start → stop) create split-brain states where DB says one thing and Docker says another. After a page refresh the UI frequently shows "Start" even though the container was just started, because:

1. Deploy sets `status = "ACTIVE"` but writes no container fields
2. Start writes container fields but doesn't update `status`
3. The UI derives "Running" from `status === "ACTIVE" && containerPort !== null` — a fragile heuristic
4. If any step fails mid-way, partial state is left in the DB with no recovery
5. There's no "un-deploy" so `status = "ACTIVE"` can never go back to `IDLE`, making delete impossible

Additionally, individual employee deploy/start/stop routes still exist even though lifecycle is now managed at the team level.

## Design

### Status Model

Two DB values only:

| DB `status` | Meaning | Container fields |
|-------------|---------|-----------------|
| `IDLE` | No container running | All null |
| `RUNNING` | Container confirmed alive | All populated |

No `ACTIVE`, `DEPLOYED`, `DEPLOYING`, `STOPPING` for **group** status. Spinners are local React state.

**Note:** Employee-level `status` ("DRAFT", "ACTIVE", "PAUSED", etc.) is a separate concept and stays unchanged. Employees are marked "ACTIVE" when their team starts — this is employee readiness, not container state.

**Reconciliation:** On every list/detail fetch, if DB says `RUNNING` but Docker inspect says the container is dead/missing, auto-correct to `IDLE` and clear container fields. Use `docker.listContainers()` to batch-check all containers in one call instead of N sequential inspects. DB can never be stale for more than one read cycle.

### Operations

Three operations. No more deploy.

#### Start (merges old deploy + start)

Single atomic operation:

1. Validate group exists and has members
2. If `containerId` set: inspect Docker. If running, return early (idempotent). If dead/missing, remove container and clear DB fields.
3. Create/reuse Docker volume `emp-group-vol-{groupId}`
4. Generate group package via `generateGroupPackage()`, write to volume
5. Ensure employee Docker image exists
6. Create runtime token (JWT, 24h)
7. Create container with `MODE=group-gateway`
8. Start container
9. Inspect for mapped ports, confirm container is running
10. **Single atomic DB update:** `status = "RUNNING"`, `containerId`, `containerPort`, `noVncPort`, `gatewayToken`
11. Mark all member employees `status = "ACTIVE"`, `lastActiveAt = now()`

**On failure at any step:** Clean up any created container, DB stays `IDLE`. Return error.

#### Stop

1. Read group from DB
2. If `containerId` set: stop container (10s grace), remove it. Silently succeed if already gone.
3. **Single atomic DB update:** `status = "IDLE"`, clear `containerId`/`containerPort`/`noVncPort`/`gatewayToken`

Idempotent — calling stop on an already-idle group is a no-op.

#### Delete

1. If container is running: call stop logic first (auto-stop before delete)
2. Remove Docker volume `emp-group-vol-{groupId}`
3. Delete DB record

No precondition deadlocks. Members must still be removed first (Prisma `onDelete: Restrict`).

### API Routes

| Route | Change |
|-------|--------|
| `POST /api/dashboard/groups/[id]/start` | Rewrite — calls new merged `orchestrator.startGroup()` |
| `POST /api/dashboard/groups/[id]/stop` | Update — sets `status = "IDLE"` |
| `POST /api/dashboard/groups/[id]/deploy` | **Delete this route** |
| `DELETE /api/dashboard/groups/[id]` | Remove `status !== "IDLE"` guard — delete auto-stops |
| `GET /api/dashboard/groups` | Update reconciliation to set `status = "IDLE"` (not just clear fields) |

RBAC: `employee.create` for start, `employee.delete` for stop and delete (consistent).

### Orchestrator

`DockerOrchestrator` methods become:

| Method | Description |
|--------|-------------|
| `startGroup(groupId)` | Merged deploy+start. Returns `{ containerId, port }` |
| `stopGroup(groupId)` | Stop container + set `IDLE` |
| `deleteGroup(groupId)` | Stop + remove volume + delete record |
| `getGroupContainerUrl(groupId)` | Unchanged |

Old methods removed: `deployGroup()`, `startGroupContainer()`, `stopGroupContainer()`.

Interface in `orchestrator.ts` updated to match.

### Remove Employee-Level Lifecycle Code

Since lifecycle now lives at the team level, remove all individual employee deploy/start/stop:

**Delete 3 API route files:**
- `app/api/dashboard/digital-employees/[id]/deploy/route.ts`
- `app/api/dashboard/digital-employees/[id]/start/route.ts`
- `app/api/dashboard/digital-employees/[id]/stop/route.ts`

**Update `hooks/use-digital-employee.ts`:**
- Remove `deploy()`, `start()`, `stop()` callbacks and their exports

**Update `app/dashboard/digital-employees/[id]/page.tsx`:**
- Remove deploy/start/stop handlers, state, buttons, DeployProgressDialog
- Remove `autoRedeploy` callback and its usage in child component props
- Remove `containerRunning`/`containerLoading` state and the useEffect that fetches container status

### Frontend

**Hook `use-employee-groups.ts`:**
- Remove `deployGroup` callback
- `startGroup`, `stopGroup`, `deleteGroup` stay (with `try/finally` + `fetchGroups`)

**Team card `team-card.tsx`:**
- Remove `onDeploy` prop
- Two states: `IDLE` → Start button, `RUNNING` → Stop button
- Remove `DEPLOYING`/`STOPPING`/`DEPLOYED` phantom status handling

**Team detail page `groups/[id]/page.tsx`:**
- Remove `handleDeploy` and Deploy button
- Remove `displayStatus` derivation hack
- Two buttons: Start (when `IDLE`) / Stop (when `RUNNING`)
- Delete dialog: remove "must be Idle" warning, delete always works (auto-stops)

**Status styles simplify to:**

| Status | Label | Style |
|--------|-------|-------|
| `IDLE` | Idle | muted |
| `RUNNING` | Running | green |

### What Stays Unchanged

- Docker volume structure and naming (`emp-group-vol-{groupId}`)
- Agent runner (`docker/employee/agent-runner/index.js`) — reads same volume paths
- Group package generator (`group-package-generator.ts`)
- Runtime auth (`runtime-auth.ts`)
- Prisma schema fields (same columns, `status` values change from `IDLE`/`ACTIVE` to `IDLE`/`RUNNING`)
- WhatsApp webhook proxy
- VNC route
- Container env vars and labels

### Files Changed

**Orchestrator layer:**

| File | Action |
|------|--------|
| `lib/digital-employee/docker-orchestrator.ts` | Rewrite — merge deploy+start into `startGroup()`, update `stopGroup()`, add `deleteGroup()` |
| `lib/digital-employee/orchestrator.ts` | Update interface to match new methods |

**Group API routes:**

| File | Action |
|------|--------|
| `app/api/dashboard/groups/[id]/start/route.ts` | Rewrite — call `orchestrator.startGroup()` |
| `app/api/dashboard/groups/[id]/stop/route.ts` | Update — call `orchestrator.stopGroup()` |
| `app/api/dashboard/groups/[id]/deploy/route.ts` | **Delete** |
| `app/api/dashboard/groups/[id]/route.ts` | Update DELETE handler — remove `status !== "IDLE"` guard, auto-stop before delete |
| `app/api/dashboard/groups/route.ts` | Update reconciliation — batch Docker check, set `status = "IDLE"` on dead containers, handle `ACTIVE` → `IDLE`/`RUNNING` migration |

**Employee API routes (delete lifecycle routes):**

| File | Action |
|------|--------|
| `app/api/dashboard/digital-employees/[id]/deploy/route.ts` | **Delete** |
| `app/api/dashboard/digital-employees/[id]/start/route.ts` | **Delete** |
| `app/api/dashboard/digital-employees/[id]/stop/route.ts` | **Delete** |
| `app/api/dashboard/digital-employees/[id]/resume/route.ts` | Rewrite — use `orchestrator.startGroup()` instead of old `deployGroup()` + `startGroupContainer()` |
| `app/api/dashboard/digital-employees/[id]/chat/route.ts` | Update — change `status === "ACTIVE"` to `status === "RUNNING"`, use `startGroup()` |

**Hooks:**

| File | Action |
|------|--------|
| `hooks/use-employee-groups.ts` | Remove `deployGroup` callback |
| `hooks/use-digital-employee.ts` | Remove `deploy`/`start`/`stop` callbacks and exports |

**Frontend pages/components:**

| File | Action |
|------|--------|
| `app/dashboard/groups/[id]/page.tsx` | Simplify to Start/Stop/Delete, remove `displayStatus` hack |
| `app/dashboard/digital-employees/_components/team-card.tsx` | Simplify to Start/Stop, remove `onDeploy` prop |
| `app/dashboard/digital-employees/_components/tab-teams.tsx` | Remove `deployGroup` destructure, remove `onDeploy` prop passing |
| `app/dashboard/digital-employees/[id]/page.tsx` | Remove lifecycle UI (deploy/start/stop handlers, buttons, progress dialog, `autoRedeploy`) |
| `app/dashboard/digital-employees/[id]/_components/tab-activity.tsx` | Remove `onDeploy` prop, update `status === "ACTIVE"` checks |
| `app/dashboard/digital-employees/[id]/_components/tab-chat.tsx` | Update `status === "ACTIVE"` checks |
| `app/dashboard/digital-employees/[id]/chat/page.tsx` | Update `status === "ACTIVE"` checks |

**Status references to update (employee `ACTIVE` stays, group `ACTIVE` removed):**

| File | Action |
|------|--------|
| `lib/digital-employee/shared-constants.ts` | Keep `ACTIVE` for employee status, remove any group `DEPLOYED`/`DEPLOYING` labels |
| `lib/digital-employee/task-aggregator.ts` | `assignee_online` check — employee-level `ACTIVE` is correct, no change needed |
| `app/api/runtime/employees/list/route.ts` | Employee-level `ACTIVE` filter — no change needed |
| `hooks/use-digital-employees.ts` | Employee-level type — no change needed |

### Concurrency Guard

The start route checks if a container is already running before creating a new one (idempotent early return). To prevent TOCTOU races from double-clicks or concurrent requests, the API route handler uses an in-memory `Set<string>` of groupIds currently being started. If the groupId is already in the set, return 409 immediately. The set entry is removed in a `finally` block.

This is a simple, process-local guard. It doesn't survive server restarts, but that's fine — the Docker inspect at the top of `startGroup()` catches any containers that were created by a previous process.

### Data Migration

The reconciliation in the list endpoint handles the `ACTIVE` → `IDLE`/`RUNNING` transition automatically:
- On first fetch after deployment, any group with `status = "ACTIVE"` will have its container checked
- If container alive → set `status = "RUNNING"`
- If container dead/gone → set `status = "IDLE"`, clear container fields

As a safety net, the reconciliation treats any `status` value that is not `IDLE` as potentially having a container to check. This covers `ACTIVE` and any other unexpected values.

### Known Limitations

- **Token expiry (24h):** Runtime JWT expires after 24 hours. Long-running containers will lose API access. This is pre-existing and out of scope for this redesign.
- **No restart command:** To update config, user must Stop then Start. A future "Restart" operation could be added as sugar.
