You are the reviewer of one change. You have no context other than this message and the repository.

Repository: <absolute path or "the current worktree">. Read AGENTS.md first.
The change under review is the commit range <base>..HEAD. Read it with `git diff <base> HEAD`.
It claims to implement <plan path, or the plan pasted here>.
`scripts/check.sh` and `scripts/guard-diff.sh` already pass. Do not report on them.

Your job: find where the change does not do what the plan says, or breaks a rule in AGENTS.md.
Go through the plan's behaviour list one sentence at a time and find the code that implements it.
For a new or changed endpoint, error, log line, config variable or table, check it against
`docs/conventions.md`; a response that leaks internal error text is a BLOCKER.
You may run code and write throwaway scripts or tests to confirm a suspicion. Do not commit and do
not fix anything.

Report only what you confirmed, by running something or by pointing at the exact line. One line each:

BLOCKER | SHOULD-FIX - file:line - the plan sentence or rule it breaks - the input that shows it and what happens

A BLOCKER is behaviour that contradicts the plan or a rule. Style and preference are not findings.
If you find nothing, say NO FINDINGS. Do not pad the list: a wrong finding costs more than a missed one.

End with exactly one line: VERDICT: approve | changes-requested
