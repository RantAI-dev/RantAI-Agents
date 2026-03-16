# Digital Employees Feature Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove DevOps/operational features from the Digital Employees UI to focus on the ClickUp-like work-management use case.

**Architecture:** Pure removal — no new code, no schema changes, no API changes. Edit 3 files, delete 6 component files. Verification is `bun run build` (Next.js build includes type checking).

**Tech Stack:** Next.js 15, TypeScript, React, bun

---

## Chunk 1: List Page + Detail Page Nav + Activity Tab

### Task 1: Clean up the list page (`page.tsx`)

**Files:**
- Modify: `app/dashboard/digital-employees/page.tsx`

**What to remove:**
1. Icon imports: `MessageSquare`, `GitBranch`, `ArrowRight`
2. Hook imports and usage: `useEmployeeMessages`, `usePipelines`
3. The Teams tab entry from `tabs` array
4. `TabTeams` import and render
5. The sandbox badge from employee grid cards
6. The entire "Team Activity" section (Recent Messages + Pipelines)

---

- [ ] **Step 1: Remove unused icon imports**

In `app/dashboard/digital-employees/page.tsx`, change the icon import block from:
```tsx
import {
  Plus,
  Bot,
  Loader2,
  Search,
  Play,
  Clock,
  Rocket,
  Users,
  Pause,
  Shield,
  Eye,
  Zap,
  LayoutGrid,
  List,
  AlertTriangle,
  MessageSquare,
  GitBranch,
  ArrowRight,
} from "@/lib/icons"
```
To:
```tsx
import {
  Plus,
  Bot,
  Loader2,
  Search,
  Play,
  Clock,
  Rocket,
  Users,
  Pause,
  Shield,
  Eye,
  Zap,
  LayoutGrid,
  List,
  AlertTriangle,
} from "@/lib/icons"
```

- [ ] **Step 2: Remove hook imports**

Remove these two import lines:
```tsx
import { useEmployeeMessages } from "@/hooks/use-employee-messages"
import { usePipelines } from "@/hooks/use-pipelines"
```

> **Important:** Do NOT remove the `formatDistanceToNow` import from `date-fns` — it is used by the `getActivityText` helper function which remains in the file.

- [ ] **Step 3: Remove TabTeams import**

Remove this import line:
```tsx
import TabTeams from "./_components/tab-teams"
```

- [ ] **Step 4: Remove hook usages in component body**

In the `DigitalEmployeesPage` function, remove these two lines:
```tsx
const { messages, isLoading: messagesLoading } = useEmployeeMessages()
const { pipelines, isLoading: pipelinesLoading } = usePipelines()
```

- [ ] **Step 5: Remove Teams tab from tabs array**

Change:
```tsx
const tabs = [
  { key: "employees", label: "Employees" },
  { key: "teams", label: "Teams" },
  { key: "tasks", label: "Tasks" },
]
```
To:
```tsx
const tabs = [
  { key: "employees", label: "Employees" },
  { key: "tasks", label: "Tasks" },
]
```

- [ ] **Step 6: Remove TabTeams render**

Remove this line from the content section:
```tsx
{activeTab === "teams" && <TabTeams />}
```

- [ ] **Step 7: Remove sandbox badge from employee grid cards**

In the grid view employee cards, find and remove this block:
```tsx
{"sandboxMode" in emp && !!(emp as unknown as Record<string, unknown>).sandboxMode && (
  <Badge
    variant="secondary"
    className="text-[10px] px-1.5 py-0.5 shrink-0 bg-amber-500/10 text-amber-500"
  >
    SANDBOX
  </Badge>
)}
```

- [ ] **Step 8: Remove the Team Activity section**

Remove the entire block starting with `{/* Team Activity: Messages & Pipelines */}` through its closing `</motion.div>` and `)}` — this is the section at the bottom of the employees tab content (after the grid/table views) that renders the two side-by-side cards.

The block to remove starts with:
```tsx
{/* Team Activity: Messages & Pipelines */}
{employees.length > 0 && (
  <motion.div
    className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4"
```
And ends with (these are the last two lines of the block — do NOT remove the `</>}` that follows, which closes the outer employees tab fragment):
```tsx
      </motion.div>
        )}
```

- [ ] **Step 9: Verify TypeScript**

Run:
```bash
cd /home/shiro/rantai/RantAI-Agents && bun run build 2>&1 | head -50
```
Expected: no errors related to the modified file.

- [ ] **Step 10: Commit**

```bash
git add app/dashboard/digital-employees/page.tsx
git commit -m "feat: remove messages, pipelines, teams tab and sandbox badge from list page"
```

---

### Task 2: Clean up the detail page nav

**Files:**
- Modify: `app/dashboard/digital-employees/[id]/page.tsx`

**What to remove:**
1. `History` icon import
2. `"history"` from `Section` type
3. History entry from `NAV_ITEMS`
4. `TabHistory` import
5. `historyApprovals` derived variable
6. `TabHistory` render block

---

- [ ] **Step 1: Remove History icon import**

In `app/dashboard/digital-employees/[id]/page.tsx`, remove `History,` from the icon import:
```tsx
import {
  ArrowLeft,
  MessageSquare,
  Loader2,
  Play,
  Rocket,
  Settings,
  Square,
  Zap,
  Folder,
  History,   // ← remove this line
} from "@/lib/icons"
```

- [ ] **Step 2: Remove TabHistory import**

Remove:
```tsx
import { TabHistory } from "./_components/tab-history"
```

- [ ] **Step 3: Update Section type**

Change:
```tsx
type Section = "activity" | "chat" | "history" | "tasks" | "workspace" | "settings"
```
To:
```tsx
type Section = "activity" | "chat" | "tasks" | "workspace" | "settings"
```

- [ ] **Step 4: Remove history entry from NAV_ITEMS**

Change:
```tsx
const NAV_ITEMS: NavItem[] = [
  { id: "activity", label: "Activity", icon: Zap, group: "interact" },
  { id: "chat", label: "Chat", icon: MessageSquare, group: "interact" },
  { id: "history", label: "History", icon: History, group: "interact" },
  { id: "tasks", label: "Tasks", icon: CheckSquare, group: "interact" },
  { id: "workspace", label: "Workspace", icon: Folder, group: "configure" },
  { id: "settings", label: "Settings", icon: Settings, group: "configure" },
]
```
To:
```tsx
const NAV_ITEMS: NavItem[] = [
  { id: "activity", label: "Activity", icon: Zap, group: "interact" },
  { id: "chat", label: "Chat", icon: MessageSquare, group: "interact" },
  { id: "tasks", label: "Tasks", icon: CheckSquare, group: "interact" },
  { id: "workspace", label: "Workspace", icon: Folder, group: "configure" },
  { id: "settings", label: "Settings", icon: Settings, group: "configure" },
]
```

- [ ] **Step 5: Remove historyApprovals variable**

Find and remove this line (around line 465):
```tsx
const historyApprovals = approvals.filter((a) => a.status !== "PENDING")
```

- [ ] **Step 6: Remove TabHistory render block**

Find and remove the History section render:
```tsx
{/* ─── History ─── */}
{activeSection === "history" && (
  <TabHistory
    runs={runs}
    containerRunning={containerRunning}
    employeeStatus={employee.status}
    model={employee.assistant.model}
    onRunNow={handleRunNow}
  />
)}
```

- [ ] **Step 7: Verify TypeScript**

```bash
cd /home/shiro/rantai/RantAI-Agents && bun run build 2>&1 | head -50
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add app/dashboard/digital-employees/[id]/page.tsx
git commit -m "feat: remove history tab from employee detail page"
```

---

### Task 3: Simplify the Activity tab

**Files:**
- Modify: `app/dashboard/digital-employees/[id]/_components/tab-activity.tsx`

**What to remove:**
1. `GoalTracker` import
2. `ErrorPatternsCard` import
3. `<GoalTracker>` render
4. `<ErrorPatternsCard>` render

---

- [ ] **Step 1: Remove GoalTracker and ErrorPatternsCard imports**

Change:
```tsx
import { GoalTracker } from "./goal-tracker"
import { ErrorPatternsCard } from "./error-patterns-card"
import { OnboardingChecklist } from "./onboarding-checklist"
import { SandboxBanner } from "./sandbox-banner"
```
To:
```tsx
import { OnboardingChecklist } from "./onboarding-checklist"
import { SandboxBanner } from "./sandbox-banner"
```

- [ ] **Step 2: Remove GoalTracker render**

Remove:
```tsx
{/* ─── Goal Tracker ─── */}
<GoalTracker employeeId={employee.id} />
```

- [ ] **Step 3: Remove ErrorPatternsCard render**

Remove:
```tsx
{/* ─── Error Patterns ─── */}
<ErrorPatternsCard employeeId={employee.id} runs={runs} />
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd /home/shiro/rantai/RantAI-Agents && bun run build 2>&1 | head -50
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/digital-employees/[id]/_components/tab-activity.tsx
git commit -m "feat: remove goal tracker and error patterns from activity tab"
```

---

### Task 4: Delete dead code files

**Files to delete:**
- `app/dashboard/digital-employees/_components/tab-teams.tsx`
- `app/dashboard/digital-employees/_components/team-card.tsx`
- `app/dashboard/digital-employees/[id]/_components/tab-history.tsx`
- `app/dashboard/digital-employees/[id]/_components/goal-tracker.tsx`
- `app/dashboard/digital-employees/[id]/_components/error-patterns-card.tsx`
- `app/dashboard/digital-employees/[id]/_components/tab-inbox.tsx`

---

- [ ] **Step 1: Delete the files**

```bash
rm app/dashboard/digital-employees/_components/tab-teams.tsx \
   app/dashboard/digital-employees/_components/team-card.tsx \
   app/dashboard/digital-employees/[id]/_components/tab-history.tsx \
   app/dashboard/digital-employees/[id]/_components/goal-tracker.tsx \
   app/dashboard/digital-employees/[id]/_components/error-patterns-card.tsx \
   app/dashboard/digital-employees/[id]/_components/tab-inbox.tsx
```

- [ ] **Step 2: Final TypeScript check**

```bash
cd /home/shiro/rantai/RantAI-Agents && bun run build 2>&1 | head -80
```
Expected: zero errors.

- [ ] **Step 3: Manual verification checklist**

Visually confirm in the browser (or by reading the code):
- [ ] List page tab bar shows: Employees | Tasks (no Teams)
- [ ] List page shows no Messages or Pipelines sections at bottom
- [ ] Employee cards have no SANDBOX badge
- [ ] Detail page sidebar: Activity | Chat | Tasks | Workspace | Settings (no History)
- [ ] Activity tab has no GoalTracker widget or Error Patterns card
- [ ] Activity tab still shows: sandbox banner, onboarding checklist, pending approvals, events feed

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete dead code components after feature cleanup"
```
