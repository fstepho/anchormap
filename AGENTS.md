# Agent Instructions

This repo is document-driven. The working mode is `contract-first`,
`eval-driven`, `scope-closed`.

## Role Of This File

`AGENTS.md` is an entry map, not the process authority.

If this file conflicts with any durable file under `docs/`, or with accepted
ADRs under `docs/adr/`, those durable docs win.

Keep durable process rules in `docs/` and durable technical decisions in
`docs/adr/`. Keep `AGENTS.md` limited to intake, reading entrypoints, authority
pointers, and hard-stop reminders.

## Work Intake

Start every request by deciding whether it is:

- a product task from `docs/tasks.md`;
- process-doc or ADR maintenance;
- review, fixture diagnosis, or task-plan maintenance.

For product implementation, identify the explicit target task before coding.
For process-doc maintenance, classify the reason first, bound the files being
changed, and do not touch runtime behavior.

Use `docs/agent-loop.md` for the repo-local execution loop.

If the user explicitly requests autopilot or automatic task chaining, use the
autopilot loop defined by `docs/operating-model.md` and `docs/agent-loop.md`.
Autopilot remains one active task at a time and must stop on the documented
hard stops. Effective autopilot requires a Codex session started with
`codex -p autopilot -c mcp_servers.context7.enabled=false` or equivalent
Auto-review permissions so recurring `codex review`, `git add`, and
`git commit` approvals are not human gates.
Autopilot task implementation must run in fresh task-scoped Codex sessions so
the coordinator does not accumulate implementation context across tasks.
Reasoning-effort selection for autopilot implementation, rework, review, and
approval sessions is defined in `docs/operating-model.md` and operationalized
in `docs/agent-loop.md`.

## Reading Paths

Use the standard path for ordinary bounded implementation work:

1. `docs/operating-model.md`
2. `docs/tasks.md`, including `## Execution State` and the target task block
3. the referenced sections of `docs/contract.md`
4. the referenced sections of `docs/design.md`
5. the referenced fixtures, eval families, or gates in `docs/evals.md`

Do not start coding until the target task, relevant contract/design references,
and relevant eval references are identified. If the task block does not provide
enough traceability, classify the gap before patching.

Use the critical path before changing parser, renderer, CLI boundary,
filesystem mutation, packaging, test-harness behavior, repo-local
review/orchestration mechanics, `docs/contract.md`, or `docs/evals.md`: follow
the critical-mode authority coverage rule in `docs/agent-loop.md`, including
the relevant `docs/contract.md`, `docs/design.md`, `docs/evals.md`, and
accepted ADRs.

If a scope question remains open after the required reading, consult
`docs/brief.md` only to arbitrate product scope.

## Authority Map

- `docs/contract.md`: observable runtime behavior.
- `docs/evals.md`: verification gates, fixtures, and goldens.
- `docs/design.md`: compatible implementation design.
- `docs/tasks.md`: one-task execution plan and live execution cursor.
- `docs/operating-model.md`: production method, change policy, deviation
  taxonomy, review protocol, and done definitions.
- `docs/brief.md`: product scope arbitration only when needed.
- `docs/adr/`: binding accepted technical decisions.
- `docs/agent-loop.md`: local execution helper.
- `docs/code-review.md`: durable fresh-review guidance.
- `.agents/skills/*/SKILL.md`: repo-local skill instructions.

## Safety Checklist

Before patching:

- Identify the target task from `docs/tasks.md`, or the bounded
  process-maintenance surface.
- Identify the binding contract/design/eval references, or the binding
  operating-model/ADR references for process work.
- State the smallest relevant checks.
- Stop if the request spans multiple product tasks, lacks traceability, or
  requires guessing expected behavior.

Never:

- Modify `docs/contract.md` without explicit instruction.
- Expand product scope, weaken `docs/evals.md`, or introduce observable behavior
  without traceability to `docs/contract.md` and `docs/evals.md`.
- Introduce a core dependency or structural strategy that contradicts an
  accepted ADR.
- Replace a parser, renderer, CLI, packaging, filesystem-mutation, or
  fixture-harness strategy without creating or updating the corresponding ADR
  when the change supersedes an accepted decision.
- Use cache, network, Git, clock, or environment as a product source of truth.
- Substitute a repo-local review skill, wrapper-parsed transcript, same-session
  self-review, or second reviewer engine for fresh Codex review.
- Auto-pick a different task or auto-commit unless the user explicitly asks,
  including by requesting autopilot.

During and before handoff:

- Classify deviations with `docs/operating-model.md` before changing more code.
- Run the smallest relevant check early.
- Stop on the first blocking failure and classify it before broadening the
  patch.
- Run the repo-local checks applicable to the touched files before handoff.

## Review

Review workflow is defined by `docs/operating-model.md`, `docs/agent-loop.md`,
and `docs/code-review.md`.

Under the repo-local workflow, Codex review capabilities are the only
authorized bug-finding review engine. Do not substitute a repo-local review
skill, a wrapper-parsed transcript, a same-session self-review, or a second
reviewer engine.

Fresh review must cover exactly one task-scoped cumulative diff, or one bounded
process-maintenance diff that does not change runtime behavior.

After review findings are available, emit the `review decision` before any code
change. Its home and routing rules are defined by `docs/operating-model.md` and
`docs/agent-loop.md`; `docs/tasks.md` records only resulting task-state or
deviation changes when the loop requires them.

## Checks And Done

Before any patch, state the target task or bounded process-maintenance surface,
the binding references, and the smallest relevant checks.

Run the smallest relevant check early. Before handoff, run the repo-local
checks applicable to the touched files.

Task-level done is defined only by `docs/operating-model.md` §19.1.
