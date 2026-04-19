Update docs/tasks.md only for the classified deviation below.

Inputs:
- current tasks.md
- deviation classification from docs/operating-model.md §10
- affected contract/design/eval sections
- affected task IDs: %%TASK_IDS%%

Live execution state from docs/tasks.md:

%%EXECUTION_STATE%%

Use this section to understand current progress, blocked work, and completed
work. The execution cursor must be updated in the same patch whenever this
deviation changes task state. Do not auto-pick the next task.

Affected task blocks from docs/tasks.md:

%%TASK_BLOCKS%%

Classify the deviation with exactly one primary classification from
docs/operating-model.md section 10:
- contract violation
- spec ambiguity
- design gap
- eval defect
- product question
- tooling problem
- out-of-scope discovery

Indicate separately whether the deviation is blocking or non-blocking relative
to Gate F (docs/operating-model.md §19.1) for each affected task.

Constraints:
- Do not modify docs/contract.md.
- Do not add product scope.
- Do not introduce new behavior without contract/eval traceability.
- Keep existing task IDs stable unless a task must be split.
- If a task is split, preserve dependency traceability.
- Spikes must remain separate from production tasks.
- If the classification is spec ambiguity, product question, or out-of-scope
  discovery, stop and do not modify the tasks beyond recording the deviation.

Return:
1. changed task IDs
2. reason for change, with the primary classification from §10
3. updated dependencies
4. updated verification references
5. remaining risks
6. Open deviations entry to append under ## Execution State, in the shape:
   - `<task_id> — <classification §10> — <blocking|non-blocking> — <short summary> — refs: <contract/design/eval/operating-model refs>`
7. Execution-state cursor updates required alongside this deviation:
   - Current active task
   - Last completed task (only if a task became done as a side effect)
   - Blocked tasks (add or clear)
   - Open deviations (append the entry from step 6)
