---
name: sweep
description: Run the regular clean-up that keeps a codebase healthy when nobody reads it day to day - pay down one ratchet metric, remove dead code, fix stale docs, and open one small pull request. Use on a schedule (weekly) or when asked to tidy, garden or pay down debt.
---

# Sweep

When people stop reading code, nobody notices it rotting. This is the scheduled job that notices.
It is a worker's job, not the lead's. One sweep is one small pull request in the auto lane.

1. Run `scripts/check.sh`, `scripts/audit.sh` and `scripts/ratchet.sh`. Pick **one** thing:
   - if the gate printed `check: SLOW`, that comes first: find the slowest step and shorten it
     (a cache, a smaller crate or package), without removing or skipping any test;
   - the ratchet metric that is cheapest to lower, in one directory;
   - one oversized file from `scripts/file-size.sh --list`: move one cohesive part into its own
     module, with no change in behaviour;
   - dead code the dead-code tool reports (check `.agents/protected-paths` and public exports
     first: unused inside the repository is not unused);
   - a document under `docs/` that contradicts the code. Fix the document, or delete it.
2. Change only that. No behaviour change: tests are not edited, and `scripts/check.sh` passes
   before and after.
3. Run `scripts/merge-lane.sh <base>`. If it says `owner`, the sweep was too ambitious: make it
   smaller.
4. Open the pull request from the template. Under "Intent" write which count went from what to what.
5. If the same mistake shows up in several places, do not fix them all. Report it, so that it
   becomes a lint rule.

Stop and report instead of changing anything when the audit shows a skipped test, a secret, or a
protected file that changed without the owner's label.
