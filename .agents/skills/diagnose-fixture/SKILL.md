---
name: diagnose-fixture
description: Classify a specific fixture failure for a specific task using the §2.3 observability surface. Use when the user reports a fixture red (e.g. "diagnose fx01_scan_min_clean for T7.2") or asks to investigate a fixture failure. Requires both a fixture ID and a task ID. Accepted task IDs - Tn.m product tasks (optionally with a lowercase suffix, e.g. T0.0a) and Sn spike tasks (e.g. S3). Do not use for implementation or review passes.
---

Analyze the fixture failure for the target task.

1. Identify the fixture ID and the task ID from the user's request. Accepted task ID forms: `Tn.m` product task (optionally with a lowercase suffix, e.g. `T0.0a`) or `Sn` spike (e.g. `S3`). If either is missing, stop and ask.
2. Read the task block under `### <TASK_ID> ` in `docs/tasks.md`.
3. Gather the minimum observability surface defined in `docs/operating-model.md` §2.3:
   - command executed
   - cwd
   - exit code
   - stdout
   - stderr
   - golden diff (if applicable)
   - filesystem mutation diff (if applicable)
   - phase timings (if available)
   - structured traces (if available)
   - fixture manifest
   - prior failure classification (if already established)

Also consult:
- `docs/contract.md`
- `docs/evals.md`

If any §2.3 signal listed above is missing or unreadable, surface that gap before attempting classification. Do not infer missing signals from context.

Classify the failure with exactly one primary classification from `docs/operating-model.md` §10:
- contract violation
- spec ambiguity
- design gap
- eval defect
- product question
- tooling problem
- out-of-scope discovery

Optional secondary tags may be added for routing only, for example:
- implementation-bug
- fixture-golden
- mutation-policy
- test-harness
- environment
- read-path
- render-path

Return:
1. classification
2. evidence (cite the specific §2.3 signals used)
3. smallest corrective action
4. files likely affected
5. whether `docs/tasks.md` needs an update
6. any §2.3 signal that was missing and should be added to the harness
