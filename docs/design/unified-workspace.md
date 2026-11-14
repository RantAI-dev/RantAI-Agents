# One workspace: projects, chat-built workflows, media in chat, no digital employees

Owner direction, 2026-11-14:
- workflows can be made through chat (the workflow page stays)
- the digital-employee feature is removed
- image and video generation are called from chat
- chats are organised in projects/folders with a shared memory

This builds on `identity-and-access.md` (RBAC, units, sharing) and `artifacts-research.md` (one
artifact system, studio mode, comments, share links, sandbox).

## 1. The shape

```
Organization
 └─ Project (folder, nestable)        members by org / unit / user grant, like agents
     ├─ instructions + files          shared context for every chat in the project
     ├─ project memory                facts the team shares (§3)
     └─ Chat sessions
         └─ turns → tools → artifacts (pages, decks, docs, sheets, motion, images, video,
                                       workflow drafts), all in the canvas beside the chat
```

Everything is started from chat. The dedicated pages (workflow editor, media library, org
settings) are views onto the same objects, not separate products.

## 2. Projects and folders

- **New models:**
  - `Project { id, organizationId, parentId?, name, instructions, createdBy, archivedAt }`
  - `DashboardSession.projectId?` (a chat outside any project stays personal)
  - `ProjectFile` (reuses the artifact/file storage)
- **Access:** reuse the S1 subject grants (`org | unit | user`, levels `view | edit | manage`) with
  the same unit inheritance. Only `manage` changes members and instructions.
- **Folders** are projects with a parent: one tree, one permission model. Moving a chat into a project
  shares it with the project's members. The UI says so before it happens.
- **Chat sharing (S5) stays** for sharing one chat outside its project.
- **The sidebar** shows projects as a tree with their chats, then the personal chats.

## 3. Shared memory

Three scopes, so nothing personal leaks:

| Scope | Who reads | Who writes | Source today |
|---|---|---|---|
| **User** | only that user, in every chat | the agent, from the user's own turns | today's long-term profile (`UserMemory`) |
| **Project** | every member, in the project's chats | the agent when a fact is about the project's work (decisions, glossary, people, conventions); members can edit it | new |
| **Session** | that chat | the agent | today's working memory |

- **The memory tools gain a `scope`.** The prompt says to put personal facts in user memory and work
  facts in project memory. Saving to project memory is **visible in the chat** ("Saved to project
  memory: …"), with an undo, so members always know what the team can see. This also answers QA
  TC-1548 (uninvited memory saves).
- **Project memory has its own page** under project settings: list, edit, delete, audit. A viewer of the
  project can read it.
- **Prompt assembly:** project instructions, then project memory, then user memory, then the session.
  Each block has a size budget.

## 4. Workflows from chat

- **New tools:** `propose_workflow` (create) and `revise_workflow` (patch).
  - The agent writes nodes and edges against the existing node catalogue (`src/lib/workflow/nodes`).
  - They are checked with the existing compiler (`src/lib/workflow/compiler.ts`). An error goes back to
    the agent, as artifact validation does.
- **The proposal opens in the canvas** as a **workflow artifact**: the graph, read-only, plus the
  inputs/outputs and a dry-run on sample input. Comments on a node use the same anchoring as other
  artifacts (`nodeId`).
- **"Save as workflow"** creates a `Workflow` in `DRAFT`, owned by the project's org and linked to the
  session. "Open in editor" goes to the existing workflow page, which stays the place for fine edits,
  triggers, credentials and run history.
- **`run_workflow`** runs a saved workflow from chat: it shows progress, then the output as an artifact.
  It needs `workflows.use`.
- **Permissions (new, in `authz`):** `workflows.create`, `workflows.manage`, `workflows.use`. Like
  agents, the default is that admins create and manage, and members use what is granted to them. To
  decide in §7.

## 5. Image, video and audio in chat

- **Tools:** `generate_image`, `edit_image` (with a region from a comment anchor), `generate_video`,
  `generate_audio`/TTS. They call the existing media service (`src/features/media`, `MediaJob`,
  `MediaAsset`) and its house models.
- **Async in the stream:** a job emits a `data-media-job` progress part. The result becomes a **media
  artifact** in the canvas (versions, comments on a region or time range, share as link, add to the
  project). The media library page lists the same assets.
- **Motion vs generated video:**
  - "Motion" (code animation) is the revideo artifact kind, rendered in the sandbox.
  - "Video" is a provider model.
  - The agent picks by intent. The user can force either.
- **Plan and credits:** the cloud `ChatMeter` hook meters each job. QA TC-1683 (modality and model
  not cross-checked) is fixed by checking the modality before calling the provider.

## 6. Removing digital employees

**Size:** about 18k lines in `src/features/digital-employees`, 43 `dashboard/digital-employees`
routes, 19 `/api/runtime` routes, `lib/digital-employee` (the Docker orchestrator), models
`DigitalEmployee`, `EmployeeGroup`, `EmployeeTask`, `EmployeeMessage` and related. **103 files
outside the feature reference it.**

1. **Inventory first.** Find what other features reuse: approvals, the WhatsApp webhooks, custom tools,
   trust, goals, `AuditLog`'s `employeeId`, scheduling. Keep what chat or workflows need and move it
   out; delete the rest.
2. **Behind a flag, then delete:** hide the UI and refuse its routes (410), then remove the code once
   nothing references it.
3. **Data:** export each org's employees and runs to JSON in S3 (kept 90 days, to decide), then drop
   the tables in one migration.
4. **The QA backlog's digital-employee cases are closed as "removed".**

What users relied on digital employees for (scheduled, autonomous work) is covered by **workflows
with schedule triggers** plus chat-built workflows.

## 7. Decisions for the owner

1. Who may **create workflows**: admins only (like agents), or members too?
2. **Project memory writes:** automatic with a visible notice and undo (proposed), or only when a
   member confirms?
3. **Folders:** nested to any depth (proposed), or one level?
4. **Digital-employee data:** export and keep for how long, or delete outright?
5. **Video:** which provider models count as house models for video (cost)?

## 8. Order, with the other tracks

1. **A0 security hotfix** (artifacts research §0)
2. **Design** (Claude Design exploration → design system), covering the project sidebar, chat with
   canvas, studio mode, and the media/workflow artifacts
3. **Digital-employee inventory and flag-off** (cheap, and it shrinks what has to be ported)
4. **Projects and the memory scopes** (schema, Rust store and routes, prompt assembly)
5. **The artifact system** (A3–A7: one model, versions, comments, links, sandbox loop)
6. **Workflow and media tools in chat**, on top of the artifact system
7. **Studio mode** (A8), then motion (A9)
8. Delete the digital-employee code and tables
