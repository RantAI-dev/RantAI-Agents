# 07 — Interaction Layer: Human-in-the-Loop Gateway

## Overview

Digital Employees need human oversight. The Gateway is the bridge between an employee requesting approval and a supervisor responding through their preferred messaging channel.

```
Employee (in VM)                    Gateway Service                    Supervisor
       │                                  │                               │
       │  "I drafted a LinkedIn post"     │                               │
       ├─── POST /approvals ─────────────►│                               │
       │                                  │  Format message               │
       │                                  ├──── Send to Telegram ────────►│
       │                                  │                               │
       │    (VM pauses or tears down)     │                               │
       │                                  │     "Looks good, approved"    │
       │                                  │◄──── Webhook callback ────────┤
       │                                  │                               │
       │  Orchestrator resumes run        │  Update EmployeeApproval      │
       │◄─── Resume with approval ────────┤                               │
       │                                  │                               │
       │  Employee publishes post         │                               │
       │                                  │  "Post published ✓"          │
       │  POST /status ──────────────────►├──── Notification ────────────►│
```

## Pause/Resume Protocol

### When Approval is Needed

A workflow step is marked as `requiresApproval` (via APPROVAL node or agent permission config). When the agent reaches this point:

1. **Agent serializes its pending action**:
   ```json
   {
     "action": "publish_linkedin_post",
     "content": {
       "title": "5 AI Trends for 2026",
       "body": "...",
       "hashtags": ["#AI", "#tech"]
     },
     "context": "Generated based on content calendar item #42"
   }
   ```

2. **Agent Runner calls Gateway API**:
   ```
   POST /api/runtime/approvals
   {
     "employeeId": "emp_xxx",
     "runId": "run_xxx",
     "stepId": "step_xxx",
     "requestType": "publish",
     "title": "Review LinkedIn Post Draft",
     "content": { ... },
     "options": ["approve", "reject", "edit"]
   }
   ```

3. **Gateway creates `EmployeeApproval` record** with status `PENDING`

4. **Gateway delivers message** to supervisor's configured channel

5. **VM behavior** (two modes):
   - **Pause mode**: VM stays alive, agent loop pauses. Good for quick approvals (<5 min). Uses compute while waiting.
   - **Teardown mode**: VM serializes state to volume and tears down. Orchestrator spins up new VM on approval callback. Good for slow approvals (hours/days). Zero compute cost while waiting.

   Default: **Teardown mode** (serverless-first). Configurable per workflow step.

### State Serialization for Teardown Mode

When the VM tears down mid-workflow:

```json
// /data/state/suspended-run.json
{
  "runId": "run_xxx",
  "workflowId": "wf_xxx",
  "currentStepId": "step_xxx",
  "completedSteps": ["step_1", "step_2", "step_3"],
  "stepOutputs": {
    "step_1": { "text": "..." },
    "step_2": { "data": [...] }
  },
  "pendingAction": {
    "type": "publish_linkedin_post",
    "content": { ... }
  },
  "suspendedAt": "2026-03-01T08:15:00Z"
}
```

On resume, the Agent Runner:
1. Reads suspended state from volume
2. Skips completed steps
3. Injects approval response into the pending action context
4. Continues workflow from the suspended step

### Approval Callback Flow

```
Supervisor replies "1" (approve) on Telegram
        │
        ▼
Telegram webhook → Gateway webhook handler
        │
        ▼
Gateway:
  1. Match reply to EmployeeApproval record (via messageId + chatId)
  2. Update EmployeeApproval: status = APPROVED, response = "approved"
  3. Call Orchestrator: resumeRun(runId, { approved: true })
        │
        ▼
Orchestrator:
  1. Write approval response to employee's volume
  2. Spin up new VM (mounts same volume)
  3. Agent Runner reads suspended state + approval
  4. Workflow resumes
```

## Gateway Service Architecture

```
┌──────────────────────────────────────────────┐
│              Gateway Service                  │
│                                              │
│  ┌──────────────┐    ┌──────────────────┐   │
│  │ Message       │    │ Channel Adapters  │   │
│  │ Router        │───►│                  │   │
│  │               │    │  ┌────────────┐  │   │
│  │ - Format msg  │    │  │ Telegram   │  │   │
│  │ - Pick channel│    │  │ Adapter    │──┼──►  Telegram API
│  │ - Track state │    │  └────────────┘  │   │
│  │               │    │  ┌────────────┐  │   │
│  └──────────────┘    │  │ WhatsApp   │  │   │
│                       │  │ Adapter    │──┼──►  WhatsApp Business API
│  ┌──────────────┐    │  └────────────┘  │   │
│  │ Callback      │    │  ┌────────────┐  │   │
│  │ Handler       │◄───│  │ Discord    │  │   │
│  │               │    │  │ Adapter    │──┼──►  Discord Bot API
│  │ - Parse reply │    │  └────────────┘  │   │
│  │ - Match to    │    │  ┌────────────┐  │   │
│  │   approval    │    │  │ Slack      │  │   │
│  │ - Trigger     │    │  │ Adapter    │──┼──►  Slack Bot API
│  │   resume      │    │  └────────────┘  │   │
│  └──────────────┘    │  ┌────────────┐  │   │
│                       │  │ Email      │  │   │
│                       │  │ Adapter    │──┼──►  SMTP / SendGrid
│                       │  └────────────┘  │   │
│                       │  ┌────────────┐  │   │
│                       │  │ Dashboard  │  │   │
│                       │  │ Adapter    │──┼──►  WebSocket to UI
│                       │  └────────────┘  │   │
│                       └──────────────────┘   │
└──────────────────────────────────────────────┘
```

## Channel Adapter Interface

Each channel implements a common interface:

```typescript
interface ChannelAdapter {
  readonly type: string  // "telegram", "whatsapp", etc.

  // Send an approval request
  sendApprovalRequest(
    config: ChannelConfig,
    approval: EmployeeApproval,
    employee: DigitalEmployee
  ): Promise<{ messageId: string }>

  // Send a notification (no response needed)
  sendNotification(
    config: ChannelConfig,
    message: NotificationMessage,
    employee: DigitalEmployee
  ): Promise<void>

  // Parse an incoming callback/webhook into a standardized response
  parseCallback(rawPayload: unknown): ParsedCallback | null
}

interface ParsedCallback {
  channelMessageId: string
  senderId: string
  responseText: string
  // Parsed intent:
  action: "approve" | "reject" | "edit" | "unknown"
  editedContent?: string
}
```

## Message Formatting

Approval messages should be clear and actionable:

### Telegram Example
```
🤖 Marketing Manager needs your approval

📋 Review LinkedIn Post Draft

---
5 AI Trends for 2026

[Full draft text here]

#AI #tech #innovation
---

Reply:
1️⃣ Approve — publish as-is
2️⃣ Reject — discard
✏️ Or type your edits directly
```

### Dashboard Example (WebSocket)
The dashboard shows a richer UI:
- Full content preview with formatting
- Inline edit capability
- Approve/Reject buttons
- Link to the employee's activity log

## Timeout & Escalation

```typescript
interface TimeoutConfig {
  timeoutMinutes: number          // Default: 60
  timeoutAction: "auto_approve" | "auto_reject" | "escalate" | "hold"
  escalationChain: string[]       // User IDs to try in order
  escalationIntervalMinutes: number  // Time between escalation attempts
}
```

A background job checks for expired approvals:
```
Every 1 minute:
  Find EmployeeApproval where status = DELIVERED AND expiresAt < now()
  For each:
    If timeoutAction = "auto_approve" → approve and resume
    If timeoutAction = "auto_reject" → reject and mark run as failed
    If timeoutAction = "escalate" → send to next person in chain
    If timeoutAction = "hold" → do nothing, keep waiting
```

## API Routes

```
# Gateway management
POST   /api/gateway/channels/test          — test channel connectivity
GET    /api/gateway/channels/status         — channel health check

# Webhook endpoints (public, per channel)
POST   /api/gateway/webhooks/telegram       — Telegram bot webhook
POST   /api/gateway/webhooks/whatsapp       — WhatsApp webhook
POST   /api/gateway/webhooks/discord        — Discord interaction webhook
POST   /api/gateway/webhooks/slack          — Slack event webhook

# Approval management (internal, from dashboard)
GET    /api/dashboard/approvals              — list all pending approvals
GET    /api/dashboard/approvals?employeeId=x — approvals for specific employee
POST   /api/dashboard/approvals/[id]/respond — respond from dashboard UI
```

## Implementation Priority

1. **Dashboard adapter first** — approvals show in the UI, supervisor clicks approve/reject. No external integration needed. Proves the full loop.
2. **Telegram adapter second** — most common for dev/tech users. Good bot API.
3. **WhatsApp / Slack / Discord** — add as demand dictates.
4. **Email adapter** — lowest priority (slow, unreliable for approvals).

## Dependencies

- Requires `EmployeeApproval` model (see `05-DIGITAL-EMPLOYEE-MODEL.md`)
- Requires Orchestrator's `resumeRun()` capability (see `06-RUNTIME-AGENTIC-OS.md`)
- The APPROVAL node type already exists in workflow types — wire it to this gateway
