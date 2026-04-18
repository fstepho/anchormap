#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
TASKS_FILE="$ROOT_DIR/docs/tasks.md"

die() {
  printf '%s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  sh scripts/task-loop.sh brief T1.1
  sh scripts/task-loop.sh loop T1.1
  sh scripts/task-loop.sh implement T1.1
  sh scripts/task-loop.sh review T1.1
  sh scripts/task-loop.sh fixture fx01_scan_min_clean T7.2
  sh scripts/task-loop.sh update T1.1 [T1.2 ...]

Modes:
  brief      Print the task block from docs/tasks.md.
  loop       Print the recommended local loop for one task.
  implement  Print a bounded implementation prompt for one task.
  review     Print a bounded review prompt for one task.
  fixture    Print a bounded fixture-failure analysis prompt.
  update     Print a bounded tasks.md update prompt for a classified deviation.

Notes:
  - This helper is process-only. It does not pick the next task automatically.
  - docs/operating-model.md, docs/contract.md, docs/design.md, docs/evals.md,
    and docs/tasks.md remain the authoritative sources.
EOF
}

require_tasks_file() {
  [ -f "$TASKS_FILE" ] || die "Missing $TASKS_FILE"
}

extract_task_block() {
  task_id="$1"

  awk -v id="$task_id" '
    $0 ~ "^### " id " " {
      found = 1
      start = NR
    }
    found && NR > start && ($0 ~ "^### " || $0 ~ "^## ") {
      exit
    }
    found {
      print
    }
  ' "$TASKS_FILE"
}

require_task() {
  task_id="$1"
  task_block=$(extract_task_block "$task_id")
  [ -n "$task_block" ] || die "Task not found in docs/tasks.md: $task_id"
  printf '%s\n' "$task_block"
}

extract_execution_state() {
  awk '
    $0 == "## Execution State" {
      found = 1
      start = NR
    }
    found && NR > start && $0 ~ "^## " {
      exit
    }
    found {
      print
    }
  ' "$TASKS_FILE"
}

read_execution_state() {
  execution_state=$(extract_execution_state)
  if [ -n "$execution_state" ]; then
    printf '%s\n' "$execution_state"
  else
    printf '%s\n' "## Execution State" "" "- No live execution state recorded in docs/tasks.md."
  fi
}

print_loop() {
  task_id="$1"
  task_block="$2"

  cat <<EOF
Recommended loop for $task_id

1. Read, in order:
   - docs/operating-model.md
   - docs/contract.md
   - docs/design.md
   - docs/evals.md
   - docs/tasks.md
2. State the target task, the relevant contract refs, the relevant design refs,
   the relevant eval refs, and the smallest checks that should fail or pass.
3. Use the implementation prompt with:
   sh scripts/task-loop.sh implement $task_id
4. Run the smallest relevant check early. Stop on the first blocking failure.
5. If blocked, classify the deviation before changing more code:
   - contract violation
   - spec ambiguity
   - design gap
   - eval defect
   - product question
   - tooling problem
   - out-of-scope discovery
6. Use the review prompt with:
   sh scripts/task-loop.sh review $task_id
7. Keep the task in exactly one explicit state:
   - implementing
   - needs_review
   - needs_rework
   - blocked
   - done
8. If review returns needs_rework and the findings are bounded and in-scope, the
   orchestrator should do one follow-up implementation pass immediately without
   waiting for user input, then run a second review. Stop instead for:
   - spec ambiguity
   - product question
   - out-of-scope discovery
   - any change that would require docs/contract.md
   - any broader design or task-plan rewrite
   - a repeated review -> rework loop of the same class twice
9. Do not mark the task done after implementation alone.
10. Commit only if the task satisfies Gate F / task-level done:
   - target objective is complete
   - referenced tests and fixtures pass
   - stdout/stderr/exit code/mutation policy is preserved where applicable
   - no out-of-scope behavior changed
   - no eval was weakened
   - any remaining review findings are explicitly non-blocking
11. After the final review decision, sync docs/tasks.md ## Execution State
    before commit or handoff:
    - update Current active task
    - update Last completed task when the task is done
    - append to Completed tasks recorded here when the task is done
    - update or clear Blocked tasks as required
    - update Open deviations when applicable
12. Do not auto-pick the next task while updating the execution cursor.

Task block from docs/tasks.md:

$task_block
EOF
}

print_implement_prompt() {
  task_id="$1"
  task_block="$2"
  execution_state="$3"

  cat <<EOF
You are the orchestrator for task $task_id.

Required reading order:
1. docs/operating-model.md
2. docs/contract.md
3. docs/design.md
4. docs/evals.md
5. docs/tasks.md

Live execution state from docs/tasks.md:

$execution_state

Use this section to understand current progress, blocked work, and completed
work. The explicit target task in this prompt remains authoritative; do not
switch tasks based on the execution state alone.

Before coding:
- identify the target task in docs/tasks.md
- identify the relevant contract sections
- identify the relevant design sections
- identify the relevant fixtures, eval families, or gates
- state the smallest checks that should fail or pass
- if this is a process-doc or ADR task and the task block does not name
  contract/design/eval refs, identify the relevant operating-model and ADR refs
  instead, classify the change as process maintenance, and bound the files being
  changed before editing

Execution model:
- keep docs/tasks.md and the normative docs as the only source of truth
- do not create a parallel planning system
- implementation is local in the main agent by default
- delegate implementation only if this task is large or risky enough that a
  bounded subagent materially improves the result
- if you delegate implementation, spawn at most one implementation subagent
- a delegated implementation subagent should keep the same execution settings as
  the parent agent, including sandbox and approval mode
- a delegated implementation subagent should work only on task $task_id
- if an implementation subagent is still alive, do not edit files in parallel
  in the main agent
- if an implementation subagent times out, either wait again or close it before
  making local edits
- do not spawn a reviewer yet
- do not commit from any implementation pass
- if a delegated implementation subagent hits a blocking issue, have it return a
  single classified deviation before more edits are attempted
- set the task state to exactly one of:
  - implementing
  - needs_review
  - needs_rework
  - blocked
  - done
- after an implementation pass, the only valid next states are:
  - needs_review
  - blocked
- if the implementation pass ends in blocked, update docs/tasks.md
  ## Execution State in the same patch to record the blocker or deviation
- do not mark the task done from this prompt

Constraints:
- Do not modify docs/contract.md.
- Do not modify product scope.
- Do not implement adjacent tasks.
- Do not add behavior not required by the task.
- Keep the patch minimal.
- Add or update only tests/fixtures required by this task.
- Preserve stdout/stderr/exit code discipline.
- Preserve mutation policy.
- Preserve the documentary hierarchy:
  - contract.md for observable behavior
  - evals.md for verification gates and fixtures
  - brief.md for scope
  - design.md for compatible implementation
  - operating-model.md for production method
- If a deviation is found, classify it before changing code, fixtures, or docs.

If you delegate implementation, the implementation subagent contract is:
- implement task $task_id only
- keep the patch minimal
- add or update only tests/fixtures required by this task
- run the smallest relevant check early
- stop on the first blocking failure
- return control to the orchestrator with:
  1. files changed
  2. behavior implemented
  3. tests/fixtures run
  4. risks
  5. any spec ambiguity encountered
  6. classification of any deviation using the taxonomy from
     docs/operating-model.md

Task block from docs/tasks.md:

$task_block

Orchestrator return:
1. files changed
2. relevant contract/design/eval refs identified before implementation, or the
   relevant operating-model/ADR refs for a process-doc task
3. smallest checks selected
4. implementation result
5. current task state: needs_review or blocked
EOF
}

print_review_prompt() {
  task_id="$1"
  task_block="$2"
  execution_state="$3"

  cat <<EOF
You are the orchestrator for review of task $task_id.

Review the full cumulative diff for task $task_id only against:
- docs/contract.md
- docs/design.md
- docs/evals.md
- docs/operating-model.md
- task $task_id from docs/tasks.md

Live execution state from docs/tasks.md:

$execution_state

Use this section to understand current progress, blocked work, and completed
work. The explicit target task in this prompt remains authoritative; do not
switch tasks based on the execution state alone.

Execution model:
- spawn exactly one newly created fresh-context review subagent for this review
  pass
- each review pass must use a new reviewer
- do not reuse a reviewer from an earlier review pass after follow-up edits
- each review pass must inspect the full cumulative task diff from the start of
  task $task_id, not only the latest follow-up delta
- the review subagent should review only and must not edit files
- do not ask the review subagent to propose new product features
- the orchestrator decides whether follow-up edits are needed
- do not commit until the review findings are addressed and Gate F is satisfied
- if review requires follow-up edits, set the task state to needs_rework
- if review returns bounded in-scope findings, the orchestrator should apply one
  follow-up implementation pass immediately without waiting for user input
- after any follow-up implementation pass, spawn a new fresh-context reviewer
  for a second review before marking the task done
- on a second or later review pass, pay extra attention to files changed since
  the previous review, but still review the full cumulative task diff
- "ready for re-review" is not done
- severity alone does not decide done
- if only low-severity findings remain, mark the task done only if they are
  explicitly non-blocking and Gate F is satisfied; otherwise keep the task in
  needs_rework or blocked
- stop instead of auto-correcting when review finds:
  - spec ambiguity
  - product question
  - out-of-scope discovery
  - any change that would require docs/contract.md
  - any broader design or task-plan rewrite
  - a repeated review -> rework loop of the same class twice
- the only valid final states from this prompt are:
  - done
  - needs_rework
  - blocked
- after deciding the final state, update docs/tasks.md ## Execution State in
  the same patch before commit or handoff:
  - for done: clear or replace Current active task, set Last completed task,
    append to Completed tasks recorded here, and clear blockers that depended
    on the task
  - for needs_rework: keep or restore the task as active and record any
    explicit deviation in Open deviations when applicable
  - for blocked: record the blocker in Blocked tasks and do not mark the task
    as completed
- do not auto-pick the next task while updating the execution cursor

Task block from docs/tasks.md:

$task_block

Classify each finding with exactly one primary classification from
docs/operating-model.md section 10:
- contract violation
- spec ambiguity
- design gap
- eval defect
- product question
- tooling problem
- out-of-scope discovery

Optional secondary tags may be added for routing only, for example:
- eval-gap
- design-divergence
- task-scope-creep
- mutation-policy
- fixture-golden
- non-blocking-risk

Do not suggest new product features.
Do not rewrite the architecture unless the diff violates the contract or task scope.
Do not request broad refactors unless the current diff prevents the referenced
task from satisfying its contract/eval obligations.

Review subagent questions:
- which task is targeted?
- which contract sections are impacted?
- which fixtures should pass?
- did the diff change behavior outside the task?
- did the diff change output, exit codes, or mutation policy?
- did the diff weaken an eval?
- are failures and edge cases covered?
- are known limits documented?
- which findings are blocking vs explicitly non-blocking relative to Gate F?
- if this is a process-doc or ADR task, which operating-model/ADR refs govern
  the diff and are the changed files still properly bounded?

Orchestrator return:
1. review findings ordered by severity
2. any required follow-up edits
3. any findings explicitly accepted as non-blocking
4. execution-state update required in docs/tasks.md
5. current task state: done, needs_rework, or blocked
EOF
}

print_fixture_prompt() {
  fixture_id="$1"
  task_id="$2"
  task_block="$3"

  cat <<EOF
Analyze fixture failure $fixture_id for task $task_id.

Inputs:
- failing output
- expected golden
- stderr
- exit code
- task block from docs/tasks.md
- docs/contract.md
- docs/evals.md

Task block from docs/tasks.md:

$task_block

Classify the failure with exactly one primary classification from
docs/operating-model.md section 10:
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
2. evidence
3. smallest corrective action
4. files likely affected
5. whether docs/tasks.md needs an update
EOF
}

print_update_prompt() {
  task_ids="$1"
  task_blocks="$2"

  cat <<EOF
Update tasks.md only for the classified deviation below.

Inputs:
- current tasks.md
- deviation classification from operating-model.md
- affected contract/design/eval sections
- affected task IDs: $task_ids

Affected task blocks from docs/tasks.md:

$task_blocks

Constraints:
- Do not modify docs/contract.md.
- Do not add product scope.
- Do not introduce new behavior without contract/eval traceability.
- Keep existing task IDs stable unless a task must be split.
- If a task is split, preserve dependency traceability.
- Spikes must remain separate from production tasks.

Return:
1. changed task IDs
2. reason for change
3. updated dependencies
4. updated verification references
5. remaining risks
EOF
}

main() {
  require_tasks_file

  mode="${1:-}"
  case "$mode" in
    ""|-h|--help|help)
      usage
      exit 0
      ;;
    brief|loop|implement|review)
      [ "${2:-}" ] || die "Missing task id for mode: $mode"
      task_id="$2"
      task_block=$(require_task "$task_id")
      case "$mode" in
        brief)
          printf '%s\n' "$task_block"
          ;;
        loop)
          print_loop "$task_id" "$task_block"
          ;;
        implement)
          execution_state=$(read_execution_state)
          print_implement_prompt "$task_id" "$task_block" "$execution_state"
          ;;
        review)
          execution_state=$(read_execution_state)
          print_review_prompt "$task_id" "$task_block" "$execution_state"
          ;;
      esac
      ;;
    fixture)
      [ "${2:-}" ] || die "Missing fixture id for mode: fixture"
      [ "${3:-}" ] || die "Missing task id for mode: fixture"
      fixture_id="$2"
      task_id="$3"
      task_block=$(require_task "$task_id")
      print_fixture_prompt "$fixture_id" "$task_id" "$task_block"
      ;;
    update)
      [ "${2:-}" ] || die "Missing affected task id for mode: update"
      shift
      task_ids="$*"
      task_blocks=
      for task_id in "$@"; do
        task_block=$(require_task "$task_id")
        if [ -n "$task_blocks" ]; then
          task_blocks="${task_blocks}

$task_block"
        else
          task_blocks="$task_block"
        fi
      done
      print_update_prompt "$task_ids" "$task_blocks"
      ;;
    *)
      die "Unknown mode: $mode"
      ;;
  esac
}

main "$@"
