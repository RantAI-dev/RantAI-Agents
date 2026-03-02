# 02 — Knowledge Base Relations

## Problem

Knowledge base groups are linked to agents via a denormalized `String[]` field:

```prisma
// Current — on Assistant model
knowledgeBaseGroupIds String[]
```

This causes:
- **No cascade deletes** — deleting a KB group leaves orphaned IDs in the array
- **No reverse queries** — cannot query "which agents use this KB group?"
- **No data integrity** — any string can be stored, no FK validation
- **Inconsistent pattern** — every other binding (tools, skills, MCP) uses a junction table

## Solution

### 1. AssistantKnowledgeGroup Junction Table

```prisma
model AssistantKnowledgeGroup {
  id                   String             @id @default(cuid())
  assistantId          String
  assistant            Assistant          @relation(fields: [assistantId], references: [id], onDelete: Cascade)
  knowledgeBaseGroupId String
  knowledgeBaseGroup   KnowledgeBaseGroup @relation(fields: [knowledgeBaseGroupId], references: [id], onDelete: Cascade)
  enabled              Boolean            @default(true)
  createdAt            DateTime           @default(now())

  @@unique([assistantId, knowledgeBaseGroupId])
  @@index([assistantId])
  @@index([knowledgeBaseGroupId])
}
```

Update `Assistant`:
```prisma
model Assistant {
  // DEPRECATE: knowledgeBaseGroupIds String[]
  knowledgeBaseGroups AssistantKnowledgeGroup[]  // ADD
}
```

Update `KnowledgeBaseGroup`:
```prisma
model KnowledgeBaseGroup {
  // ... existing ...
  assistantKnowledgeGroups AssistantKnowledgeGroup[]  // ADD — enables reverse queries
}
```

### 2. Migration

1. Create `AssistantKnowledgeGroup` table
2. For each `Assistant` where `knowledgeBaseGroupIds` is non-empty:
   - For each ID in the array, create an `AssistantKnowledgeGroup` row (skip invalid IDs)
3. Keep `knowledgeBaseGroupIds` field temporarily for rollback safety
4. Remove `knowledgeBaseGroupIds` field in a follow-up migration after verification

### 3. Code Changes

| File | Change |
|------|--------|
| `lib/tools/registry.ts` | Read from `AssistantKnowledgeGroup` instead of `knowledgeBaseGroupIds` |
| `app/dashboard/agent-builder/_components/tab-knowledge.tsx` | Use junction table API instead of saving string array |
| `app/api/assistants/[id]/knowledge/route.ts` | Create — GET/PUT knowledge group bindings |
| Chat API route | Pass KB group IDs from junction table to tool context |

### 4. Reverse Query Benefit

With the junction table, the KB management page can show:
- "Used by: Agent A, Agent B" for each knowledge group
- Warning when deleting a group that's attached to agents
- Dashboard metric: "X knowledge groups across Y agents"

This also matters for Digital Employees — when packaging an employee, you query `AssistantKnowledgeGroup` to know which KB groups to include.

---

## Priority: P0

This is a data integrity fix, not a feature. Do it before building anything on top of the composition model.
