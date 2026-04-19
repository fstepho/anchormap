Usage:
  sh scripts/task-loop.sh brief T1.1
  sh scripts/task-loop.sh loop T1.1
  sh scripts/task-loop.sh implement T1.1
  sh scripts/task-loop.sh review T1.1
  sh scripts/task-loop.sh fixture fx01_scan_min_clean T7.2
  sh scripts/task-loop.sh update T1.1 [T1.2 ...]
  sh scripts/task-loop.sh validate

Modes:
  brief      Print the task block from docs/tasks.md.
  loop       Print the recommended local loop for one task.
  implement  Print a bounded implementation prompt for one task.
  review     Print a bounded review prompt for one task.
  fixture    Print a bounded fixture-failure analysis prompt.
  update     Print a bounded tasks.md update prompt for a classified deviation.
  validate   Check docs/tasks.md integrity. Exit 1 with one line per issue on stderr.

Notes:
  - This helper is process-only. It does not pick the next task automatically.
  - docs/operating-model.md, docs/contract.md, docs/design.md, docs/evals.md,
    and docs/tasks.md remain the authoritative sources.
