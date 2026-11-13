You are the developer on one task. You have no context other than this message and the repository.

Repository: <absolute path or "the current worktree">. Work only inside it.
Read AGENTS.md first. Its rules apply to you.

Task: port <old path> to <new language>, in <new path>.

The old code is the specification. For every input, the new result must equal the old result.
<case file> holds examples. It is not the full set: the port will be checked against cases you have
not seen. Ask the old implementation about any case you invent with `<oracle command>`, and do so
for anything involving rounding, number size, negative values, empty input, text length and order.

Keep the structure and the names close to the old code. Do not redesign and do not fix what looks
like a bug: port it and report it.

Scope: <new path>, new test files under <tests path>, and <extra case file>. Change nothing else.

Done means all of these:
- `scripts/check.sh` passes, and you ran it yourself after your last edit.
- The work is committed on the current branch and `git status` is clean.

Do not ask questions; nobody will answer. If something blocks you, stop and say so in the handoff.

End with a handoff as your final message, in exactly this shape:

STATUS: done | partial | blocked
CHECK: <the exact command you ran> -> pass | fail | not verified, with the test counts you saw
COMMITS: <short hashes>
FILES: <paths you changed>
DEVIATIONS: <where the new behaviour knowingly differs from the old, or "none">
NOT VERIFIED: <anything you did not run or could not confirm, or "none">
NOTES FOR REVIEWER: <old behaviour that looks like a bug, language differences you handled, risks, or "none">
