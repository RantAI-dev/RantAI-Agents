# Deliberate differences: RantAI-Agents TypeScript and Rust

Everything the new implementation does differently on purpose. If a behaviour differs and is not
here, it is a bug. The owner delegated these decisions (2026-11-14); each row names who made it.

| # | Where | Old behaviour | New behaviour | Why | Agreed by, date |
|---|---|---|---|---|---|
| 1 | Memory profile writes | In-process per-user promise lock (`lib/memory/profile-lock.ts`) plus compare-and-swap on `updatedAt` | Compare-and-swap (or `SELECT … FOR UPDATE`) only | The in-process lock does not hold across more than one instance | port lead, 2026-11-14 |
| 2 | Tool approval | Pending decisions in an in-process `Map`, 90 s timeout (`lib/tools/approval.ts:71-120`) | Pending decisions in Postgres or Redis | The stream and the approval POST may reach different instances | port lead, 2026-11-14 |

## Old bugs the Rust version fixes

Per plan §0 decision 3, these are fixed in Rust rather than carried over. Source:
`docs/port/qa-backlog.md` and the module maps in `plan.md` §6.

| # | Where | What is wrong | Tracker |
|---|---|---|---|
| 1 | Memory tools | `saveMemory`/`forgetMemory` fire uninvited: approval-exempt, and the system prompt says "you MUST call" | TC-1548 |
| 2 | `lib/llm/script-guard.ts` | Strips non-Latin scripts the user explicitly asked for | TC-1545 |
| 3 | Chat regenerate | Truncates every later message with no confirmation or versioning | TC-1546 |
| 4 | Message timestamps | Relative to page load, not `createdAt` | TC-1549 |
| 5 | Edit history | Versions are not persisted across refresh | TC-944 |
| 6 | Chat after the assistant is deleted | A 10-second timeout error instead of an explanation | TC-1032 |
| 7 | Opening message and starters | Saved but not shown in New Chat | TC-1038 |
| 8 | `GET /api/dashboard/memory?type=` | An invalid type returns 500 instead of 400 | memory map |
| 9 | `DELETE /api/dashboard/memory` | Uses the body without checking `parsed.success` | memory map |
