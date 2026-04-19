#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
TASKS_FILE="${TASKS_FILE:-$ROOT_DIR/docs/tasks.md}"

die() {
  printf '%s\n' "$*" >&2
  exit 1
}

require_tasks_file() {
  [ -f "$TASKS_FILE" ] || die "validate: tasks_file_missing: $TASKS_FILE"
}

extract_task_block() {
  task_id="$1"

  awk -v id="$task_id" '
    $0 ~ "^### " id " " {
      found = 1
      start = NR
      next
    }
    found && NR > start && ($0 ~ "^### " || $0 ~ "^## ") {
      exit
    }
    found && $0 !~ /^[[:space:]]*$/ {
      print
    }
  ' "$TASKS_FILE"
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
    /^### (T[0-9]+\.[0-9]+[a-z]*|S[0-9]+) / {
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
        if (index($0, "- " label) == 1) seen[label] = 1
      }
      rest = $0
      while (match(rest, /T[0-9]+\.[0-9]+[a-z]*|S[0-9]+/)) {
        id = substr(rest, RSTART, RLENGTH)
        if (!(id in refs)) {
          refs[id] = 1
          refs_label[id] = current_label
        }
        rest = substr(rest, RSTART + RLENGTH)
      }
      if (current_label == "Open deviations" && match($0, /^  - /)) {
        open_dev_count++
        open_dev_lines[open_dev_count] = $0
        open_dev_nrs[open_dev_count] = NR
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
        for (i = 1; i <= open_dev_count; i++) {
          line = open_dev_lines[i]
          if (index(line, "None recorded") > 0) continue
          if (!match(line, /T[0-9]+\.[0-9]+[a-z]*|S[0-9]+/)) {
            printf("validate: open_deviation_entry_missing_task_ref: line %d\n", open_dev_nrs[i]) > "/dev/stderr"
            err = 1
          }
        }
      }
      exit err
    }
  ' "$TASKS_FILE" || structural_err=$?
  : "${structural_err:=0}"

  block_err=0
  for id in $(awk '/^### (T[0-9]+\.[0-9]+[a-z]*|S[0-9]+) /{print $2}' "$TASKS_FILE"); do
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
  if [ $# -gt 0 ]; then
    die "validate: invalid_invocation: lint-tasks.sh takes no arguments"
  fi
  require_tasks_file
  validate_tasks_file
}

main "$@"
