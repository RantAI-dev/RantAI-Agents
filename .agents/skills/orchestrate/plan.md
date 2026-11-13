# Plan: <feature> (<tracker id>)

Base: `<branch>` at `<commit>`. Written by <lead model>, <date>.

## Goal

<Two sentences. What a user or caller can do afterwards that they cannot do now.>

## Decisions already made

<Each one stated as decided, with the reason in a clause. The worker does not reopen these.>

- New code lives in `<path>`. Its public surface is `<signature>`.
- <...>

## Behaviour

<Numbered. One sentence each. Each one checkable by a test. Give the exact error shape, the order of
checks, the boundary value and which side of it is included. Add an example value wherever a number
is formatted, rounded or compared.>

1. <...>

## Acceptance

- Acceptance tests already committed: `<paths>`. They fail at base and must pass unchanged.
- `scripts/check.sh` passes.

## Slices

<Only when more than one worker. One row per slice; no file appears in two rows.>

| Slice | Scope (path regex) | Depends on |
|---|---|---|

## Out of scope

<What a reasonable worker might add and must not.>
