# Deliberate differences: RantAI-Agents TypeScript and Rust

Everything the new implementation does differently on purpose. If a behaviour differs and is not
here, it is a bug. The owner delegated these decisions (2026-11-14); each row names who made it.

| # | Where | Old behaviour | New behaviour | Why | Agreed by, date |
|---|---|---|---|---|---|
| 1 | Memory profile writes | In-process per-user promise lock (`lib/memory/profile-lock.ts`) plus compare-and-swap on `updatedAt` | Compare-and-swap (or `SELECT … FOR UPDATE`) only | The in-process lock does not hold across more than one instance | port lead, 2026-11-14 |
| 2 | Tool approval | Pending decisions in an in-process `Map`, 90 s timeout (`lib/tools/approval.ts:71-120`) | Pending decisions in Postgres or Redis | The stream and the approval POST may reach different instances | port lead, 2026-11-14 |
| 3 | LLM failures | The upstream error text was matched with a regex (`/401\|403\|unauthor\|api[_ ]?key/`) to pick what the user sees | The HTTP status picks it: 401/403 → the key message, 429 → the rate-limit message, everything else → the generic message | A regex over upstream wording misses the errors whose wording changes | port lead, 2026-11-14 |
| 4 | Token usage | Only OpenRouter sent `stream_options.include_usage`; house models (MiniMax) reported zero tokens | Every provider is asked for usage, so the cloud edition charges the real tokens | Usage the old code never received was a billing hole | port lead, 2026-11-14 |
| 5 | `<think>` extraction | The characters held back for a split tag are counted in UTF-16 code units (`src/lib/llm/strip-think.ts`) | They are counted in Unicode characters | The two differ only when the tail of a delta holds an astral character | port lead, 2026-11-14 |
| 6 | Tool approval in the loop | The tool's promise waited in memory for the approval POST, then the turn carried on | The executor answers "needs approval"; the loop stops and the caller decides what happens next | The approval store moves out of the process (difference 2), so the loop cannot wait | port lead, 2026-11-14 |
| 7 | Model routing | A model claimed by an admin-managed `LlmProvider` was served from that provider's endpoint and key, and `AI_PROVIDER_MODE=minimax` pinned every model to one MiniMax model outside production (`src/lib/llm/provider-registry.ts`, `src/lib/llm/provider.ts`) | `provider::route` knows the house models and OpenRouter; the managed registry and the dev override are the caller's job | Both need the database and the environment, and this crate does neither | port lead, 2026-11-14 |

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
