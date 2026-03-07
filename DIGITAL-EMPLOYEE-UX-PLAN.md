# Digital Employee UX Overhaul Plan

## Goal

Transform the digital employee UI from an admin/config panel into a team management workspace where employees feel alive, observable, and interactive.

---

## Phase 1: Restructure Navigation & Layout

### 1.1 Consolidate Tabs (9 -> 5)

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

**Changes:**
- Merge "Skills" + "Tools" + "Config" + "Schedule" into a single **Settings** page with sub-sections
- Merge "Files" into **Workspace** (rename, same functionality)
- Replace "Jobs" with **History** (timeline-based, not a flat list)
- Replace "Inbox" with inline approvals on the **Activity** tab
- Make **Activity** the default landing tab instead of config

### 1.2 Widen the Sidebar

- Current sidebar is 48px collapsed / 176px expanded — too narrow for labels
- Change to 200px fixed on desktop with icon + label always visible
- On mobile, keep icon-only collapsible behavior
- Group into: **Interact** (Activity, Chat, History) and **Configure** (Workspace, Settings)

---

## Phase 2: Activity Tab (New Default View)

### 2.1 Live Status Banner

Top of the Activity tab — a prominent banner showing:

- Current state: "Running task...", "Idle since 2h ago", "Waiting for approval", "Offline"
- Animated heartbeat pulse when running
- Next scheduled run countdown: "Next run in 2h 15m"
- Quick action buttons contextual to state (Stop, Run Now, Deploy)

### 2.2 Pending Approvals (Inline)

- Show pending approvals directly on the Activity tab as alert cards
- Each card: title, description, request type badge, timestamp, Approve/Reject buttons
- No need to navigate to a separate Inbox tab
- Sorted by urgency (oldest first)

### 2.3 Activity Feed

A reverse-chronological feed of events:

- Run started / completed / failed (with duration, token cost in $)
- Approval requested / approved / rejected
- Tool executed (which tool, success/fail)
- Memory updated
- Schedule triggered
- File modified

Each event is a compact row:
```
[icon] [timestamp] [event description]        [expand arrow]
```

Expandable to show details (run output, tool parameters, diff preview).

### 2.4 Daily Summary Card

Auto-generated from daily notes and run data:

- "Today: 5 runs, 4 completed, 1 failed, 32k tokens ($0.48)"
- Top tools used
- Key outputs or artifacts produced
- Collapsible, shown at the top of the feed for the current day

### 2.5 Recent Outputs

A section showing the last 3-5 outputs/artifacts:

- Text outputs truncated with "Show more"
- File outputs with download/preview links
- Links to PRs, messages, or external artifacts created

---

## Phase 3: Revamp the List Page

### 3.1 Live Activity on Cards

Replace static stat badges with live information:

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

- "Current activity" examples: "Processing email batch...", "Idle for 2h", "Awaiting approval", "Scheduled: next run 1h"
- Last output preview: truncated single line of the most recent run output
- Quick Run button: trigger a manual run without navigating to detail page

### 3.2 Approval Badges on Cards

If an employee has pending approvals, show an orange badge on the card:
```
[!] 2 approvals pending
```

Clicking it navigates directly to the Activity tab (where approvals are inline).

### 3.3 View Toggle

Add a toggle for two views:
- **Grid** (current, enhanced with above changes)
- **List/Table** view for power users with sortable columns: Name, Status, Last Active, Runs Today, Pending Approvals, Cost

---

## Phase 4: History Tab (Replace Jobs)

### 4.1 Timeline View

Replace the flat list of runs with a vertical timeline:

```
--- Today ---
  12:15 PM  [Completed]  Manual run - processed 3 tickets    [2.1s] [4.2k tokens]
  12:00 PM  [Approved]   Approval: "Delete old records?"
  09:00 AM  [Completed]  Scheduled run - daily report         [5.3s] [12k tokens]

--- Yesterday ---
  06:00 PM  [Failed]     Webhook trigger - API timeout         [30s] [1.2k tokens]
  09:00 AM  [Completed]  Scheduled run - daily report          [4.8s] [11k tokens]
```

### 4.2 Expandable Run Details

Click a run to expand and show:
- Input/trigger context
- Step-by-step execution log (tools called, decisions made)
- Output/artifacts
- Token breakdown (prompt vs completion)
- Cost in dollars
- Error details if failed

### 4.3 Filters

- Filter by: status (completed/failed/running), trigger type (manual/schedule/webhook), date range
- Search within run outputs

---

## Phase 5: Chat Improvements

### 5.1 Offline Chat Support

- Allow sending messages when the employee is offline
- Queue messages in the database
- Deliver queued messages when the employee starts
- Show chat history even when container is stopped (read-only replay)

### 5.2 Chat Drawer Option

- Add a floating chat button on the detail page (any tab)
- Opens a slide-over drawer with the chat interface
- Allows chatting while viewing Activity, History, or Settings
- Does not replace the full Chat tab (which remains for focused conversation)

---

## Phase 6: Settings Tab (Merged Config)

### 6.1 Sub-Section Layout

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

### 6.2 Tools & Skills Combined

- Single searchable list showing all tools AND skills together
- Filter tabs: All | Tools | Skills | ClawHub
- Each item: icon, name, type badge (tool/skill/clawhub), toggle, description
- "Add Custom Tool" and "Browse ClawHub" buttons at top
- Usage stats per item: "Used 47 times" or "Never used" (greyed out hint to disable)

### 6.3 Schedule Section

Move ScheduleMonitor into Settings. Add:
- Visual cron builder (dropdown-based, not raw cron strings)
- "Next 5 occurrences" preview
- Timezone selector with current time display

---

## Phase 7: Global Notifications

### 7.1 Approval Notification Banner

When any employee has a pending approval, show a persistent banner at the top of the dashboard:

```
[!] Employee "Support Bot" needs your approval: "Delete customer records older than 90 days"  [Approve] [Reject] [View]
```

Dismissible, but reappears if not actioned.

### 7.2 Toast Notifications

Real-time toasts for:
- Run completed / failed
- Approval requested
- Employee went offline unexpectedly
- Schedule triggered

Use existing Sonner toast system.

---

## Phase 8: Visual Polish

### 8.1 Token Cost Display

Show costs in dollars alongside token counts everywhere:
- "12,450 tokens ($0.19)" on run cards
- Daily/weekly/monthly cost summaries on the Activity tab
- Budget progress bar if `max_cost_per_day_cents` is set

### 8.2 Heartbeat Animation

Replace static green dot with:
- **Running**: Pulsing green dot with ripple animation (every 2s)
- **Idle**: Solid green dot (no animation)
- **Paused**: Solid amber dot
- **Offline**: Grey dot with no fill (outline only)

### 8.3 Employee Presence in Sidebar

Enhance sidebar employee list:
- Show activity text under name: "Running..." / "Idle 2h" / "Needs approval"
- Sort by: active first, then pending approvals, then idle, then offline

---

## Phase 9: Integration Setup & Skill Configuration

Skills and tools often need **credentials, OAuth tokens, API keys, or interactive CLI setup** before they work. Currently the system only has `deploymentConfig.env` for static key-value pairs — there's no guided flow. This phase adds a proper onboarding/setup experience for integrations.

### 9.1 Integration Registry

Define a schema for integrations that need setup. Each integration declares:

```typescript
interface IntegrationDefinition {
  id: string                    // "google-email", "slack", "github"
  name: string                  // "Google Email (Gmail)"
  icon: string                  // icon key
  category: string              // "communication", "developer", "productivity"
  description: string
  setupType: "oauth" | "api-key" | "chat-guided" | "manual"
  requiredCredentials: string[] // ["GOOGLE_CLIENT_ID", "GOOGLE_REFRESH_TOKEN"]
  setupSteps: SetupStep[]       // ordered steps for guided setup
  testConnection?: string       // tool name to verify the integration works
}

interface SetupStep {
  id: string
  title: string
  type: "oauth-redirect" | "input" | "chat-instruction" | "verify"
  description: string
  fields?: SetupField[]         // for "input" type
  oauthProvider?: string        // for "oauth-redirect" type
  chatPrompt?: string           // for "chat-instruction" type
}

interface SetupField {
  key: string                   // maps to env var name
  label: string
  type: "text" | "secret" | "select"
  placeholder?: string
  helpUrl?: string              // "How to get this value"
  required: boolean
}
```

### 9.2 Where the User Provides Credentials (3 Surfaces)

There are 3 places a user might need to provide credentials. Each serves a different moment:

#### Surface A: Settings > Integrations Panel (Primary)

This is the **main place**. A dedicated "Integrations" sub-section in Settings, not buried inside Tools & Skills.

```
Settings
  [Identity]
  [Agent]
  [Integrations]    <-- new dedicated section
  [Tools & Skills]
  [Schedule]
  [Deployment]
  [Danger Zone]
```

The Integrations section shows a grid of available integrations:

```
┌─────────────────────────────────────────────────────────┐
│  Integrations                                           │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Google icon   │  │ Slack icon   │  │ GitHub icon  │  │
│  │ Gmail         │  │ Slack        │  │ GitHub       │  │
│  │ [Connected]   │  │ [Set up ->]  │  │ [Set up ->]  │  │
│  │ user@mail.com │  │              │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Linear icon  │  │ Notion icon  │  │ + Custom     │  │
│  │ Linear       │  │ Notion       │  │ Add API      │  │
│  │ [Set up ->]  │  │ [Set up ->]  │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

Clicking "Set up" opens a **right-side slide-over panel** (not a modal — keeps context):

```
┌─ Settings ──────────────────┬─ Connect Gmail ───────────┐
│                              │                           │
│  [Integrations grid...]      │  Step 1 of 3              │
│                              │  ─────────────────────    │
│                              │                           │
│                              │  Sign in with Google to   │
│                              │  allow email access.      │
│                              │                           │
│                              │  [Sign in with Google]    │
│                              │                           │
│                              │  ── or provide manually ──│
│                              │                           │
│                              │  Client ID                │
│                              │  [____________________]   │
│                              │                           │
│                              │  Client Secret            │
│                              │  [____________________]   │
│                              │                           │
│                              │  Refresh Token            │
│                              │  [____________________]   │
│                              │                           │
│                              │  [How to get these ->]    │
│                              │                           │
│                              │  [Back]  [Next ->]        │
│                              │                           │
└──────────────────────────────┴───────────────────────────┘
```

After connecting, the card updates to show status:
```
┌──────────────┐
│ Google icon   │
│ Gmail         │
│ [Connected]   │  green badge
│ user@mail.com │  account identifier
│ [Manage]      │  -> Re-authorize, Disconnect, Test
└──────────────┘
```

#### Surface B: Chat — Employee Requests Credentials (Reactive)

When an employee is running and hits a tool that needs credentials it doesn't have, it **asks the user in chat** via a special approval-style message:

```
┌─────────────────────────────────────────────────────────┐
│  Employee: I tried to create a GitHub PR but I don't    │
│  have access. I need a GitHub Personal Access Token     │
│  with `repo` scope.                                     │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Provide GitHub Token                              │  │
│  │                                                    │  │
│  │  Token: [________________________] (masked)        │  │
│  │                                                    │  │
│  │  [How to create a token ->]                        │  │
│  │                                                    │  │
│  │  [Save & Continue]    [Open Full Setup]   [Skip]   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

This renders as a **special chat message type** — not plain text but a structured card with an input field. The employee uses the `request_credentials` tool which renders this card in the chat UI.

- **Save & Continue**: stores the credential, employee resumes the task
- **Open Full Setup**: navigates to Settings > Integrations for the full wizard
- **Skip**: employee continues without the integration (may fail gracefully)

This is the most natural flow — the employee asks when it needs something, like a real coworker would.

#### Surface C: Tools & Skills — Auto-Prompt on Enable (Proactive)

When a user toggles on a tool/skill in Settings > Tools & Skills that depends on an integration:

```
User enables "Gmail Send" tool
  -> System checks: Gmail integration connected?
  -> No: shows inline prompt below the toggle:

  ┌──────────────────────────────────────────────────────┐
  │  ! Gmail Send requires Google Email to be connected  │
  │  [Set up Gmail ->]  or  [Enable anyway]              │
  └──────────────────────────────────────────────────────┘
```

- "Set up Gmail" scrolls up to the Integrations section (or opens the slide-over)
- "Enable anyway" enables the tool but it will fail at runtime (employee will then request credentials via Surface B)

This is a **soft gate** — it warns but doesn't block.

### 9.3 Chat-Guided Setup (Employee-Assisted Configuration)

Some integrations are complex enough that the employee should help the user set them up. This is the "chat-first" approach:

- When an integration has `setupType: "chat-guided"` (e.g., custom MCP server, complex API):
  1. Clicking "Set up" in the Integrations panel opens the **Chat drawer** (Phase 5.2) instead of the slide-over form
  2. A **system message** is sent to the employee: "The user wants to set up [integration]. Guide them through the process."
  3. The employee asks questions conversationally: "What's the server URL?", "Do you need auth?"
  4. The employee collects credentials via `request_credentials` tool (renders input cards in chat)
  5. The employee calls `configure_integration` to store everything
  6. The employee calls `test_integration` to verify, reports result in chat
  7. On success, the Integrations panel updates to show "Connected"

This makes the employee feel like a real coworker helping you set things up.

### 9.4 Integration Status Display

Every integration shows its status across all 3 surfaces consistently:

**States and badges:**
- **Not connected** — grey outline badge, "Set up" action
- **Connected** — green filled badge with account identifier (email, username, org name)
- **Expiring** — amber badge: "Token expires in 28d" with "Refresh" action
- **Error** — red badge: "Connection failed" with "Reconnect" action
- **Setting up** — blue pulsing badge: "Setup in progress..." (during chat-guided flow)

**On the detail page header** (always visible):
```
[Employee Name]  [Active]  [Gmail: Connected] [Slack: !] [GitHub: Connected]
```
Small integration icons with colored dots — at a glance you see what's connected.

### 9.5 Credential Storage

Credentials collected from any surface are stored in:
- `EmployeeIntegration` model — encrypted JSON, per-employee, per-integration
- At deploy time, `package-generator.ts` reads `EmployeeIntegration` records and injects credentials into `deploymentConfig.env`
- **Never displayed in plain text** after storage — masked with "****" and an eye toggle to reveal
- Scoped per-employee (not shared across employees by default)
- Org-level integrations (future): allow sharing one Google OAuth across multiple employees

### 9.6 New Built-in Tool: `request_credentials`

This is how the employee asks the user for credentials during a task:

```typescript
request_credentials: {
  description: "Ask the supervisor to provide credentials for an integration"
  parameters: {
    integrationId: string,        // "github", "slack", etc.
    reason: string,               // "I need a GitHub token to create the PR you asked for"
    fields: Array<{
      key: string,                // "GITHUB_TOKEN"
      label: string,              // "Personal Access Token"
      type: "text" | "secret",
      helpText?: string,          // "Create at github.com/settings/tokens"
    }>
  }
}
```

When called, this pauses the employee's execution (like an approval request) and renders the credential input card in the chat UI. When the user submits, execution resumes with the new credentials available.

### 9.6 Pre-built Integration Definitions

Ship with definitions for common integrations:

| Integration | Setup Type | Credentials Needed |
|-------------|------------|-------------------|
| Google Email (Gmail) | oauth | Client ID, Client Secret, Refresh Token |
| Google Calendar | oauth | Same as Gmail (shared consent) |
| Google Drive | oauth | Same as Gmail (shared consent) |
| Slack | api-key | Bot Token, Signing Secret |
| GitHub | api-key | Personal Access Token |
| Linear | api-key | API Key |
| Notion | api-key | Integration Token |
| Discord | api-key | Bot Token |
| SMTP Email | manual | Host, Port, User, Password |
| Custom MCP Server | chat-guided | URL, Auth (varies) |
| Custom API | manual | Base URL, API Key, Headers |

### 9.7 Prisma Schema Additions for Integrations

```prisma
model EmployeeIntegration {
  id              String   @id @default(cuid())
  employeeId      String
  employee        DigitalEmployee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  integrationId   String   // "google-email", "slack", etc.
  status          String   @default("disconnected") // disconnected, connected, error, expiring
  credentials     Json     @default("{}") // encrypted credential data
  metadata        Json     @default("{}") // account info, token expiry, etc.
  connectedAt     DateTime?
  expiresAt       DateTime?
  lastTestedAt    DateTime?
  lastError       String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([employeeId, integrationId])
}
```

### 9.8 New API Routes for Integrations

- `GET /api/dashboard/digital-employees/[id]/integrations` — list all integration statuses
- `POST /api/dashboard/digital-employees/[id]/integrations/[integrationId]/setup` — start setup wizard (returns OAuth URL or field requirements)
- `POST /api/dashboard/digital-employees/[id]/integrations/[integrationId]/credentials` — store credentials
- `POST /api/dashboard/digital-employees/[id]/integrations/[integrationId]/test` — test connection
- `DELETE /api/dashboard/digital-employees/[id]/integrations/[integrationId]` — disconnect
- `GET /api/oauth/callback/[provider]` — OAuth callback handler

### 9.9 New Built-in Tools for Employee-Assisted Setup

```typescript
// Available to the employee during chat-guided setup
configure_integration: {
  description: "Store credentials for an integration after guided setup"
  parameters: { integrationId: string, credentials: Record<string, string> }
}

test_integration: {
  description: "Test if an integration is working"
  parameters: { integrationId: string }
}
```

---

## Phase 10: Inter-Employee Communication

Employees are isolated Docker containers. They can't talk to each other directly. All communication goes through the **platform as a relay** — just like real employees use Slack/email through company infrastructure.

### 10.1 Communication Model

There are 4 types of inter-employee communication, from simple to complex:

#### Type 1: Message (fire-and-forget)

Employee A sends a message to Employee B. B receives it on its next run or immediately if running.

```
Employee A: "Hey @SupportBot, customer #1234 escalated again — check the latest ticket."
```

Use case: FYI notifications, status updates, soft alerts.

#### Type 2: Task Delegation (request + result)

Employee A assigns a task to Employee B and waits (or continues) until B completes it.

```
Employee A: "Hey @ResearchBot, find the top 5 competitors for 'acme corp' and summarize their pricing."
  -> ResearchBot runs, produces output
  -> Result is returned to Employee A
  -> Employee A continues with the result
```

Use case: Specialization. A generalist delegates to a specialist.

#### Type 3: Handoff (transfer ownership)

Employee A finishes its part of a job and hands the entire context to Employee B to continue.

```
Employee A: "I've drafted the blog post. Handing off to @EditorBot for review and publishing."
  -> EditorBot receives: the draft, A's notes, the original task context
  -> EditorBot takes over — A is done
```

Use case: Pipelines. Research -> Write -> Edit -> Publish.

#### Type 4: Broadcast (one-to-many)

Employee A sends a message to all employees in a group/team or all employees matching a tag.

```
Employee A: "@team-support: New policy update — refund window changed from 30 to 14 days."
```

Use case: Policy changes, shared context updates.

### 10.2 How It Works Technically

```
┌──────────────┐     POST /api/runtime/messages/send     ┌──────────────┐
│  Employee A  │ ──────────────────────────────────────>  │   Platform   │
│  (container) │     { to: "employee-b-id",              │   (Next.js)  │
│              │       type: "task",                      │              │
│              │       content: "find competitors...",    │  Stores in   │
│              │       waitForResponse: true }            │  EmployeeMsg │
└──────────────┘                                          │              │
                                                          │  If B is     │
                                                          │  running:    │
                                                          │  push via    │
                                                          │  gateway     │
                                                          │              │
                                                          │  If B is     │
                                                          │  offline:    │
                                                          │  queue, start│
                                                          │  B if auto-  │
                                                          │  start=true  │
                                                          └──────┬───────┘
                                                                 │
                                                                 v
                                                          ┌──────────────┐
                                                          │  Employee B  │
                                                          │  (container) │
                                                          │              │
                                                          │  Receives    │
                                                          │  message in  │
                                                          │  workspace   │
                                                          │  context     │
                                                          └──────────────┘
```

**Key design decisions:**

1. **Platform is always the relay** — containers never talk directly to each other. This means:
   - The supervisor can see ALL inter-employee messages in the dashboard
   - Messages can be intercepted/approved before delivery (supervised mode)
   - No need to expose container ports to each other

2. **Async by default** — Employee A sends a message and can choose to:
   - `waitForResponse: true` — A's execution pauses until B responds (like an approval request)
   - `waitForResponse: false` — A continues, B's response lands in A's inbox for next run

3. **Auto-start** — If Employee B is offline and a task is delegated to it:
   - Platform can auto-start B's container to handle the task
   - Configurable per-employee: `allowAutoStart: true/false` in deployment config
   - B runs, produces result, stops (or stays running if configured)

### 10.3 Runtime API (Container-side)

New tools available to the employee inside the container:

```typescript
// Send a message or delegate a task to another employee
send_message: {
  description: "Send a message or task to another digital employee"
  parameters: {
    to: string,              // employee ID or @name
    type: "message" | "task" | "handoff",
    subject: string,
    content: string,         // the message or task description
    attachments?: Array<{    // files, data, context to pass along
      name: string,
      content: string,
    }>,
    waitForResponse: boolean,  // pause execution until response
    priority: "normal" | "urgent",
  }
}

// Check for messages from other employees
check_inbox: {
  description: "Check for messages from other employees"
  parameters: {
    status?: "unread" | "all",
  }
  returns: Array<{
    id: string,
    from: { id: string, name: string },
    type: string,
    subject: string,
    content: string,
    attachments: Array<...>,
    receivedAt: string,
  }>
}

// Reply to a message or return a task result
reply_message: {
  description: "Reply to a message or return a completed task result"
  parameters: {
    messageId: string,
    content: string,
    attachments?: Array<{ name: string, content: string }>,
    taskStatus?: "completed" | "failed" | "needs-help",
  }
}

// List available employees to communicate with
list_employees: {
  description: "List other digital employees in the organization"
  parameters: {
    status?: "active" | "all",
  }
  returns: Array<{
    id: string,
    name: string,
    description: string,
    status: string,
    skills: string[],
  }>
}
```

### 10.4 Platform API Routes

```
POST /api/runtime/messages/send          — employee sends message (authed via RUNTIME_TOKEN)
GET  /api/runtime/messages/inbox         — employee checks its inbox
POST /api/runtime/messages/[id]/reply    — employee replies to a message
GET  /api/runtime/employees/list         — employee lists peers

GET  /api/dashboard/messages             — supervisor views all inter-employee messages
GET  /api/dashboard/messages/[id]        — supervisor views message detail
POST /api/dashboard/messages/[id]/block  — supervisor blocks/intercepts a message
```

### 10.5 Supervisor Visibility (Dashboard UX)

This is critical — the supervisor needs to see what employees are saying to each other.

#### In the Activity Feed (per-employee)

Messages show up as events:

```
--- Activity Feed (Employee A) ---

  2:15 PM  [Sent]      Task to @ResearchBot: "Find competitor pricing"     [View]
  2:16 PM  [Received]  Reply from @ResearchBot: "Found 5 competitors..."   [View]
  2:17 PM  [Completed] Used research results to draft report
```

#### Global Message Center (new page)

A new section in the dashboard: **Messages** (or **Comms**)

```
/dashboard/messages

┌─────────────────────────────────────────────────────────────────┐
│  Messages                                        [Filter v]     │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ SupportBot -> ResearchBot           2:15 PM    [Task]     │  │
│  │ "Find competitor pricing for acme corp"                    │  │
│  │ Status: Completed  |  Response: "Found 5..."   [View ->]  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ WriterBot -> EditorBot              1:30 PM    [Handoff]  │  │
│  │ "Blog post draft ready for review"                        │  │
│  │ Status: In Progress  |  EditorBot is reviewing [View ->]  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ MonitorBot -> @team-support         12:00 PM  [Broadcast] │  │
│  │ "API error rate above 5% — check dashboards"              │  │
│  │ Delivered to: 3 employees                      [View ->]  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

#### Supervision Controls

For supervised employees, the supervisor can control inter-employee communication:

```
Deployment Config > Permissions:
  [x] Can send messages to other employees
  [x] Can delegate tasks to other employees
  [ ] Can hand off work (transfer ownership)
  [ ] Can auto-start other employees
  [ ] Require approval before sending tasks   <- messages pause like approvals
```

When "Require approval before sending tasks" is on:

```
┌─────────────────────────────────────────────────────────────┐
│  [!] SupportBot wants to delegate a task to ResearchBot     │
│                                                              │
│  Task: "Find competitor pricing for acme corp"               │
│  Attachments: customer_context.md                            │
│                                                              │
│  [Approve & Send]    [Edit & Send]    [Block]                │
└─────────────────────────────────────────────────────────────┘
```

This appears as an approval in the Activity tab and global notification banner.

### 10.6 Employee Awareness (Workspace Context)

Employees need to know who their coworkers are. Add to the package generation:

**TEAM.md** (new workspace file, read-only):
```markdown
# Team

## Coworkers
- **ResearchBot** — Specializes in web research and data gathering. Status: Active.
- **EditorBot** — Reviews and polishes written content. Status: Active.
- **MonitorBot** — Monitors APIs and alerts on issues. Status: Paused.

## Communication
- Use `send_message` to message a coworker
- Use `send_message` with type "task" to delegate work
- Use `check_inbox` to see replies and incoming messages
- Your supervisor can see all messages
```

This file is auto-generated from the org's employee list so each employee knows who else exists and what they do.

### 10.7 Handoff Pipelines (Advanced)

For structured multi-employee workflows, allow the supervisor to define **pipelines**:

```
Pipeline: "Blog Post Production"
  Step 1: ResearchBot   — research the topic
  Step 2: WriterBot     — draft the post using research
  Step 3: EditorBot     — review and polish
  Step 4: PublisherBot  — format and publish

Trigger: Manual or scheduled
Each step auto-hands-off to the next on completion.
```

This is configured in the dashboard as a visual pipeline builder (future — for now, employees can do ad-hoc handoffs via `send_message` with type "handoff").

### 10.8 Prisma Schema for Messages

```prisma
model EmployeeMessage {
  id              String   @id @default(cuid())
  organizationId  String
  fromEmployeeId  String
  fromEmployee    DigitalEmployee @relation("sentMessages", fields: [fromEmployeeId], references: [id], onDelete: Cascade)
  toEmployeeId    String?           // null for broadcasts
  toEmployee      DigitalEmployee? @relation("receivedMessages", fields: [toEmployeeId], references: [id], onDelete: SetNull)
  toGroup         String?           // "@team-support", tag-based routing
  type            String            // "message", "task", "handoff", "broadcast"
  subject         String
  content         String            @db.Text
  attachments     Json              @default("[]")
  priority        String            @default("normal")
  status          String            @default("pending")
  // "pending" -> "delivered" -> "read" -> "completed"/"failed"
  // For tasks: "pending" -> "delivered" -> "in-progress" -> "completed"/"failed"
  requiresApproval Boolean          @default(false)
  approvalStatus   String?          // "pending", "approved", "blocked"
  responseContent  String?          @db.Text
  responseData     Json?
  respondedAt      DateTime?
  parentMessageId  String?          // for threading / replies
  parentMessage    EmployeeMessage? @relation("thread", fields: [parentMessageId], references: [id])
  replies          EmployeeMessage[] @relation("thread")
  runId            String?          // which run triggered this message
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  @@index([toEmployeeId, status])
  @@index([fromEmployeeId])
  @@index([organizationId])
}
```

---

## Phase 11: Employee Templates & Presets

### 11.1 The Problem

Every employee starts from scratch — pick a name, pick an agent, manually toggle tools. Too much friction. Leading platforms (Noca AI, Moveworks) let you deploy a working employee in one click.

### 11.2 Template System

A template is a complete employee blueprint:

```typescript
interface EmployeeTemplate {
  id: string
  name: string                    // "Customer Support Agent"
  description: string
  category: string                // "support", "engineering", "marketing", "operations"
  icon: string
  author: "platform" | "community" | "organization"

  // Pre-configured employee settings
  blueprint: {
    soulPrompt: string            // Pre-written SOUL.md content
    suggestedName: string         // "Support Bot"
    suggestedAvatar: string
    autonomyLevel: AutonomyLevel
    tools: string[]               // Tool names to auto-enable
    skills: string[]              // ClawHub skill slugs to auto-install
    integrations: string[]        // Required integrations (shows setup wizard post-creation)
    schedules: EmployeeSchedule[] // Default schedules
    workspaceFiles: Record<string, string>  // Custom SOUL.md, MEMORY.md defaults
    goals: GoalDefinition[]       // Suggested KPIs (see Phase 12)
    sampleTasks: string[]         // "Try asking me to: resolve a ticket, draft a response, ..."
  }
}
```

### 11.3 Template Gallery UI

Replace the current creation wizard's step 1 with a template picker:

```
Create Digital Employee

  [Start from scratch ->]         (current flow, for power users)

  ── or pick a template ──

  [Search templates...]

  Customer Facing
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │ Support Agent │  │ Sales SDR    │  │ Onboarding   │
  │ Resolves      │  │ Qualifies    │  │ Guides new   │
  │ tickets via   │  │ leads via    │  │ users through │
  │ email & chat  │  │ email/LinkedIn│ │ setup steps  │
  │               │  │              │  │              │
  │ [Gmail,Slack] │  │ [LinkedIn,CRM]│ │ [Email,Docs] │
  │ [Use ->]      │  │ [Use ->]     │  │ [Use ->]     │
  └──────────────┘  └──────────────┘  └──────────────┘

  Engineering
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │ Code Reviewer │  │ Triage Bot   │  │ CI Monitor   │
  │ Reviews PRs   │  │ Labels and   │  │ Monitors     │
  │ and suggests  │  │ prioritizes  │  │ builds and   │
  │ improvements  │  │ GitHub issues│  │ alerts on    │
  │               │  │              │  │ failures     │
  │ [GitHub]      │  │ [GitHub]     │  │ [GitHub,Slack]│
  │ [Use ->]      │  │ [Use ->]     │  │ [Use ->]     │
  └──────────────┘  └──────────────┘  └──────────────┘
```

### 11.4 Post-Template Flow

When user selects a template:

1. **Pre-fill creation wizard** — name, description, avatar, tools, skills all pre-selected
2. **User can customize** — change name, toggle tools, adjust prompt
3. **Create** — employee is created with all config
4. **Integration setup** — if template requires integrations (Gmail, GitHub), immediately show the integration setup wizard (Phase 9)
5. **Employee onboarding** — triggers the self-onboarding flow (Phase 15)

### 11.5 Community Templates

- Organizations can save their custom employee configs as templates
- Share templates within the org or publish to a public gallery
- Template versioning: update a template and choose to propagate changes to employees using it

---

## Phase 12: Goal & Outcome Tracking

### 12.1 The Problem

The plan tracks activity (runs, tokens, approvals) but not outcomes. "5 runs today" doesn't answer "is this employee doing a good job?"

### 12.2 Goal Model

```typescript
interface EmployeeGoal {
  id: string
  name: string                  // "Resolve 50 tickets per week"
  type: "counter" | "threshold" | "boolean" | "percentage"
  target: number                // 50
  unit: string                  // "tickets"
  period: "daily" | "weekly" | "monthly" | "total"
  currentValue: number          // 37
  source: "manual" | "auto"     // auto = derived from run outputs
  autoTrackConfig?: {
    runOutputField: string      // which field in run output to count
    aggregation: "sum" | "count" | "avg" | "max"
  }
}
```

### 12.3 Goal UI on Activity Tab

```
┌─────────────────────────────────────────────────────────┐
│  Goals This Week                                         │
│                                                          │
│  Resolve tickets    ████████████████░░░░  37/50 (74%)   │
│  Avg response time  ████████████████████  2.3min < 5min  │
│  Customer sat.      ██████████████░░░░░░  4.1/5.0       │
│                                                          │
│  [Manage Goals]                                          │
└─────────────────────────────────────────────────────────┘
```

### 12.4 Goal-Based Triggering

- "Run until goal is met, then pause until next period"
- "Alert supervisor when goal is at risk (< 50% at 80% through the period)"
- "Auto-increase schedule frequency if falling behind"

### 12.5 Performance Dashboard

A new sub-view on the Activity tab or a separate "Performance" section:

- Goal completion history (weekly/monthly trend charts)
- Comparison across employees: "Support Bot resolved 200 tickets this month vs. 150 last month"
- Cost per outcome: "$0.12 per ticket resolved" — the metric that matters

---

## Phase 13: Graduated Autonomy & Trust System

### 13.1 The Problem

Autonomy is binary (supervised/autonomous). Users should start with low autonomy and increase it as confidence grows.

### 13.2 Autonomy Levels

```
L1 — Training Wheels
  Every action needs approval before execution.
  Employee proposes actions, supervisor approves each one.
  Good for: new employees, sensitive domains.

L2 — Guided
  Routine actions auto-approved (read data, search, format).
  Tool calls and external actions need approval.
  Good for: employees with 10+ successful runs.

L3 — Trusted
  Most actions auto-approved.
  Only high-risk actions need approval (delete, send external, spend money).
  Good for: employees with 50+ runs, >90% approval rate.

L4 — Autonomous
  All actions auto-approved.
  Supervisor notified of completed work, not asked permission.
  Good for: proven employees with 200+ runs, >95% approval rate.
```

### 13.3 Trust Score

Calculated automatically from:

```
trustScore = weighted average of:
  - Approval acceptance rate (40%)     // how often supervisor approves vs rejects
  - Run success rate (30%)             // completed vs failed runs
  - Error frequency (15%)              // how often tools fail
  - Uptime reliability (15%)           // does it run on schedule
```

Displayed on the employee detail page as a simple meter:

```
Trust Score: 87/100  [████████████████░░░░]  Level: L3 (Trusted)
  Next level at: 92/100 (need 8 more successful runs)
```

### 13.4 Auto-Promotion & Demotion

- **Promote**: When trust score crosses threshold AND minimum run count met → suggest promotion to supervisor
- **Demote**: If trust score drops below threshold (3 consecutive failures, rejection spike) → auto-demote one level, notify supervisor
- Supervisor can always manually override level

### 13.5 Sandbox Mode

New employees start in sandbox by default:

- All tool calls are simulated — employee sees realistic mock responses
- Outputs are tagged "[SANDBOX]" and not delivered externally
- Supervisor reviews sandbox outputs before promoting to L1
- "Go Live" button in the UI transitions from sandbox to L1

### 13.6 Risk Classification for Actions

Each tool/action has a risk level:

```
Low risk (auto-approve at L2+):   read data, search, format text, internal calculations
Medium risk (auto-approve at L3+): send message, create file, update record, API calls
High risk (always approve at L1-L3): delete data, send external email, financial transactions, deploy code
Critical (always approve):         access credentials, modify other employees, change own permissions
```

---

## Phase 14: Error Recovery & Self-Healing

### 14.1 Smart Retry

When a run fails:

1. **Classify the failure**: transient (timeout, rate limit, network) vs. permanent (auth error, invalid input, logic bug)
2. **Transient**: auto-retry with exponential backoff + context: "Previous attempt timed out after 30s. Increasing timeout to 60s."
3. **Permanent**: don't retry. Store failure reason in MEMORY.md. Notify supervisor.
4. **Ambiguous**: retry once. If fails again, escalate.

### 14.2 Failure Pattern Detection

Track failure patterns across runs:

```
┌─────────────────────────────────────────────────────────┐
│  Failure Patterns (last 7 days)                          │
│                                                          │
│  [!] Gmail API timeout — 4 occurrences                   │
│      Suggestion: Check Gmail quota, increase timeout     │
│                                                          │
│  [!] "Permission denied" on GitHub — 2 occurrences       │
│      Suggestion: Token may lack 'repo' scope             │
│                                                          │
│  Action: [Auto-fix suggestions] [Ignore] [Investigate]   │
└─────────────────────────────────────────────────────────┘
```

### 14.3 Fallback Strategies

Per-tool fallback configuration:

```
If "gmail_send" fails → try "smtp_send" as fallback
If "github_create_pr" fails → save draft locally and notify supervisor
If "web_search" fails → use cached results from last successful search
```

### 14.4 Post-Failure Learning

After each failure:
- Store failure reason + context in employee memory
- On next similar task, the employee's prompt includes: "Note: This task previously failed because [reason]. Avoid [specific mistake]."
- Track if the employee successfully avoids repeat failures (feeds into trust score)

---

## Phase 15: Employee Self-Onboarding Journey

### 15.1 The Problem

We onboard the *user* but not the *employee*. Real employees go through orientation.

### 15.2 First-Run Onboarding Mode

When an employee is deployed for the first time, it runs a special onboarding sequence before taking real tasks:

```
Onboarding Checklist (visible in UI)

  [x] Read identity files (SOUL.md, IDENTITY.md)
  [x] Read team context (TEAM.md, USER.md)
  [x] Test tool access
      [x] web_search — working
      [x] gmail_send — NOT CONNECTED (requesting setup)
      [ ] github_create_pr — NOT CONNECTED
  [ ] Introduce self to supervisor
  [ ] Run sample task in sandbox
  [ ] Supervisor approves go-live
```

### 15.3 Integration Health Check

During onboarding, the employee tests every enabled tool:

```
Employee (in chat): "I've tested my tools. Here's what's working:
  - web_search: OK
  - gmail_send: FAILED — no credentials. Can you set up Gmail?
  - github_create_pr: FAILED — token missing 'repo' scope.

  I can start working on tasks that only need web_search.
  Want to set up the others now, or later?"

  [Set up Gmail]  [Set up GitHub]  [Skip for now]
```

This naturally triggers the integration setup flow (Phase 9, Surface B — chat-initiated).

### 15.4 Self-Introduction

The employee introduces itself in the supervisor's chat:

```
"Hi! I'm Support Bot. Here's what I'm set up to do:

  - Monitor support emails and triage by priority
  - Draft responses to common questions
  - Escalate complex issues to you

  I'm currently at Autonomy Level 1 (Training Wheels),
  so I'll ask your approval before taking any action.

  Ready when you are! Try: 'Check the latest support emails.'"
```

### 15.5 Onboarding Status in Dashboard

On the list page, onboarding employees show a distinct state:

```
┌──────────────┐
│ Support Bot   │
│ [Onboarding]  │  blue badge, different from Draft/Active
│ 3/6 steps     │
│ ████░░ 50%    │
│ [Continue ->] │
└──────────────┘
```

---

## Phase 16: Audit Trail & Compliance

### 16.1 Immutable Audit Log

Every action is logged to an append-only `AuditLog` table:

```prisma
model AuditLog {
  id              String   @id @default(cuid())
  organizationId  String
  employeeId      String?
  userId          String?          // human who triggered, if applicable
  action          String           // "tool.execute", "approval.respond", "credential.access", "message.send"
  resource        String           // "tool:gmail_send", "employee:abc123"
  detail          Json             // action-specific context
  ipAddress       String?
  userAgent       String?
  riskLevel       String           // "low", "medium", "high", "critical"
  createdAt       DateTime         @default(now())

  @@index([organizationId, createdAt])
  @@index([employeeId, createdAt])
  @@index([action])
}
```

### 16.2 Audit Dashboard

```
/dashboard/audit

┌─────────────────────────────────────────────────────────┐
│  Audit Log                   [Export CSV]  [Filter v]    │
│                                                          │
│  Filter: All employees | Last 7 days | All risk levels  │
│                                                          │
│  Mar 6, 2:15 PM  SupportBot  tool.execute  gmail_send   │
│    Risk: Medium | Sent email to customer@example.com     │
│                                                          │
│  Mar 6, 2:14 PM  SupportBot  tool.execute  web_search   │
│    Risk: Low | Searched "refund policy"                  │
│                                                          │
│  Mar 6, 2:10 PM  admin@co.co  approval.respond          │
│    Risk: Low | Approved "Send refund email"              │
│                                                          │
│  Mar 6, 1:00 PM  WriterBot   credential.access  github  │
│    Risk: High | Accessed GitHub token for PR creation    │
└─────────────────────────────────────────────────────────┘
```

### 16.3 RBAC (Role-Based Access Control)

```
Roles:
  Owner     — full access, manage billing, delete org
  Admin     — create/delete employees, manage integrations, view audit
  Manager   — configure employees they supervise, approve actions, view activity
  Viewer    — read-only access to employee activity and outputs
```

Permission matrix:

| Action | Owner | Admin | Manager | Viewer |
|--------|-------|-------|---------|--------|
| Create employee | x | x | | |
| Delete employee | x | x | | |
| Configure tools/skills | x | x | x (own) | |
| Approve actions | x | x | x (own) | |
| View activity | x | x | x (own) | x |
| Manage credentials | x | x | | |
| View audit log | x | x | | |
| Export data | x | x | | |
| Manage billing | x | | | |

### 16.4 Data Retention & Compliance

- Configurable retention: auto-archive runs/messages after X days (default: 90)
- Right to delete: purge all data for a specific employee
- Data export: full dump of employee activity, messages, outputs as JSON/CSV
- Credential rotation alerts: "GitHub token for Support Bot expires in 7 days"

---

## Phase 17: Webhook & Event Triggers

### 17.1 The Problem

Employees can only be triggered by: cron, manual click, or another employee's message. No way for external systems to wake them up.

### 17.2 Inbound Webhooks

Each employee gets a unique webhook URL:

```
POST https://app.rantai.dev/api/webhooks/employees/{employeeId}
Headers: Authorization: Bearer {webhookToken}
Body: { "event": "...", "data": { ... } }
```

The employee receives the webhook payload as the trigger input:
```
TriggerContext: {
  type: "webhook",
  source: "github",
  input: { event: "issues.opened", issue: { title: "Bug: login fails", ... } }
}
```

### 17.3 Event Subscriptions

Configure in Settings > Triggers:

```
Triggers
  ┌─────────────────────────────────────────────────────┐
  │  Schedules                                           │
  │  [x] Daily at 9:00 AM — Morning triage              │
  │  [ ] Every hour — Check for new tickets              │
  │                                                      │
  │  Webhooks                                            │
  │  [x] GitHub — on issues.opened, issues.labeled       │
  │      URL: https://app.rantai.dev/api/webhooks/e/abc  │
  │      [Copy URL]  [Regenerate Token]                  │
  │                                                      │
  │  [ ] Slack — on message in #support channel          │
  │  [ ] Custom — any POST to webhook URL                │
  │                                                      │
  │  Email Trigger                                       │
  │  [ ] Forward emails to: support-bot@in.rantai.dev    │
  │      Processes incoming email as trigger input        │
  │                                                      │
  │  Watch Mode                                          │
  │  [ ] Monitor URL: https://api.example.com/status     │
  │      Interval: every 5 min                           │
  │      Trigger when: response changes or status != 200 │
  │                                                      │
  │  [+ Add Trigger]                                     │
  └─────────────────────────────────────────────────────┘
```

### 17.4 Trigger Types

| Trigger | How It Works | Use Case |
|---------|-------------|----------|
| **Cron** | Time-based schedule | Daily reports, periodic checks |
| **Webhook** | External HTTP POST | GitHub events, Stripe payments, CI/CD |
| **Email** | Inbound email forwarding | Support inbox, order confirmations |
| **Watch** | Poll URL on interval, trigger on change | API monitoring, price tracking |
| **Event** | Internal platform event | "When Employee A completes task X" |
| **Manual** | Dashboard button click | Ad-hoc runs, testing |

### 17.5 Webhook Management

```prisma
model EmployeeWebhook {
  id              String   @id @default(cuid())
  employeeId      String
  employee        DigitalEmployee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  type            String           // "webhook", "email", "watch"
  name            String
  token           String   @unique  // bearer token for auth
  config          Json              // type-specific config (URL to watch, email address, etc.)
  filterRules     Json     @default("[]")  // only trigger on matching events
  enabled         Boolean  @default(true)
  lastTriggeredAt DateTime?
  triggerCount    Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([employeeId])
  @@index([token])
}
```

### 17.6 API Routes

```
POST /api/webhooks/employees/[id]             — inbound webhook (public, token-authed)
POST /api/webhooks/email/[address]            — inbound email (from email provider)
GET  /api/dashboard/digital-employees/[id]/triggers  — list all triggers
POST /api/dashboard/digital-employees/[id]/triggers  — create trigger
PUT  /api/dashboard/digital-employees/[id]/triggers/[triggerId]  — update
DELETE /api/dashboard/digital-employees/[id]/triggers/[triggerId] — delete
```

---

## Implementation Order

| Step | What | Effort | Impact |
|------|------|--------|--------|
| 1 | Activity tab (new default) | Medium | High |
| 2 | Inline approvals on Activity | Small | High |
| 3 | Employee templates + template gallery | Large | High |
| 4 | List page: live activity + approval badges | Small | High |
| 5 | Consolidate tabs (9 -> 5) | Medium | Medium |
| 6 | Integration registry + setup wizard UI | Large | High |
| 7 | Graduated autonomy levels (L1-L4) + trust score | Large | High |
| 8 | Webhook & event triggers | Medium | High |
| 9 | History timeline (replace Jobs) | Medium | Medium |
| 10 | Settings merger (tools+skills+config+schedule+integrations+triggers) | Medium | Medium |
| 11 | Global approval banner | Small | High |
| 12 | Chat-guided setup (employee-assisted config) | Medium | High |
| 13 | Goal/outcome tracking + performance dashboard | Large | High |
| 14 | Employee self-onboarding journey | Medium | High |
| 15 | Chat offline support + drawer | Medium | Medium |
| 16 | Cost display ($) everywhere | Small | Medium |
| 17 | OAuth callback + credential storage | Medium | High |
| 18 | Sandbox mode (dry-run for new employees) | Medium | High |
| 19 | Error recovery + smart retry + failure patterns | Medium | Medium |
| 20 | Inter-employee messaging (send/receive/inbox runtime tools) | Large | High |
| 21 | Inter-employee task delegation (wait-for-response + auto-start) | Large | High |
| 22 | TEAM.md workspace file generation | Small | Medium |
| 23 | Global message center dashboard page | Medium | Medium |
| 24 | Audit trail + immutable log | Medium | High |
| 25 | RBAC (role-based access control) | Large | High |
| 26 | Supervisor message approval/blocking controls | Medium | Medium |
| 27 | Heartbeat animation + sidebar presence | Small | Low |
| 28 | List/Table view toggle | Small | Low |
| 29 | Visual cron builder in Settings | Medium | Low |
| 30 | Pre-built integration definitions (Gmail, Slack, GitHub, etc.) | Medium | Medium |
| 31 | Community template marketplace | Large | Medium |
| 32 | Handoff pipelines (visual pipeline builder) | Large | Medium |
| 33 | Data retention + export + compliance | Medium | Medium |

---

## Files to Create / Modify

### New Files — UI Components
- `app/dashboard/digital-employees/[id]/_components/activity-tab.tsx`
- `app/dashboard/digital-employees/[id]/_components/activity-feed.tsx`
- `app/dashboard/digital-employees/[id]/_components/daily-summary.tsx`
- `app/dashboard/digital-employees/[id]/_components/live-status-banner.tsx`
- `app/dashboard/digital-employees/[id]/_components/inline-approvals.tsx`
- `app/dashboard/digital-employees/[id]/_components/history-timeline.tsx`
- `app/dashboard/digital-employees/[id]/_components/run-detail-expanded.tsx`
- `app/dashboard/digital-employees/[id]/_components/settings-tab.tsx`
- `app/dashboard/digital-employees/[id]/_components/chat-drawer.tsx`
- `app/dashboard/digital-employees/[id]/_components/integration-setup-wizard.tsx`
- `app/dashboard/digital-employees/[id]/_components/integration-status.tsx`
- `app/dashboard/digital-employees/[id]/_components/goal-tracker.tsx`
- `app/dashboard/digital-employees/[id]/_components/trust-score.tsx`
- `app/dashboard/digital-employees/[id]/_components/onboarding-checklist.tsx`
- `app/dashboard/digital-employees/[id]/_components/trigger-config.tsx`
- `app/dashboard/digital-employees/[id]/_components/failure-patterns.tsx`
- `app/dashboard/digital-employees/_components/employee-list-table.tsx`
- `app/dashboard/digital-employees/_components/template-gallery.tsx`
- `app/dashboard/digital-employees/_components/template-card.tsx`
- `components/ui/approval-banner.tsx`
- `app/dashboard/messages/page.tsx` — global message center
- `app/dashboard/messages/_components/message-list.tsx`
- `app/dashboard/messages/_components/message-detail.tsx`
- `app/dashboard/audit/page.tsx` — audit log dashboard
- `app/dashboard/audit/_components/audit-log-table.tsx`

### New Files — Libraries
- `lib/digital-employee/integrations/registry.ts` — integration definitions
- `lib/digital-employee/integrations/definitions/` — per-integration configs (google.ts, slack.ts, github.ts, etc.)
- `lib/digital-employee/integrations/oauth.ts` — OAuth flow helpers
- `lib/digital-employee/integrations/credential-store.ts` — encrypted credential storage
- `lib/digital-employee/templates/registry.ts` — template definitions + resolver
- `lib/digital-employee/templates/definitions/` — per-template blueprints (support-agent.ts, code-reviewer.ts, etc.)
- `lib/digital-employee/trust.ts` — trust score calculation + autonomy level resolution
- `lib/digital-employee/goals.ts` — goal tracking, progress calculation, alerts
- `lib/digital-employee/audit.ts` — audit log writer + query helpers
- `lib/digital-employee/webhooks.ts` — inbound webhook handler + event routing
- `lib/digital-employee/error-recovery.ts` — failure classification, retry logic, pattern detection

### New Files — Hooks
- `hooks/use-employee-integrations.ts`
- `hooks/use-employee-messages.ts`
- `hooks/use-employee-goals.ts`
- `hooks/use-employee-triggers.ts`
- `hooks/use-audit-log.ts`

### Modify
- `app/dashboard/digital-employees/page.tsx` — live activity, approval badges, view toggle, onboarding status
- `app/dashboard/digital-employees/new/page.tsx` — template picker before wizard, pre-fill from template
- `app/dashboard/digital-employees/[id]/page.tsx` — restructure tabs, default to Activity, trust score display, goal tracker
- `app/dashboard/_components/app-sidebar.tsx` — enhanced employee presence, audit log nav item
- `hooks/use-digital-employee.ts` — activity feed, cost calculations, trust score
- `lib/digital-employee/package-generator.ts` — inject integration credentials, generate TEAM.md, include goal definitions
- `lib/digital-employee/types.ts` — IntegrationDefinition, SetupStep, GoalDefinition, AutonomyLevel (L1-L4), TrustScore, TEAM.md in WORKSPACE_FILES
- `lib/digital-employee/docker-orchestrator.ts` — sandbox mode support, onboarding sequence trigger
- `docker/employee/agent-runner/tools.js` — add all new built-in tools: configure_integration, test_integration, send_message, check_inbox, reply_message, list_employees, update_goal, report_outcome
- `docker/employee/agent-runner/index.js` — onboarding mode detection, health check on first run

### New API Routes — Dashboard
- `GET /api/dashboard/digital-employees/[id]/activity` — aggregated activity feed
- `GET /api/dashboard/digital-employees/[id]/summary` — daily summary data
- `GET /api/dashboard/digital-employees/[id]/integrations` — list integration statuses
- `POST /api/dashboard/digital-employees/[id]/integrations/[integrationId]/setup` — start setup
- `POST /api/dashboard/digital-employees/[id]/integrations/[integrationId]/credentials` — store credentials
- `POST /api/dashboard/digital-employees/[id]/integrations/[integrationId]/test` — test connection
- `DELETE /api/dashboard/digital-employees/[id]/integrations/[integrationId]` — disconnect
- `GET /api/dashboard/digital-employees/[id]/goals` — list goals + progress
- `POST /api/dashboard/digital-employees/[id]/goals` — create/update goal
- `DELETE /api/dashboard/digital-employees/[id]/goals/[goalId]` — remove goal
- `GET /api/dashboard/digital-employees/[id]/triggers` — list triggers
- `POST /api/dashboard/digital-employees/[id]/triggers` — create trigger (webhook, watch, email)
- `PUT /api/dashboard/digital-employees/[id]/triggers/[triggerId]` — update trigger
- `DELETE /api/dashboard/digital-employees/[id]/triggers/[triggerId]` — delete trigger
- `GET /api/dashboard/templates` — list employee templates
- `POST /api/dashboard/templates` — create org template from existing employee
- `GET /api/dashboard/messages` — all inter-employee messages
- `GET /api/dashboard/messages/[id]` — message detail
- `POST /api/dashboard/messages/[id]/block` — block pending message
- `GET /api/dashboard/audit` — audit log with filters + pagination
- `GET /api/dashboard/audit/export` — CSV/JSON export

### New API Routes — OAuth & Webhooks
- `GET /api/oauth/callback/[provider]` — OAuth callback handler
- `POST /api/webhooks/employees/[id]` — inbound webhook (public, token-authed)
- `POST /api/webhooks/email/[address]` — inbound email trigger

### New API Routes — Runtime (container → platform)
- `POST /api/runtime/integrations/configure` — employee stores credentials (chat-guided)
- `POST /api/runtime/integrations/test` — employee tests connection
- `POST /api/runtime/messages/send` — send to another employee
- `GET  /api/runtime/messages/inbox` — check incoming messages
- `POST /api/runtime/messages/[id]/reply` — reply to message
- `GET  /api/runtime/employees/list` — list peers
- `POST /api/runtime/goals/update` — employee reports goal progress
- `POST /api/runtime/audit/log` — employee writes audit entry

### Prisma Schema Additions
- `EmployeeEvent` model — generic event log for activity feed
- `EmployeeIntegration` model — per-employee integration status + encrypted credentials
- `EmployeeMessage` model — inter-employee messages, tasks, handoffs, broadcasts
- `EmployeeGoal` model — goals/KPIs per employee with progress tracking
- `EmployeeTemplate` model — reusable employee blueprints (platform + org + community)
- `EmployeeWebhook` model — inbound webhook/email/watch trigger configs
- `AuditLog` model — immutable append-only action log
- Add `lastOutput`, `costCents` fields to `EmployeeRun`
- Add `trustScore`, `autonomyLevel` (L1-L4), `onboardingStatus` fields to `DigitalEmployee`
- Add `riskLevel` field to tool definitions
- Expand `EmployeeDeploymentConfig` permissions: `allowAutoStart`, `canMessageEmployees`, `canDelegateTasks`, `canHandoff`, `requireMessageApproval`
