#compdef task-loop.sh

_task_loop() {
  local -a modes ids
  local tasks_file="${TASKS_FILE:-docs/tasks.md}"
  modes=(
    'brief:Print the task block from docs/tasks.md'
    'loop:Print the recommended local loop'
    'implement:Print a bounded implementation prompt'
    'review:Print a bounded review prompt'
    'fixture:Print a bounded fixture-failure analysis prompt'
    'update:Print a bounded tasks.md update prompt'
    'validate:Check docs/tasks.md integrity'
    'completion:Emit a shell completion script'
    'help:Print usage'
  )

  if (( CURRENT == 2 )); then
    _describe 'mode' modes
    return
  fi

  case ${words[2]} in
    brief|loop|implement|review)
      if (( CURRENT == 3 )); then
        ids=(${(f)"$(awk '/^### T[0-9]+\.[0-9]+ /{print $2}' "$tasks_file" 2>/dev/null)"})
        _describe 'task id' ids
      fi
      ;;
    fixture)
      if (( CURRENT == 4 )); then
        ids=(${(f)"$(awk '/^### T[0-9]+\.[0-9]+ /{print $2}' "$tasks_file" 2>/dev/null)"})
        _describe 'task id' ids
      fi
      ;;
    update)
      if (( CURRENT >= 3 )); then
        ids=(${(f)"$(awk '/^### T[0-9]+\.[0-9]+ /{print $2}' "$tasks_file" 2>/dev/null)"})
        _describe 'task id' ids
      fi
      ;;
    completion)
      if (( CURRENT == 3 )); then
        _values 'shell' zsh
      fi
      ;;
  esac
}

compdef _task_loop task-loop.sh
