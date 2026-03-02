# 09 — Multi-Employee Coordination

> **Phase 4 — Future.** Design now, build later. This document captures the architecture so we don't paint ourselves into a corner.

## Concept

Multiple Digital Employees work together as a team. One employee's output becomes another's input. This enables pipelines like:

```
Researcher  ──►  Writer  ──►  Editor  ──►  Publisher
   │                │             │             │
   │ Research       │ Draft       │ Polished    │ Published
   │ findings       │ content     │ content     │ confirmation
   ▼                ▼             ▼             ▼
```

## Team Model

```prisma
model EmployeeTeam {
  id              String              @id @default(cuid())
  name            String              // "Content Pipeline"
  description     String?

  // Team members
  members         EmployeeTeamMember[]

  // Pipeline definition
  pipeline        Json                // See TeamPipeline type below

  // Scheduling
  trigger         Json                // Same TriggerConfig as workflows
  enabled         Boolean             @default(true)

  organizationId  String
  organization    Organization        @relation(fields: [organizationId], references: [id])
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
}

model EmployeeTeamMember {
  id                String          @id @default(cuid())
  teamId            String
  team              EmployeeTeam    @relation(fields: [teamId], references: [id], onDelete: Cascade)
  digitalEmployeeId String
  digitalEmployee   DigitalEmployee @relation(fields: [digitalEmployeeId], references: [id])
  role              String          // "researcher", "writer", "reviewer", "publisher"
  order             Int             // Execution order in pipeline

  @@unique([teamId, digitalEmployeeId])
  @@index([teamId])
}
```

## Pipeline Types

### Linear Pipeline
```
A → B → C → D
```
Each employee runs in sequence. Output of one becomes input of next.

### Fan-Out / Fan-In
```
    ┌─► B ─┐
A ──┤      ├──► D
    └─► C ─┘
```
A produces output, B and C process it in parallel, D merges results.

### Conditional Routing
```
        ┌─► B (if positive)
A ──────┤
        └─► C (if negative)
```
A's output determines which employee handles next.

### Feedback Loop
```
A → B → C ──► D (if approved)
         │
         └──► B (if needs revision, with feedback)
```
C reviews B's work. If not good enough, sends back to B with notes.

## Pipeline Definition Format

```typescript
interface TeamPipeline {
  steps: PipelineStep[]
  edges: PipelineEdge[]
}

interface PipelineStep {
  id: string
  employeeId: string               // Which employee handles this step
  workflowId: string               // Which of the employee's workflows to run
  inputMapping?: Record<string, string>  // Map previous step output to workflow input
  approvalRequired?: boolean       // Require human approval before passing to next step
}

interface PipelineEdge {
  from: string                     // Step ID
  to: string                      // Step ID
  condition?: string               // Expression: "output.sentiment === 'positive'"
  label?: string                   // "If approved", "If needs revision"
}
```

## Communication Between Employees

Employees don't talk to each other directly. Communication flows through the platform:

```
Employee A completes step
        │
        ▼
Platform Pipeline Engine
  1. Save A's output
  2. Evaluate edge conditions
  3. Map output to next step's input
  4. Trigger Employee B's workflow
        │
        ▼
Employee B starts with A's output as input
```

This keeps employees isolated (each in its own VM) while enabling coordination.

### Shared Context (Optional)

For employees that need shared context beyond step-by-step output passing:

```typescript
interface SharedTeamContext {
  teamRunId: string
  sharedMemory: Record<string, unknown>  // Key-value store accessible by all team members
  artifacts: TeamArtifact[]              // Files/documents produced by any team member
}

interface TeamArtifact {
  id: string
  producedBy: string    // Employee ID
  stepId: string
  type: string          // "document", "data", "image"
  content: unknown
  createdAt: string
}
```

Shared context is stored on the platform (not in individual VMs) and injected into each employee's workflow input when their step starts.

## Team Run Model

```prisma
model TeamRun {
  id              String        @id @default(cuid())
  teamId          String
  team            EmployeeTeam  @relation(fields: [teamId], references: [id])

  status          RunStatus
  currentStep     String?       // Current pipeline step ID

  // Step execution trace
  stepResults     Json          // { stepId: { status, output, employeeRunId, completedAt } }
  sharedContext   Json?         // Team-level shared data

  startedAt       DateTime      @default(now())
  completedAt     DateTime?

  @@index([teamId, startedAt])
}
```

## UI: Team Pipeline Editor

A simplified visual editor (similar to workflow editor but at a higher level):

```
┌─────────────────────────────────────────────────┐
│  Content Pipeline                    [▶ Run]     │
│                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │🔍        │    │📝        │    │📤        │  │
│  │Researcher│───►│Writer    │───►│Publisher  │  │
│  │          │    │          │    │          │  │
│  │research  │    │draft     │    │publish   │  │
│  │workflow  │    │workflow  │    │workflow  │  │
│  └──────────┘    └──────────┘    └──────────┘  │
│                                                  │
│  Click an employee to configure input mapping    │
└─────────────────────────────────────────────────┘
```

## Design Constraints for Earlier Phases

To support multi-employee coordination in Phase 4, earlier phases must:

1. **Workflow inputs/outputs must be well-typed** (Phase 1): `WorkflowVariables` already defines `inputs` and `outputs`. Ensure these are actually validated and populated.

2. **EmployeeRun must capture structured output** (Phase 2): Run output can't just be free text — it needs to be a structured JSON that the pipeline engine can route.

3. **Employee Package must be self-contained** (Phase 2): An employee's capabilities shouldn't depend on another employee existing. Each employee works independently; coordination is external.

4. **Approval gateway must support team context** (Phase 3): When a supervisor approves a step in a pipeline, the notification should show "Step 2 of 4 in Content Pipeline" — not just "Employee X needs approval."
