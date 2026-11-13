# RantAI Agents

Open-source platform for building AI assistants: an agent builder, streaming chat with memory, tools,
knowledge-base retrieval and workflows. The app is Next.js on Bun (`server.ts`) over Postgres
(Prisma), SurrealDB and S3. It is being ported to Rust piece by piece under `rust/` (plan:
`docs/port/plan.md`); RantAI Cloud consumes this repository as a git submodule.

## Commands

| What | Command |
|---|---|
| Everything, before any handoff | `scripts/check.sh` (budget: 10 minutes) |
| Only the parts your change can affect, while iterating | `scripts/check.sh --changed` (budget: 2 minutes) |
| One test | `bunx vitest run path/to/file.test.ts -t "name"`; Rust: `cd rust && cargo test -p <crate> <name>` |
| Run it locally | `bun install --ignore-scripts && bunx prisma generate && bun run dev`; Rust: `cd rust && cargo run -p agents-server` (needs `DATABASE_URL`) |

## Where code lives

- `src/app/api/**/route.ts` — thin HTTP routes; they call `src/features/<slice>/service.ts`
  (`bun run check:thin-routes`).
- `src/features/<slice>/` — one capability each: `schema.ts` (zod), `service.ts`, `repository.ts`.
- `src/lib/` — shared engines (llm, memory, rag, tools, prompts). Features import lib, never the
  other way (`bun run check:domain-imports`).
- `prisma/` — the schema and migrations. Prisma owns the database for both TypeScript and Rust.
- `rust/crates/` — the port. `agents-core` and `agents-contracts` are pure (no I/O,
  `tests/boundary.rs` enforces it); `agents-auth`, `agents-store`, `agents-llm` do I/O;
  `agents-server` is the axum composition root.
- `docs/port/` — the port plan, ledger and deliberate differences. Read them before touching `rust/`.

## Rules the gate enforces

`scripts/check.sh` and CI fail on these. A rule that exists only as a sentence here will be broken.

1. Tests need Postgres: `DATABASE_URL` pointing at a throwaway database with
   `bunx prisma migrate deploy` applied. Without it 13 test files fail.
2. Routes stay thin, domains import only their own folders, the KB has a boundary, and the frontend
   follows `CONTRIBUTING.md`: the four `bun run check:*` scripts.
3. Rust: `cargo fmt`, `clippy -D warnings` with no `unwrap`/`expect`/`panic`/indexing outside tests,
   and every `#[allow]` carries `reason = "..."` on the same line.
4. Files over 600 lines (1,000 for Rust) fail; those already over are frozen in
   `.agents/size-baseline.tsv` and may only shrink. Counts in `.agents/ratchet.tsv` may only fall.

## Conventions

The same in every RantAI repository. The full list is `docs/conventions.md`; read it before you add
an endpoint, an error, a log line, a config variable or a table. The ones broken most often:

- Every error response is `{ "error": { "code", "message", "requestId" } }`, built by one function.
- A `code` is a row of `.agents/error-codes.tsv`. New code: add a row, run
  `scripts/error-codes.sh --write`. Never rename or remove a row. Its status comes from the table.
- No internal text in a message: no exception text, SQL or upstream response. Log it instead.
- JSON fields are `camelCase`; times are `2026-11-11T08:30:00.000Z` in fields ending `At`.
- A list returns `{ "data": [...], "nextCursor": ... }`, never a bare array.
- Tests assert on the status and the `code`, not on message text.
- Commit subject: `type(scope): summary`.

## Working agreements

1. **Evidence, not claims.** "Green" means you ran `scripts/check.sh` after your last edit and can
   quote its last line. Anything you did not run is `not verified`.
2. **Never weaken a gate to get green.** No deleted or skipped tests, no suppression without a reason
   on the same line, no edits to anything in `.agents/protected-paths`. If a test is wrong, say so
   and stop.
3. **When the plan and the code disagree, do not pick a side silently.** Stop and report, or follow
   the code or contract test and list it under DEVIATIONS in your handoff.
4. **Stay in scope.** Change only the paths your task names. Everything else you noticed goes in the
   handoff.
5. **Proof depends on the change.** Logic or data: a test that failed before and passes now, in
   the module's existing test file. Visual: before and after captures. Server only: the test plus a
   short runtime transcript. Nobody will read your diff; the proof is what gets read.
6. **Comments say why, or nothing.** One line for a constraint the code cannot show. If a line looks
   wrong but is right, say why at that line, or the next reader will "fix" it.
7. **Search before you write.** Look for an existing helper first. A second copy is a review finding.
   New code goes in a file named for what it does, not at the bottom of the nearest big one. The
   gate fails a source file over 600 lines (1,000 for Rust), and a file already over that may only
   shrink.
8. **No new dependency** without the owner's approval. Say why you need it in the handoff.
9. **Keep the gate fast.** If it prints `check: SLOW`, or your change makes it slower, say so in the
   handoff. Speed comes from caching and from smaller crates or packages, never from removing tests.

## Traps

Things that went wrong in this repo. Add a line when the same mistake happens twice. Delete the line
once a lint rule or a test catches it.

- `bun install` fails on `canvas` without the cairo dev libraries; use `--ignore-scripts` unless you
  need canvas at runtime.
- `bun run lint` exits 127: eslint is not a dependency yet, so lint is not in the gate.
- `pnpm-lock.yaml` is stale; bun is the package manager.

## Roles

- You are the long-lived thread connected to the tracker: you are the **desk**. Load the `desk` skill.
- Another agent gave you a brief: you are the **worker**. Follow the brief and end with its handoff.
- The desk, or a person, asked you to plan, delegate or review one feature: you are the **lead**.
  Load the `orchestrate` skill first.
- You were asked to bring this repository up to the guidelines, or to clean it up: load the
  `adopt-guidelines` skill.
- You were asked to move code to another language: load the `port-code` skill.
