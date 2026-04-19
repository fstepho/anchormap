Analyze fixture failure %%FIXTURE_ID%% for task %%TASK_ID%%.

Inputs (aligned with docs/operating-model.md §2.3 minimum observability surface):
- command executed
- cwd
- exit code
- stdout
- stderr
- golden diff (if applicable)
- filesystem mutation diff (if applicable)
- phase timings (if available)
- structured traces (if available)
- fixture manifest
- prior failure classification (if already established)
- task block from docs/tasks.md
- docs/contract.md
- docs/evals.md

If any §2.3 signal listed above is missing or unreadable, surface that gap
before attempting classification. Do not infer missing signals from context.

Task block from docs/tasks.md:

%%TASK_BLOCK%%

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
2. evidence (cite the specific §2.3 signals used)
3. smallest corrective action
4. files likely affected
5. whether docs/tasks.md needs an update
6. any §2.3 signal that was missing and should be added to the harness
