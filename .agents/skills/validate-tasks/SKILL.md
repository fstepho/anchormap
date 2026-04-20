---
name: validate-tasks
description: Run deterministic structural integrity checks on docs/tasks.md. Use before committing a change that touches docs/tasks.md, when the user asks to validate or lint the task plan, or to verify the execution-state cursor is well-formed. Safe to invoke autonomously before any commit that touches docs/tasks.md.
---

Run `sh scripts/lint-tasks.sh`. The script takes no arguments.

- Exit code `0` means `docs/tasks.md` is structurally clean.
- Non-zero exit prints one `validate: <check>: <detail>` line per issue on stderr.

Content checks enforced:
- no duplicate `### Tn.m` or `### Sn` task headings
- `docs/tasks.md` contains a `## Execution State` section
- `## Execution State` has the required labels:
  - `Current active task`
  - a `Next executable product task...` label (repo convention: `Next executable product task after blocker clearance`)
  - `Last completed task`
  - `Completed tasks recorded here`
  - `Blocked tasks`
  - `Open deviations`
- every `Tn.m` (product task, optional lowercase suffix) or `Sn` (spike) reference inside `## Execution State` points to a real task heading
- every `Open deviations` entry other than `None recorded` includes at least one task ID (`Tn.m` or `Sn`)
- every task heading matched by the script has a non-empty task block

Invocation checks (also emitted in the `validate: <check>: <detail>` format):
- `validate: invalid_invocation: ...` if any argument is passed (the script takes none)
- `validate: tasks_file_missing: <path>` if `docs/tasks.md` cannot be found

Do not modify `docs/tasks.md` to make the lint pass. Raise any failure as a classified deviation per `docs/operating-model.md` §10 and escalate to the user.

Return:
1. exit code
2. each stderr line verbatim if any
3. suggested primary classification per `docs/operating-model.md` §10 for each failure
