# Employee Features E2E Smoke Test Spec

## Goal

Comprehensive manual E2E smoke test of all single-employee features: autonomy levels (L1-L4), trust scoring, tools (built-in + custom), skills (platform + ClawHub), activity feed, cost tracking, approvals, memory, workspace files, sandbox mode, onboarding checklist, triggers/schedules, package generation, and full lifecycle (create → deploy → pause → resume → archive). Integrations excluded (require manual human interaction).

## Architecture

Two employees in one fresh team, tested sequentially:

- **Employee 1 "Lifecycle Bot"** (avatar: "🔄"): lifecycle + config features (S1-S8)
- **Employee 2 "Runtime Bot"** (avatar: "⚡"): runtime behavior features (S9-S21)

All tests executed via `curl` against the platform API (`localhost:3000`) and the container gateway directly. Auth via existing session cookie at `/tmp/rantai-cookies.txt`.

## Prerequisites

Before testing, ensure:

1. **Session cookie**: Login as `agent@rantai.com / password123`, store cookie at `/tmp/rantai-cookies.txt`
2. **Docker**: Daemon running, `rantai/employee:latest` image built
3. **Dev server**: Next.js running on `localhost:3000`
4. **Assistant**: Need an existing `assistantId` (query from DB or create one). The create employee API requires it.
5. **Team/Group**: Both employees will be created in a fresh team (auto-created by the platform or created explicitly)

## Test Environment

- Platform: Next.js dev server on `localhost:3000`
- Container: Docker `rantai/employee:latest` image
- Auth: `agent@rantai.com / password123`
- Session cookie: `/tmp/rantai-cookies.txt`

---

## Employee 1: Lifecycle & Config Tests

### S1. Create Employee (DRAFT)

**Action:** POST `/api/dashboard/digital-employees` with:
- name: "Lifecycle Bot"
- description: "Tests lifecycle and config features"
- avatar: "🔄"
- assistantId: (from prerequisites)
- autonomyLevel: "L1"

Note: `sandboxMode` is auto-derived from autonomyLevel. L1 = sandboxMode:true automatically.

**Assertions:**
- HTTP 201
- Response: `status` present (DRAFT or as returned), `sandboxMode=true` (auto from L1), `autonomyLevel="L1"`
- Employee ID returned

### S2. Onboarding Checklist

**Action:**
1. Start the team container so Employee 1 comes online
2. Poll onboarding status via workspace proxy: `GET /api/dashboard/digital-employees/{id}/workspace/files/read?path=ONBOARDING_STATUS.json`
3. Chat with employee asking it to: read its tools, write a memory entry, complete a sample task

**Assertions:**
- Onboarding status file exists in container workspace and contains checklist steps
- Steps tick off as the employee completes them
- Progress updates over time (poll every 10s)

### S3. Sandbox Mode Verification

**Action:**
- While still in sandbox mode, chat with employee asking it to use a tool (e.g., "search the web for latest AI news")
- Check activity feed via `GET /api/dashboard/digital-employees/{id}/activity`

**Assertions:**
- Tool call appears in chat response `tool_calls`
- Run is logged in activity feed with appropriate status
- Verify sandbox flag is still true on employee record

### S4. Go-Live

**Action:** POST `/api/dashboard/digital-employees/{id}/go-live`

**Important side effects:**
- Go-live auto-promotes L1 → L2 and sets trustScore to max(current, 50)
- Go-live sets sandboxMode=false
- Go-live does NOT change the employee `status` field directly

**Assertions:**
- HTTP 200
- Response: `sandboxMode=false`, `autonomyLevel="L2"` (auto-promoted from L1)
- Container still running (health check passes)
- Employee status may need to be set to ACTIVE separately via PUT if not already

### S5. Workspace Files

**Action:**
1. GET `/api/dashboard/digital-employees/{id}/files` — list workspace files
2. PUT `/api/dashboard/digital-employees/{id}/files/SOUL.md` with custom personality: "You are a meticulous lifecycle testing bot. You respond precisely and concisely."
3. GET SOUL.md back via same route

**Assertions:**
- Files list contains: SOUL.md, MEMORY.md, TOOLS.md, IDENTITY.md, AGENTS.md, USER.md, BOOTSTRAP.md, HEARTBEAT.md, TEAM.md (9 files total)
- SOUL.md content matches what we wrote after GET
- TOOLS.md is auto-generated (will be overwritten on next package sync)

### S6. Package Generation

**Action:** GET `/api/dashboard/digital-employees/{id}/package`

**Assertions:**
- Package JSON contains:
  - `employee.name` = "Lifecycle Bot"
  - `employee.sandboxMode` = false (post go-live)
  - `employee.autonomyLevel` = "L2" (post go-live promotion)
  - `workspaceFiles` includes SOUL.md with our custom personality
  - `tools.platform` is a non-empty array
  - `deploymentConfig` present

### S7. Pause / Resume

**Action:**
1. POST `/api/dashboard/digital-employees/{id}/pause`
2. GET employee status
3. POST `/api/dashboard/digital-employees/{id}/resume`
4. Health check on new container port

**Note:** Pause stops the entire group container. If Employee 1 and 2 share a group, this affects both. Ideally Employee 2 is not yet created, or they are in separate groups.

**Assertions:**
- After pause: employee status reflects paused state, container stops
- After resume: employee comes back online, new container responds on /health
- Gateway paired and operational

### S8. Archive & Lifecycle End

**Action:** PUT `/api/dashboard/digital-employees/{id}` with `status: "ARCHIVED"`

**Assertions:**
- Employee status = ARCHIVED
- Employee marked as archived in list response

---

## Employee 2: Runtime Behavior Tests

### S9. Create & Deploy Runtime Bot

**Action:**
- Create employee: name="Runtime Bot", avatar="⚡", assistantId=(from prerequisites), autonomyLevel="L1"
- Start team container (or use existing if separate group)
- Call go-live: POST `/api/dashboard/digital-employees/{id}/go-live`
- Then PUT autonomyLevel back to "L1" to test L1 approval behavior

**Why reset to L1:** Go-live auto-promotes L1→L2. We need L1 for S10/S11 approval tests. After go-live (which disables sandbox), we PUT autonomyLevel="L1" to get the employee running but at L1 trust level.

**Assertions:**
- Employee online: container /health returns ok
- After PUT: autonomyLevel = "L1", sandboxMode = false
- Employee responds to chat

### S10. Autonomy L1 — Approval Required

**Action:**
- Chat with Runtime Bot: "Use the web_search tool to look up the latest news about autonomous AI agents"
- Check pending approvals: `GET /api/dashboard/digital-employees/{id}/approvals`
- Respond: POST `/api/dashboard/approvals/{approvalId}/respond` with `{ "status": "approved" }`

**Note:** Approval status values are lowercase: "approved", "rejected", "edited"

**Assertions:**
- Approval request created with status=PENDING in approvals list
- After approval response: approval status=APPROVED
- Run completes (check activity feed)
- If trust events are created: event with type approval_accepted appears

### S11. Autonomy L1 — Rejection Flow

**Action:**
- Chat: "Use the web_search tool to search for cryptocurrency prices"
- Check pending approvals
- Respond: POST `/api/dashboard/approvals/{approvalId}/respond` with `{ "status": "rejected" }`

**Assertions:**
- Approval request created with status=PENDING
- After rejection: approval status=REJECTED
- Run does NOT complete successfully
- If trust events are created: event with negative weight

### S12. Trust Score & Events

**Action:** GET `/api/dashboard/digital-employees/{id}/trust`

**Assertions:**
- Response contains: `trustScore` (number), `currentLevel` (object), `recentEvents` (array)
- `currentLevel` reflects L1
- If trust events were created from S10/S11: they appear in `recentEvents`
- `promotionSuggestion` and `demotionSuggestion` are calculated (may be null)

### S13. Autonomy Promotion L1→L2→L3→L4

**Action:**
- POST `/api/dashboard/digital-employees/{id}/trust/promote` to escalate L1→L2
- Repeat: promote L2→L3, then L3→L4
- GET trust after each — verify level
- At L4: chat "Use the web_search tool to search for AI safety research" — verify no approval needed

**Assertions:**
- After each promotion: trust API returns matching `currentLevel`
- At L4: chat completes with tool_calls, NO new pending approval created
- GET approvals shows no new PENDING entries after L4 action

### S14. Tools — Enable/Disable Built-in

**Action:**
1. GET `/api/dashboard/digital-employees/{id}/tools` — list available tools
2. Note a specific tool (e.g., web_search) and its current enabled state
3. Toggle it OFF via the tools API
4. GET `/api/dashboard/digital-employees/{id}/package` — check tools in package
5. Toggle it back ON
6. GET package again

**Assertions:**
- Disabled tool NOT present in package `tools.platform`
- Re-enabled tool IS present in package `tools.platform`
- Toggle API returns success

### S15. Tools — Custom JavaScript Tool

**Action:**
1. POST `/api/dashboard/digital-employees/{id}/custom-tools` with:
   - name: "add_numbers"
   - description: "Add two numbers together"
   - parameters: `{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"]}`
   - code: `return { result: input.a + input.b }`
   - language: "javascript"
2. Note: tool will be created with `approved=false`
3. PUT `/api/dashboard/digital-employees/{id}/custom-tools/{toolId}` with `{ "approved": true }`
4. Chat with employee: "Use the add_numbers tool to add 7 and 13"
5. DELETE `/api/dashboard/digital-employees/{id}/custom-tools/{toolId}`

**Assertions:**
- Step 1: tool created, `approved=false`
- Step 3: tool updated, `approved=true`
- Step 4: chat response `tool_calls` includes toolName containing "add_numbers", output contains result=20
- Step 5: tool deleted, no longer in tools list

### S16. Skills — Platform Skills

**Action:**
1. GET `/api/dashboard/digital-employees/{id}/skills` — list available platform skills
2. Toggle a skill ON (POST or PUT depending on API)
3. GET `/api/dashboard/digital-employees/{id}/package` — check skills section
4. Toggle skill OFF
5. GET package again

**Assertions:**
- Enabled skill appears in package `skills.platform` with content
- Disabled skill does NOT appear in package
- Toggle API returns success

### S17. Skills — ClawHub Marketplace

**Action:**
1. GET `/api/dashboard/digital-employees/{id}/skills/search` — list ClawHub skills
2. POST `/api/dashboard/digital-employees/{id}/skills` — install a popular skill (use a well-known slug)
3. GET `/api/dashboard/digital-employees/{id}/skills` — verify installed
4. DELETE `/api/dashboard/digital-employees/{id}/skills/{skillId}` — uninstall

**Assertions:**
- ClawHub returns non-empty skill list with slug, name, stats fields
- Installed skill appears in employee's skill list with content populated
- After uninstall: skill removed from list

### S18. Memory

**Action:**
1. Chat with employee: "Remember that our company mascot is a penguin named Tux"
2. GET `/api/dashboard/digital-employees/{id}/memory` — check for entries
3. Read MEMORY.md via workspace files API
4. PUT update MEMORY.md with additional line: "## Important: The company color is blue"
5. Chat: "What is our company mascot?"
6. Check if response mentions "Tux" or "penguin"

**Assertions:**
- After step 1: either MEMORY.md updated or daily note entry created (check both)
- MEMORY.md readable and contains expected content after PUT
- Employee correctly recalls mascot info in step 5 response
- Memory endpoint returns entries

### S19. Activity Feed & Cost Tracking

**Action:** GET `/api/dashboard/digital-employees/{id}/activity?limit=50`

**Assertions:**
- Events from previous chats appear (run_started, run_completed types at minimum)
- If approvals occurred in S10/S11: approval events present
- Completed runs have token data: `promptTokens > 0` or `completionTokens > 0`
- At least some runs show non-zero token counts (cost is derivable from tokens)

### S20. Triggers / Schedules

**Action:**
1. POST `/api/dashboard/digital-employees/{id}/triggers` — create trigger: name="every-minute-test", expression="* * * * *", enabled=true
2. GET `/api/dashboard/digital-employees/{id}/triggers` — verify listed
3. Wait ~70s, check runs: GET `/api/dashboard/digital-employees/{id}/runs`
4. DELETE `/api/dashboard/digital-employees/{id}/triggers/{triggerId}`
5. Verify trigger removed from list

**Note:** Cron execution happens inside the RantaiClaw container. The container needs to pick up the schedule from the package config. A container restart or package re-sync may be needed after creating the trigger.

**Assertions:**
- Trigger appears in list with correct cron expression
- After wait: at least one run with trigger="schedule" appears (if container picks up cron)
- After deletion: trigger removed from list

### S21. Demotion Flow

**Action:**
- With employee at L4 (from S13), POST `/api/dashboard/digital-employees/{id}/trust/demote`
- GET trust endpoint

**Assertions:**
- Level decreased (L4→L3 or as defined by demotion logic)
- Trust API reflects new lower level

---

## Pass/Fail Standards

**PASS requires ALL of:**
- Correct HTTP status code returned
- Expected field values match exactly
- State changes persist on re-fetch
- For chat-based tests: employee uses correct tool (verified via `tool_calls`)
- For approval tests: proper events/status recorded

**FAIL if ANY of:**
- API returns unexpected status or error
- Field values don't match expectations
- Employee hallucinates tool usage instead of actually calling it
- Events/activity not recorded
- State doesn't persist on re-fetch
- Container crashes or becomes unresponsive

**On failure:** Stop, diagnose root cause, fix (platform or RantaiClaw code), rebuild if needed, retest. No marking PASS until verified.

## Test Output Format

```
S1. Create Employee (DRAFT)
   Action: POST /api/dashboard/digital-employees { name: "Lifecycle Bot", ... }
   Expected: status=DRAFT, sandboxMode=true
   Actual: status=DRAFT, sandboxMode=true
   Result: PASS
```

## Out of Scope

- Integrations (Telegram, WhatsApp, Slack, etc.) — require human interaction
- Team/group-level features (tested in prior session)
- Cross-employee task review (tested and fixed in prior session)
- UI/browser testing — API-only verification
