# Digital Employee UX Implementation Plan

3-phase implementation of the 33-step UX overhaul from `DIGITAL-EMPLOYEE-UX-PLAN.md`.

---

## Phase A: Core Dashboard Experience

Make the employee feel alive and observable. Transform the dashboard from a config panel into a live team workspace.

### A1. Activity Tab — New Default View [Medium]

**Reference**: Plan Phase 2

The Activity tab replaces the current config-first landing page. It answers "what is this employee doing right now?"

**Components to build:**
- `app/dashboard/digital-employees/[id]/_components/activity-tab.tsx`
- `app/dashboard/digital-employees/[id]/_components/live-status-banner.tsx`
- `app/dashboard/digital-employees/[id]/_components/activity-feed.tsx`
- `app/dashboard/digital-employees/[id]/_components/daily-summary.tsx`
- `app/dashboard/digital-employees/[id]/_components/recent-outputs.tsx`

**Live Status Banner** (top of Activity tab):
- Current state: "Running task...", "Idle since 2h ago", "Waiting for approval", "Offline"
- Animated heartbeat pulse when running
- Next scheduled run countdown
- Quick action buttons contextual to state (Stop, Run Now, Deploy)

**Activity Feed** (reverse-chronological event stream):
- Run started / completed / failed (with duration, token cost in $)
- Approval requested / approved / rejected
- Tool executed (which tool, success/fail)
- Memory updated, schedule triggered, file modified
- Each event: `[icon] [timestamp] [description] [expand arrow]`
- Expandable to show details (run output, tool params, diff preview)

**Daily Summary Card**:
- "Today: 5 runs, 4 completed, 1 failed, 32k tokens ($0.48)"
- Top tools used, key outputs produced
- Collapsible, shown at top of feed for current day

**Recent Outputs**:
- Last 3-5 outputs/artifacts
- Text outputs truncated with "Show more"
- File outputs with download/preview links

**Data source**: Query `EmployeeRun` + `EmployeeChatMessage` + heartbeat status. May need a new `EmployeeEvent` model or derive events from existing tables.

**API routes:**
- `GET /api/dashboard/digital-employees/[id]/activity` — paginated activity feed
- `GET /api/dashboard/digital-employees/[id]/activity/summary` — daily summary stats

---

### A2. Inline Approvals on Activity Tab [Small]

**Reference**: Plan Phase 2.2

Show pending approvals directly on the Activity tab as alert cards. No separate Inbox tab needed.

- Each card: title, description, request type badge, timestamp, Approve/Reject buttons
- Sorted by urgency (oldest first)
- Pinned above the activity feed

**Component**: `app/dashboard/digital-employees/[id]/_components/inline-approvals.tsx`

---

### A3. List Page — Live Activity + Approval Badges [Small]

**Reference**: Plan Phase 3

Replace static stat badges with live information on employee cards.

**Current card:**
```
[Avatar] [Name]
[Description]
[Status badge] [Autonomy badge] [Run count] [Success %]
```

**New card:**
```
[Avatar] [Name]                    [Status dot + label]
[Current activity text]
[Last output preview - 1 line]
[Run count] [Success %] [Cost today] [Quick Run button]
```

- Current activity: "Processing email batch...", "Idle for 2h", "Awaiting approval"
- Orange badge `[!] 2 approvals pending` if approvals exist, links to Activity tab
- Quick Run button: trigger manual run without navigating to detail

**Files to modify:**
- `app/dashboard/digital-employees/page.tsx`
- Card component used on list page

---

### A4. Consolidate Tabs (9 -> 5) [Medium]

**Reference**: Plan Phase 1

**Current tabs:** Chat, Jobs, Schedule, Inbox, Files, Skills, Tools, Config

**New structure:**
```
/digital-employees/[id]
  Activity    (DEFAULT - live feed, outputs, inline approvals)
  Chat        (persistent, works offline, message queue)
  History     (timeline of runs with expandable details)
  Workspace   (files + IDE merged)
  Settings    (identity + agent + tools & skills + schedule + danger zone)
```

Changes:
- Merge Skills + Tools + Config + Schedule into **Settings** with sub-sections
- Merge Files into **Workspace** (rename, same functionality)
- Replace Jobs with **History** (timeline-based)
- Replace Inbox with inline approvals on **Activity**
- Make **Activity** the default landing tab

**Files to modify:**
- `app/dashboard/digital-employees/[id]/page.tsx` — restructure tab layout
- Tab navigation component

---

### A5. History Timeline (Replace Jobs) [Medium]

**Reference**: Plan Phase 4

Replace flat list of runs with a vertical timeline grouped by day.

```
--- Today ---
  12:15 PM  [Completed]  Manual run - processed 3 tickets    [2.1s] [4.2k tokens]
  12:00 PM  [Approved]   Approval: "Delete old records?"
  09:00 AM  [Completed]  Scheduled run - daily report         [5.3s] [12k tokens]

--- Yesterday ---
  06:00 PM  [Failed]     Webhook trigger - API timeout         [30s] [1.2k tokens]
```

**Expandable run details:**
- Input/trigger context
- Step-by-step execution log (tools called, decisions made)
- Output/artifacts
- Token breakdown (prompt vs completion) + cost in dollars
- Error details if failed

**Filters**: status (completed/failed/running), trigger type, date range, search within outputs

**Components:**
- `app/dashboard/digital-employees/[id]/_components/history-timeline.tsx`
- `app/dashboard/digital-employees/[id]/_components/run-detail-panel.tsx`

---

### A6. Settings Merger [Medium]

**Reference**: Plan Phase 6

Single scrollable page with collapsible sections:

```
Settings
  [Identity]       Name, Description, Avatar
  [Agent]          Assistant selection, Autonomy level, Supervisor
  [Tools & Skills] Combined view with search, toggles, ClawHub install
  [Schedule]       Cron editor, heartbeat config
  [Deployment]     Concurrency, retry, permissions, env vars
  [Danger Zone]    Archive, Delete
```

**Tools & Skills Combined:**
- Single searchable list showing all tools AND skills together
- Filter tabs: All | Tools | Skills | ClawHub
- Each item: icon, name, type badge, toggle, description
- Usage stats per item: "Used 47 times" or "Never used"
- "Add Custom Tool" and "Browse ClawHub" buttons

**Files to modify/create:**
- `app/dashboard/digital-employees/[id]/settings/page.tsx`
- `app/dashboard/digital-employees/[id]/_components/settings-sections.tsx`

---

### A7. Chat Offline Support + Drawer [Medium]

**Reference**: Plan Phase 5

**Offline chat:**
- Allow sending messages when employee is offline
- Queue messages in database
- Deliver queued messages when employee starts
- Show chat history even when container is stopped (read-only replay)

**Chat drawer:**
- Floating chat button on detail page (any tab)
- Opens slide-over drawer with chat interface
- Chat while viewing Activity, History, or Settings
- Does not replace full Chat tab

**Components:**
- `app/dashboard/_components/chat/chat-drawer.tsx`
- Modify `app/dashboard/_components/chat/chat-workspace.tsx` for offline queuing

---

### A8. Heartbeat Animation + Sidebar Presence [Small]

**Reference**: Plan Phase 8.2, 8.3

**Heartbeat animation** (replace static green dot):
- Running: Pulsing green dot with ripple animation (every 2s)
- Idle: Solid green dot (no animation)
- Paused: Solid amber dot
- Offline: Grey dot outline only

**Sidebar presence:**
- Show activity text under name: "Running..." / "Idle 2h" / "Needs approval"
- Sort by: active first, then pending approvals, then idle, then offline

**Files to modify:**
- `app/dashboard/_components/app-sidebar.tsx`
- Create `app/dashboard/_components/employee-status-dot.tsx`

---

### A9. List/Table View Toggle [Small]

**Reference**: Plan Phase 3.3

Add toggle for two views on the list page:
- **Grid** (current, enhanced with A3 changes)
- **List/Table** for power users with sortable columns: Name, Status, Last Active, Runs Today, Pending Approvals, Cost

**Files to modify:**
- `app/dashboard/digital-employees/page.tsx`
- Create `app/dashboard/digital-employees/_components/employee-table-view.tsx`

---

### A10. Cost Display ($) Everywhere [Small]

**Reference**: Plan Phase 8.1

Show costs in dollars alongside token counts everywhere:
- "12,450 tokens ($0.19)" on run cards
- Daily/weekly/monthly cost summaries on Activity tab
- Budget progress bar if `max_cost_per_day_cents` is set

Needs a utility: `lib/digital-employee/cost.ts` with token-to-dollar conversion per model.

---

### A11. Global Approval Banner [Small]

**Reference**: Plan Phase 7

Persistent banner at top of dashboard when any employee has a pending approval:

```
[!] Employee "Support Bot" needs your approval: "Delete customer records older than 90 days"  [Approve] [Reject] [View]
```

- Dismissible but reappears if not actioned
- Real-time toasts for: run completed/failed, approval requested, employee went offline

**Components:**
- `app/dashboard/_components/approval-banner.tsx`
- Hook: `hooks/use-pending-approvals.ts`

---

## Phase B: Intelligence & Integrations

Make the employee smart, trustworthy, and connected. Employees earn trust, set up their own integrations, track goals, and recover from failures.

### B1. Integration Registry + Setup Wizard [Large]

**Reference**: Plan Phase 9

**Integration registry** — schema for integrations that need setup:
```typescript
interface IntegrationDefinition {
  id: string                    // "google-email", "slack", "github"
  name: string
  icon: string
  category: string              // "communication", "developer", "productivity"
  setupType: "oauth" | "api-key" | "chat-guided" | "manual"
  requiredCredentials: string[]
  setupSteps: SetupStep[]
  testConnection?: string       // tool name to verify
}
```

**3 surfaces for credential input:**
- **Settings > Integrations panel** (primary) — grid of integration cards, slide-over setup wizard
- **Chat** (reactive) — employee requests credentials via `request_credentials` tool
- **Tools & Skills** (proactive) — prompt when enabling a tool that needs an integration

**Prisma model:**
```prisma
model EmployeeIntegration {
  id              String   @id @default(cuid())
  employeeId      String
  integrationId   String
  status          String   @default("disconnected")
  credentials     Json     @default("{}")  // encrypted
  metadata        Json     @default("{}")
  connectedAt     DateTime?
  expiresAt       DateTime?
  lastTestedAt    DateTime?
  lastError       String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@unique([employeeId, integrationId])
}
```

**New tools:** `request_credentials`, `configure_integration`, `test_integration`

**API routes:**
- `GET/POST /api/dashboard/digital-employees/[id]/integrations`
- `POST .../integrations/[integrationId]/credentials`
- `POST .../integrations/[integrationId]/test`
- `DELETE .../integrations/[integrationId]`

**Files:**
- `lib/digital-employee/integrations.ts` — registry + definitions
- `app/dashboard/digital-employees/[id]/_components/integration-setup-wizard.tsx`
- `app/dashboard/digital-employees/[id]/_components/integration-status.tsx`

---

### B2. Graduated Autonomy (L1-L4) + Trust Score [Large]

**Reference**: Plan Phase 13

**Autonomy levels:**
```
L1 — Training Wheels    Every action needs approval
L2 — Guided             Routine actions auto-approved, tool calls need approval
L3 — Trusted            Most auto-approved, only high-risk needs approval
L4 — Autonomous         All auto-approved, supervisor notified not asked
```

**Trust score** (calculated automatically):
- Approval acceptance rate (40%)
- Run success rate (30%)
- Error frequency (15%)
- Uptime reliability (15%)

Display: `Trust Score: 87/100  [================....] Level: L3 (Trusted)`

**Auto-promote/demote:**
- Promote: trust score crosses threshold + minimum run count met -> suggest to supervisor
- Demote: 3 consecutive failures or rejection spike -> auto-demote one level, notify

**Risk classification per tool:**
- Low (auto-approve L2+): read data, search, format
- Medium (auto-approve L3+): send message, create file, API calls
- High (always approve L1-L3): delete, send external, financial
- Critical (always approve): access credentials, modify employees

**Files:**
- `lib/digital-employee/trust.ts`
- `app/dashboard/digital-employees/[id]/_components/trust-score.tsx`

---

### B3. Webhook & Event Triggers UI [Medium]

**Reference**: Plan Phase 17

Backend triggers (cron + webhook) already work. Build the dashboard UI.

**Settings > Triggers section:**
- List all trigger configs (cron, webhook, email, watch)
- Each employee gets a unique webhook URL
- Copy URL, regenerate token, enable/disable
- Trigger type options: Cron, Webhook, Email, Watch, Event, Manual

**Prisma model:**
```prisma
model EmployeeWebhook {
  id              String   @id @default(cuid())
  employeeId      String
  type            String   // "webhook", "email", "watch"
  name            String
  token           String   @unique
  config          Json
  filterRules     Json     @default("[]")
  enabled         Boolean  @default(true)
  lastTriggeredAt DateTime?
  triggerCount    Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([employeeId])
}
```

**API routes:**
- `GET/POST /api/dashboard/digital-employees/[id]/triggers`
- `PUT/DELETE .../triggers/[triggerId]`
- `POST /api/webhooks/employees/[id]` — inbound webhook (public, token-authed)

---

### B4. Chat-Guided Setup [Medium]

**Reference**: Plan Phase 9.3

For integrations with `setupType: "chat-guided"`:
1. Clicking "Set up" opens the Chat drawer
2. System message sent: "The user wants to set up [integration]. Guide them through the process."
3. Employee asks questions conversationally
4. Employee collects credentials via `request_credentials` tool
5. Employee calls `configure_integration` + `test_integration`
6. On success, Integrations panel updates to "Connected"

Depends on: B1 (integration registry), A7 (chat drawer).

---

### B5. Goal/Outcome Tracking + Performance Dashboard [Large]

**Reference**: Plan Phase 12

**Prisma model:**
```prisma
model EmployeeGoal {
  id              String   @id @default(cuid())
  employeeId      String
  name            String             // "Resolve 50 tickets per week"
  type            String             // "counter", "threshold", "boolean", "percentage"
  target          Float
  unit            String             // "tickets", "minutes", "score"
  period          String             // "daily", "weekly", "monthly", "total"
  currentValue    Float    @default(0)
  source          String   @default("manual") // "manual" or "auto"
  autoTrackConfig Json?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([employeeId])
}
```

**Goal UI on Activity tab:**
```
Goals This Week
  Resolve tickets    ================....  37/50 (74%)
  Avg response time  ====================  2.3min < 5min
  Customer sat.      ==============......  4.1/5.0
  [Manage Goals]
```

**Goal-based triggering:**
- "Run until goal is met, then pause until next period"
- "Alert supervisor when goal is at risk"
- "Auto-increase schedule frequency if falling behind"

**Performance dashboard:**
- Goal completion history (weekly/monthly trends)
- Cross-employee comparison
- Cost per outcome: "$0.12 per ticket resolved"

**Runtime tool:** `update_goal` — employee self-reports progress
**API:** `GET/POST/DELETE /api/dashboard/digital-employees/[id]/goals`

**Files:**
- `lib/digital-employee/goals.ts`
- `app/dashboard/digital-employees/[id]/_components/goal-tracker.tsx`
- `hooks/use-employee-goals.ts`

---

### B6. Employee Templates + Gallery [Large]

**Reference**: Plan Phase 11

**Template system:**
```typescript
interface EmployeeTemplate {
  id: string
  name: string
  category: string       // "support", "engineering", "marketing", "operations"
  blueprint: {
    soulPrompt: string
    suggestedName: string
    autonomyLevel: string
    tools: string[]
    skills: string[]
    integrations: string[]
    schedules: any[]
    goals: any[]
    sampleTasks: string[]
  }
}
```

**Template gallery** replaces creation wizard step 1:
- "Start from scratch" option for power users
- Category-grouped template cards with integration badges
- Click "Use" -> pre-fills creation wizard

**Post-template flow:**
1. Pre-fill wizard with blueprint values
2. User can customize
3. Create employee
4. Show integration setup wizard if template requires integrations
5. Trigger self-onboarding

**Files:**
- `lib/digital-employee/templates/` — template definitions
- `app/dashboard/digital-employees/new/_components/template-gallery.tsx`

---

### B7. Employee Self-Onboarding Journey [Medium]

**Reference**: Plan Phase 15

First-run onboarding sequence before taking real tasks:

```
Onboarding Checklist
  [x] Read identity files (SOUL.md, IDENTITY.md)
  [x] Read team context (TEAM.md)
  [x] Test tool access
      [x] web_search - working
      [x] gmail_send - NOT CONNECTED (requesting setup)
      [ ] github_create_pr - NOT CONNECTED
  [ ] Introduce self to supervisor
  [ ] Run sample task in sandbox
  [ ] Supervisor approves go-live
```

- Employee tests every enabled tool, reports what's working/broken
- Self-introduces in chat with capabilities summary
- List page shows `[Onboarding] 3/6 steps 50%` badge

**Files:**
- `app/dashboard/digital-employees/[id]/_components/onboarding-checklist.tsx`

---

### B8. OAuth Callback + Credential Storage [Medium]

**Reference**: Plan Phase 9.5

Currently in progress (this session). Finish end-to-end:
- `rewriteOAuthUrls` in chat route (done)
- Next.js OAuth proxy direct mode (done)
- Gateway `/oauth2callback` handler (done)
- Credential encryption + storage in `EmployeeIntegration`
- Masked display with eye toggle

---

### B9. Sandbox Mode [Medium]

**Reference**: Plan Phase 13.5

New employees start in sandbox by default:
- All tool calls simulated with mock responses
- Outputs tagged `[SANDBOX]`, not delivered externally
- Supervisor reviews sandbox outputs
- "Go Live" button transitions from sandbox to L1

---

### B10. Error Recovery + Smart Retry [Medium]

**Reference**: Plan Phase 14

**Failure classification:** transient (timeout, rate limit) vs permanent (auth error, logic bug)

**Behavior:**
- Transient: auto-retry with exponential backoff
- Permanent: store in memory, notify supervisor
- Ambiguous: retry once, then escalate

**Failure pattern detection:**
- Track patterns across runs ("Gmail API timeout - 4 occurrences")
- Suggest fixes: "Check Gmail quota, increase timeout"

**Post-failure learning:**
- Store failure + context in employee memory
- Next similar task includes: "Note: This previously failed because [reason]"
- Track if employee avoids repeat failures (feeds trust score)

---

## Phase C: Collaboration & Governance

Make employees work as a team with proper oversight. Inter-employee communication, audit trails, and access control.

### C1. Inter-Employee Messaging [Large]

**Reference**: Plan Phase 10.1-10.3

4 communication types:
1. **Message** (fire-and-forget) — FYI notifications
2. **Task delegation** (request + result) — delegate to specialist, wait for response
3. **Handoff** (transfer ownership) — pass context to next employee in pipeline
4. **Broadcast** (one-to-many) — announce to team/tag group

Platform is always the relay. Containers never talk directly.

**Prisma model:**
```prisma
model EmployeeMessage {
  id               String   @id @default(cuid())
  organizationId   String
  fromEmployeeId   String
  toEmployeeId     String?
  toGroup          String?
  type             String            // "message", "task", "handoff", "broadcast"
  subject          String
  content          String   @db.Text
  attachments      Json     @default("[]")
  priority         String   @default("normal")
  status           String   @default("pending")
  requiresApproval Boolean  @default(false)
  approvalStatus   String?
  responseContent  String?  @db.Text
  responseData     Json?
  respondedAt      DateTime?
  parentMessageId  String?
  runId            String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@index([toEmployeeId, status])
  @@index([fromEmployeeId])
  @@index([organizationId])
}
```

**Runtime tools:** `send_message`, `check_inbox`, `reply_message`, `list_employees`

**API routes:**
- `POST /api/runtime/messages/send`
- `GET /api/runtime/messages/inbox`
- `POST /api/runtime/messages/[id]/reply`
- `GET /api/runtime/employees/list`

---

### C2. Inter-Employee Task Delegation [Large]

**Reference**: Plan Phase 10.2

Extension of C1 for task-specific flows:
- `waitForResponse: true` — sender pauses until recipient responds
- `waitForResponse: false` — sender continues, response lands in inbox
- Auto-start: if recipient is offline, platform can auto-start its container
- Task status tracking: pending -> delivered -> in-progress -> completed/failed

---

### C3. TEAM.md Workspace File Generation [Small]

**Reference**: Plan Phase 10.6

Auto-generated workspace file listing coworkers:
```markdown
# Team
## Coworkers
- **ResearchBot** - Web research and data gathering. Status: Active.
- **EditorBot** - Reviews written content. Status: Active.
## Communication
- Use `send_message` to message a coworker
- Use `check_inbox` to see replies
```

Generated by `package-generator.ts` from org's employee list.

---

### C4. Global Message Center [Medium]

**Reference**: Plan Phase 10.5

New dashboard page: `/dashboard/messages`

Shows all inter-employee communications:
- Filter by employee, type, status
- Each message card: sender, recipient, type badge, preview, status
- Click to view full message thread

---

### C5. Audit Trail + Immutable Log [Medium]

**Reference**: Plan Phase 16

**Prisma model:**
```prisma
model AuditLog {
  id              String   @id @default(cuid())
  organizationId  String
  employeeId      String?
  userId          String?
  action          String    // "tool.execute", "approval.respond", "credential.access"
  resource        String    // "tool:gmail_send", "employee:abc123"
  detail          Json
  ipAddress       String?
  riskLevel       String    // "low", "medium", "high", "critical"
  createdAt       DateTime @default(now())
  @@index([organizationId, createdAt])
  @@index([employeeId, createdAt])
  @@index([action])
}
```

**Audit dashboard** at `/dashboard/audit`:
- Filterable log: employee, date range, risk level, action type
- Export CSV
- Runtime tool: `POST /api/runtime/audit/log` — employee writes audit entries

---

### C6. RBAC (Role-Based Access Control) [Large]

**Reference**: Plan Phase 16.3

```
Owner   — full access, billing, delete org
Admin   — create/delete employees, manage integrations, view audit
Manager — configure employees they supervise, approve, view activity
Viewer  — read-only access to activity and outputs
```

Permission matrix enforced across all API routes and UI components.

---

### C7. Supervisor Message Approval/Blocking [Medium]

**Reference**: Plan Phase 10.5

For supervised employees, supervisor controls:
- Can send messages / delegate tasks / hand off work / auto-start others
- "Require approval before sending tasks" — messages pause like approvals
- Approval card in Activity tab + global banner

---

### C8. Visual Cron Builder [Medium]

**Reference**: Plan Phase 6.3

Dropdown-based schedule builder (not raw cron strings):
- Frequency selector: hourly, daily, weekly, monthly, custom
- "Next 5 occurrences" preview
- Timezone selector with current time display

Replace raw cron input in Settings > Schedule.

---

### C9. Pre-built Integration Definitions [Medium]

**Reference**: Plan Phase 9.6

Ship definitions for common integrations:

| Integration | Setup Type | Credentials |
|-------------|-----------|-------------|
| Gmail | oauth | Client ID, Secret, Refresh Token |
| Google Calendar | oauth | Shared with Gmail |
| Google Drive | oauth | Shared with Gmail |
| Slack | api-key | Bot Token, Signing Secret |
| GitHub | api-key | Personal Access Token |
| Linear | api-key | API Key |
| Notion | api-key | Integration Token |
| Discord | api-key | Bot Token |
| SMTP Email | manual | Host, Port, User, Password |
| Custom MCP | chat-guided | URL, Auth (varies) |
| Custom API | manual | Base URL, API Key, Headers |

---

### C10. Community Template Marketplace [Large]

**Reference**: Plan Phase 11.5

- Organizations save employee configs as templates
- Share within org or publish to public gallery
- Template versioning: update template, optionally propagate to employees using it

---

### C11. Handoff Pipelines [Large]

**Reference**: Plan Phase 10.7

Visual multi-employee workflow builder:
```
Pipeline: "Blog Post Production"
  Step 1: ResearchBot  -> research topic
  Step 2: WriterBot    -> draft post
  Step 3: EditorBot    -> review and polish
  Step 4: PublisherBot -> format and publish
```

Each step auto-hands-off to the next on completion. Visual pipeline builder in dashboard (future).

---

### C12. Data Retention + Export + Compliance [Medium]

**Reference**: Plan Phase 16.4

- Configurable retention: auto-archive runs/messages after X days (default: 90)
- Right to delete: purge all data for a specific employee
- Data export: full dump as JSON/CSV
- Credential rotation alerts: "GitHub token expires in 7 days"

---

## Summary

| Phase | Steps | Focus | Size |
|-------|-------|-------|------|
| **A** | A1-A11 | Core dashboard UX — make employees feel alive | 4S + 4M = 8 items |
| **B** | B1-B10 | Intelligence — trust, integrations, goals, templates | 3L + 5M + 2S = 10 items |
| **C** | C1-C12 | Collaboration — team comms, audit, governance | 4L + 5M + 1S = 12 items |

**Dependencies:**
- A4 (tab consolidation) should land before building individual tab content
- A7 (chat drawer) needed before B4 (chat-guided setup)
- B1 (integration registry) needed before B4 and B8
- B2 (trust/autonomy) needed before B9 (sandbox mode)
- C1 (messaging) needed before C2, C3, C4, C7
- C5 (audit) needed before C6 (RBAC)
