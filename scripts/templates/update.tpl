Update tasks.md only for the classified deviation below.

Inputs:
- current tasks.md
- deviation classification from operating-model.md
- affected contract/design/eval sections
- affected task IDs: %%TASK_IDS%%

Affected task blocks from docs/tasks.md:

%%TASK_BLOCKS%%

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
