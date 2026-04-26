---
name: diagnose-fixture
description: Classify one fixture failure for one explicit task using the §2.3 observability surface. Requires both a fixture ID and a task ID. Do not use for implementation or review passes.
---

Analyze the fixture failure for the target task.

## Intake

1. Identify the fixture ID and task ID. Accepted task forms are `Tn.m`,
   optional lowercase suffix, and `Sn`. If either is missing, stop and ask.
2. Read `docs/operating-model.md` §2.3 and §10.
3. Read `docs/tasks.md` and locate the target task block.
4. Read the contract, design, eval, and accepted ADR sections needed to
   interpret the fixture oracle and changed surface.
5. Read `AGENTS.md` as an entry map only. Normative docs win on conflict.
6. Consult `docs/brief.md` only to arbitrate an open scope question.

## Required Evidence

Gather the minimum §2.3 observability surface:

- command, cwd, exit code, stdout, stderr;
- golden diff and filesystem mutation diff, when applicable;
- phase timings and structured traces, when available;
- fixture manifest;
- prior failure classification, if already established.

If a required signal is missing or unreadable, surface that gap before
classifying. Do not infer missing signals from context.

## Classification

Classify with exactly one primary label from `docs/operating-model.md` §10.
Optional secondary tags may help routing, but never replace the primary label.

## Return

1. classification
2. evidence, citing the specific §2.3 signals used
3. smallest corrective action
4. files likely affected
5. whether `docs/tasks.md` needs an update
6. any missing §2.3 signal that should be added to the harness
