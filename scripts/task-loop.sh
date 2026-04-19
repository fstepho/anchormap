#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
TASKS_FILE="${TASKS_FILE:-$ROOT_DIR/docs/tasks.md}"
TEMPLATES_DIR="$SCRIPT_DIR/templates"

die() {
  printf '%s\n' "$*" >&2
  exit 1
}

render_template() {
  tpl="$TEMPLATES_DIR/$1.tpl"
  [ -f "$tpl" ] || die "Missing template: $tpl"
  shift
  for kv in "$@"; do
    export "$kv"
  done
  awk '
    BEGIN {
      tokens["TASK_ID"] = 1
      tokens["TASK_IDS"] = 1
      tokens["FIXTURE_ID"] = 1
      tokens["TASK_BLOCK"] = 1
      tokens["TASK_BLOCKS"] = 1
      tokens["EXECUTION_STATE"] = 1
    }
    {
      line = $0
      for (name in tokens) {
        tok = "%%" name "%%"
        val = ENVIRON[name]
        while ((p = index(line, tok)) > 0)
          line = substr(line, 1, p - 1) val substr(line, p + length(tok))
      }
      print line
    }
  ' "$tpl"
}

usage() {
  cat "$TEMPLATES_DIR/usage.tpl"
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
  render_template loop \
    "TASK_ID=$task_id" \
    "TASK_BLOCK=$task_block"
}

print_implement_prompt() {
  task_id="$1"
  task_block="$2"
  execution_state="$3"
  render_template implement \
    "TASK_ID=$task_id" \
    "TASK_BLOCK=$task_block" \
    "EXECUTION_STATE=$execution_state"
}

print_review_prompt() {
  task_id="$1"
  task_block="$2"
  execution_state="$3"
  render_template review \
    "TASK_ID=$task_id" \
    "TASK_BLOCK=$task_block" \
    "EXECUTION_STATE=$execution_state"
}

print_fixture_prompt() {
  fixture_id="$1"
  task_id="$2"
  task_block="$3"
  render_template fixture \
    "FIXTURE_ID=$fixture_id" \
    "TASK_ID=$task_id" \
    "TASK_BLOCK=$task_block"
}

print_update_prompt() {
  task_ids="$1"
  task_blocks="$2"
  render_template update \
    "TASK_IDS=$task_ids" \
    "TASK_BLOCKS=$task_blocks"
}

validate_tasks_file() {
  awk '
    BEGIN {
      required["Current active task:"] = 1
      required["Next executable product task"] = 1
      required["Last completed task:"] = 1
      required["Completed tasks recorded here:"] = 1
      required["Blocked tasks:"] = 1
      required["Open deviations:"] = 1
    }
    /^### T[0-9]+\.[0-9]+ / {
      heading_count[$2]++
    }
    $0 == "## Execution State" {
      in_es = 1
      es_seen_section = 1
      next
    }
    in_es && /^## / {
      in_es = 0
    }
    in_es {
      if (match($0, /^- [^:]+:/)) {
        current_label = substr($0, 3, RLENGTH - 3)
      }
      for (label in required) {
        if (index($0, label) > 0) seen[label] = 1
      }
      rest = $0
      while (match(rest, /T[0-9]+\.[0-9]+/)) {
        id = substr(rest, RSTART, RLENGTH)
        if (!(id in refs)) {
          refs[id] = 1
          refs_label[id] = current_label
        }
        rest = substr(rest, RSTART + RLENGTH)
      }
    }
    END {
      err = 0
      for (id in heading_count) {
        if (heading_count[id] > 1) {
          printf("validate: heading_duplicate: %s\n", id) > "/dev/stderr"
          err = 1
        }
      }
      if (!es_seen_section) {
        print "validate: execution_state_missing:" > "/dev/stderr"
        err = 1
      } else {
        for (label in required) {
          if (!seen[label]) {
            printf("validate: execution_state_field_missing: %s\n", label) > "/dev/stderr"
            err = 1
          }
        }
        for (id in refs) {
          if (!(id in heading_count)) {
            label = refs_label[id]
            if (label == "") {
              printf("validate: execution_state_dangling_ref: %s\n", id) > "/dev/stderr"
            } else {
              printf("validate: execution_state_dangling_ref: %s referenced in \"%s\"\n", id, label) > "/dev/stderr"
            }
            err = 1
          }
        }
      }
      exit err
    }
  ' "$TASKS_FILE" || structural_err=$?
  : "${structural_err:=0}"

  block_err=0
  for id in $(awk '/^### T[0-9]+\.[0-9]+ /{print $2}' "$TASKS_FILE"); do
    block=$(extract_task_block "$id")
    if [ -z "$block" ]; then
      printf 'validate: task_block_empty: %s\n' "$id" >&2
      block_err=1
    fi
  done

  if [ "$structural_err" -ne 0 ] || [ "$block_err" -ne 0 ]; then
    return 1
  fi
  return 0
}

main() {
  require_tasks_file

  mode="${1:-}"
  case "$mode" in
    ""|-h|--help|help)
      usage
      exit 0
      ;;
    validate)
      validate_tasks_file
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
