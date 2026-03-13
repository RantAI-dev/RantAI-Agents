# Digital Employees Feature Cleanup Design

## Goal

Remove features from the Digital Employees pages that don't serve the primary ClickUp-like "manage AI workers" use case, leaving a focused task-first interface.

## Context

The Digital Employees section has accumulated features from two mental models:
- **Work management (A)** — assign tasks, review output, approve actions (ClickUp-like, primary)
- **Operational monitoring (B)** — run logs, cost/token tracking, error patterns (DevOps-like, secondary)

This cleanup removes Model B features that add noise without serving the primary use case. Error visibility moves to the per-task level (task detail panel already has an events API). No new features are added.

---

## Changes

### 1. List Page (`app/dashboard/digital-employees/page.tsx`)

**Remove:**
- "Team Activity" section (Recent Messages + Pipelines cards at the bottom) — both have dedicated pages (`/dashboard/messages`, `/dashboard/pipelines`)
- **Teams** tab from the tab bar — already removed from sidebar; `TabTeams` component becomes dead code
- **Sandbox badge** from employee cards — sandbox mode is a config concern, not a work-management signal; it stays in Activity (banner) and Settings

**Keep:**
- Stats header (total / active / inactive counts)
- Search, status filter, grid/table toggle
- Employee cards with status badge, autonomy badge, runs count, success rate, quick Run button
- Tasks tab (with open count badge)
- `useDigitalEmployees`, `useTasks` hooks

**Delete (dead code after removal):**
- `useEmployeeMessages` hook usage + import
- `usePipelines` hook usage + import
- `TabTeams` import and render
- `MessageSquare`, `GitBranch`, `ArrowRight` icon imports (if unused)
- `formatDistanceToNow` import from `date-fns` (if only used by Pipelines section)

---

### 2. Detail Page Nav (`app/dashboard/digital-employees/[id]/page.tsx`)

**Remove:**
- `"history"` entry from `NAV_ITEMS` array
- `Section` type updated: remove `"history"` from the union
- `TabHistory` import and render block
- `History` icon import (if unused)

**Resulting nav order:** Activity → Chat → Tasks → Workspace → Settings

---

### 3. Activity Tab (`app/dashboard/digital-employees/[id]/_components/tab-activity.tsx`)

**Remove:**
- `GoalTracker` component and its import — goal/progress tracking belongs in Tasks tab
- `ErrorPatternsCard` component and its import — error patterns are DevOps; per-task errors in Tasks tab replace this

**Keep:**
- Pending approvals section (critical for supervised-mode employees)
- Live run status + recent events feed
- `OnboardingChecklist` (setup guide for new employees)
- `SandboxBanner` (full-width warning when sandbox mode is active — useful context in Activity)
- Activate / Deactivate / Run Now buttons and deploy state

---

### 4. Dead Code Deletion

The following components become unreferenced after the above changes and should be deleted:

- `app/dashboard/digital-employees/_components/tab-teams.tsx`
- `app/dashboard/digital-employees/_components/team-card.tsx`
- `app/dashboard/digital-employees/[id]/_components/tab-history.tsx`
- `app/dashboard/digital-employees/[id]/_components/goal-tracker.tsx`
- `app/dashboard/digital-employees/[id]/_components/error-patterns-card.tsx`

Hooks to check for dead code (remove if no other consumers):
- `hooks/use-employee-messages.ts`
- `hooks/use-employee-groups.ts` (used by TabTeams)

---

## What Does NOT Change

- Chat tab, Tasks tab, Workspace tab, Settings tab — untouched
- Autonomy level badge on employee cards — kept (directly relevant: tells you if employee will ask for approvals)
- `SandboxBanner` inside Activity tab — kept
- Sandbox mode field in Settings — untouched
- All API routes — untouched
- Prisma schema — untouched
- `TabHistory` component file deleted but no API route changes needed (runs data still fetched by `useDigitalEmployee` hook and consumed by Activity tab for the events feed)

---

## Verification

After implementation:
1. List page shows no Messages or Pipelines sections
2. List page tab bar shows only: Employees | Tasks
3. Employee cards show no sandbox badge
4. Detail page sidebar shows: Activity | Chat | Tasks | Workspace | Settings (no History)
5. Activity tab shows no GoalTracker or ErrorPatternsCard
6. Activity tab still shows pending approvals, events feed, onboarding checklist, sandbox banner
7. No TypeScript errors (`bun run build` or `tsc --noEmit`)
8. No dead imports in modified files
