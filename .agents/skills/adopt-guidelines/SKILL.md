---
name: adopt-guidelines
description: Bring an existing repository up to the engineering guidelines without stopping feature work - audit it with a script, get the gate green on the code as it is, freeze today's violations with a ratchet, then refactor one area at a time behind characterization tests. Use when asked to refactor a codebase to follow the guidelines, clean up a legacy repository, or prepare a repository for agent workers.
---

# Adopt the guidelines in an existing repository

The order matters, and each step is one small pull request. Do not combine steps, and do not start
refactoring before step 7.

## 1. Audit. A script reads; you do not.

```bash
scripts/audit.sh
```

It prints every gap and ready-made ratchet lines. Do not open files to find out what state the
repository is in. Put the audit summary in the tracker.

## 2. Get the gate green on the code as it is

Edit the CONFIGURE block of `scripts/check.sh` until it prints `check: PASS`, without touching
product code. When a lint rule fails on hundreds of existing lines, do not fix them now and do not
switch the rule off: make it a ratchet metric in step 3.

Note how long it took. If the full gate needs more than 10 minutes, or CI more than 15, set
`BUDGET_FULL` and the workflow's `timeout-minutes` to today's time rounded up, and tell the owner.
From then on they only go down: the `sweep` skill brings them towards the budget. The first lever
is parts: split `PARTS` by crate or package group, and list the shared paths in `ALL_PATHS`, so a
pull request runs only what it can break. Require the `ci-required` check in branch protection.

## 3. Freeze today's violations

Paste the audit's ratchet lines into `.agents/ratchet.tsv`, then:

```bash
scripts/ratchet.sh --update     # writes .agents/ratchet.lock
```

Files that are already too long get the same treatment, one by one:

```bash
scripts/file-size.sh --update   # writes .agents/size-baseline.tsv
```

From this commit on, each count and each oversized file can shrink and can never grow. New code is
held to the rules at once; old code is paid down when someone is there anyway.

## 4. Instructions and protection

Fill in `AGENTS.md` by hand: commands, where code lives, the traps. List this repository's contract
tests, applied migrations and lint configs in `.agents/protected-paths`. Turn on the hook
(`scripts/setup-worktree.sh`) and CI.

## 5. Conventions: record the differences first

Compare what the API does today with `docs/conventions.md`: the error body, the statuses, field
casing, lists, timestamps, the request id, log fields, config names. Check by calling it or by
reading the one error type, not by reading every handler. Then:

- Point an `@emit` line in `.agents/error-codes.tsv` at the contracts folder, add this API's own
  codes, and run `scripts/error-codes.sh --write`.
- Fix now what no client can depend on: internal text in messages, a missing `X-Request-Id`, log
  field names, undocumented config variables.
- Do not change a response shape, a field name or a status that clients already use. List each one
  in the last section of `docs/conventions.md` for the owner; it changes at the next API version.

## 6. Choose what to refactor, and what to leave

Refactor an area only if a feature is planned there soon or bugs keep coming from it. Write the
list in the tracker and get the owner's yes. Everything else stays behind the ratchet.

## 7. Lock behaviour before you move code

For each area on the list, write characterization tests on its public surface: what it returns
today for real inputs, including behaviour that looks wrong. Commit them and add them to
`.agents/protected-paths`. They are the acceptance tests for every slice that follows.

## 8. One kind of change per slice

| Kind of slice | What makes it safe |
|---|---|
| Move or rename only | No line of logic changes. Tests are not edited. `git diff -M --stat` shows renames. |
| Pull shared types into the contracts folder | Types only. Callers change their imports and nothing else. |
| Enforce one boundary rule | Add the rule to the boundary check first, as a ratchet metric; then drive it to zero. |
| Typed errors in one module | The characterization tests pin the error cases before the change. |
| Fix behaviour | Never inside a refactor slice. Its own pull request, failing test first. |

Slices in different directories can go to workers in parallel: load the `orchestrate` skill. The
scope regex of each brief is that slice's directory.

## 9. Tighten

At each merge the lead runs `scripts/ratchet.sh --update`. When a metric reaches zero, turn it into
a lint rule or a test and delete its line.

## Stop and ask the owner when

- behaviour is not deterministic enough to characterize (time, randomness, a live service);
- a refactor needs a change to something another team consumes;
- a characterization test shows behaviour that is plainly a production bug.
