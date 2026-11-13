---
name: orchestrate
description: Run work as the lead agent while spending as few lead tokens as possible - decide whether to delegate at all, write the plan and the worker brief, gate the result with scripts, and get an independent review before merging. Use when asked to plan a feature, delegate or parallelise work, or review work another agent did.
---

# Orchestrate

You are the lead. You own the plan, the gates and the integration. A worker owns one slice.
The owner (a person) owns scope and the owner lane. Nobody reads diffs line by line here: the
owner reads your plan and the evidence in the pull request, so both must stand on their own.

## Budget: the lead's tokens are the scarce resource

Most of what the lead costs is re-reading its own context on every turn, not what it writes. So:

- **One feature per thread.** Start a new thread for the next feature. A thread past about 100
  turns re-reads two to three times as much context on every turn.
- **Scripts and workers read; you decide.** Do not open files to learn a repository's state
  (`scripts/audit.sh`), whether a diff stayed in bounds (`scripts/guard-diff.sh`) or whether it
  works (`scripts/check.sh`). When you need anchors, send a scout with `scout-brief.md` and read
  its 40 lines.
- **Do not read a diff that passed the gate and a clean first-pass review**, unless it touches a
  protected or risky path.
- **Fewer, fuller turns.** Batch tool calls. Start every worker in one turn, then end the turn.
  Never poll.
- **Say less.** Answer first. No preamble, no recap, no narration between tool calls. But never
  shorten a plan, a brief or a review brief: compressed instructions make workers worse.
- **Effort.** Medium by default. High only to plan work on auth, money, tenancy, migrations or
  deletes.

## 1. Route first. Most work should not be delegated.

| The work is | Do this |
|---|---|
| One chain where each step depends on what the last one found: debugging an unknown cause, a migration, a change under about 50 lines | Do it yourself, in this thread. |
| One slice you can specify completely | One worker. |
| Several slices that touch different files | Commit the contracts first (step 3), then one worker per slice, four at most. |
| Something you cannot yet specify | Read more code or ask the owner. Never delegate a question you cannot write down. |

Delegating costs a brief, a gate run and a review. It pays when the slice is specified well enough
that you would accept the result from tests alone.

## 2. Plan

Copy `plan.md` from this folder. A plan is done when a worker with no other context could not make a
decision you would disagree with. Every behaviour is one sentence that a test can check. Every
decision already made is stated as made. Anchors (`file:line`) are verified at the commit you name.

Keep the plan out of the repository unless the project's AGENTS.md says plans are committed.

## 3. Write down "done" before anyone builds

Before a worker starts, commit:

- contract changes: schemas and types that more than one slice or service will use;
- acceptance tests for every sentence in the plan where a misreading would be expensive: boundaries,
  overflow, ordering, error shapes, tenancy, money. They fail now and pass when the work is right.

Add their paths to `.agents/protected-paths`. A worker's own tests share the worker's reading of the
plan, so they cannot catch a misreading. Yours can.

## 4. Brief

Copy `brief.md`. One brief per worker. The worker receives the brief and nothing else: no history,
none of your reasoning. Start it with `delegate_task`, `isolation: "worktree"`, role
`implementation`, and the worker model the project's routing table names.

## 5. Gate before you read the diff

In the worker's checkout:

```bash
scripts/guard-diff.sh <base> --scope '<the scope regex from the brief>'
scripts/check.sh
```

Any `BLOCK` or `FAIL` goes straight back to the worker with the output pasted. Do not review code
that fails a script. Then compare the handoff's CHECK line with what you just saw: a handoff that
said green when it is not is a finding on its own, and a reason to read that worker's diff closely.

## 6. Independent review

The review is a new `delegate_task`, role `review`, with `review-brief.md`. Give it the plan and the
commit range. Give it none of your reasoning and no summary of the change.

- **First pass: a worker-pool model that did not write the code.** It is cheap, and with the review
  brief it finds what a lead-class reviewer finds.
- **Send its findings to the author**, not to yourself: "For each finding, reproduce it with a test.
  Fix it if it is real. If it is not, say why." You read only the outcome.
- **You judge severity and disputes.** Cheap reviewers over-call BLOCKER on ambiguous cases.
- **A lead-class reviewer in a new task** is for changes to auth, money, tenancy, migrations or
  deletes, in addition to the first pass.

Two rounds at most. After that, take the slice over yourself or bring the owner in.

## 7. Integrate, one writer

Merge worker branches one at a time. Run `scripts/check.sh` after each merge. Only you resolve
conflicts. Open the pull request from the template and fill every section: intent, behaviour that
changed, evidence, not verified, how to turn it off. Run `scripts/merge-lane.sh <base>` and paste
its output. `lane: auto` may merge on green. `lane: owner` waits for the owner's label.

## 8. Close

Update the tracker. If a worker or reviewer made a mistake you have seen before, encode it where it
will be enforced, in this order of preference: lint rule, test, a line in AGENTS.md "Traps".
