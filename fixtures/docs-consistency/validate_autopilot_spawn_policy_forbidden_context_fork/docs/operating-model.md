# Operating Model

Autopilot implementation or rework subagents must pass `fork_context: false`.
`fork_context: true` is forbidden because it inherits the coordinator history.
