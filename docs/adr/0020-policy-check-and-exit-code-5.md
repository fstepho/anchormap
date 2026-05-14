# ADR-0020: Policy check and exit code 5

Status: Accepted
Date: 2026-05-14
Owner: AnchorMap maintainers

## Context

`scan --json` reports findings while returning exit code `0` for a successful
analysis. CI needs a separate command that turns a valid scan result into a
policy decision without treating business findings as CLI errors.

Relevant constraints:

- Policy failures must be distinct from technical failures.
- `check --json` policy failures must still emit a valid JSON result.
- Technical failures must not emit fake machine results.
- Policy input is explicit, read-only, and never written by AnchorMap.

## Decision

We will add `anchormap check` with a closed policy schema and a dedicated exit
code:

- `0`: policy pass.
- `5`: policy fail after a valid scan and valid policy.
- `1`, `2`, `3`, `4`: existing technical failure classes.

When `--json` is present and the policy fails, `stdout` contains a valid
`PolicyResult` JSON artifact and the process exits `5`. When a technical error
occurs, `stdout` is empty and no `PolicyResult` is emitted.

A policy failure is not an `AppError`. It is a successful policy evaluation
whose decision is `fail` and whose process exit code is `5`.

In live mode, CLI arguments and the explicit policy file are validated before
the repository scan pipeline runs. Invalid policy input exits `4` and emits no
`PolicyResult`.

## Alternatives considered

### Option A - Reuse exit code 3 for policy failure

Pros:

- Avoids adding a code.

Cons:

- Conflates repository-analysis failure with a successful analysis that did not
  satisfy policy.

### Option B - Let `scan --json` fail on findings

Pros:

- Simpler CI integration.

Cons:

- Breaks the existing distinction between analysis results and CLI failures.

### Option C - Add dedicated policy result and code 5

Pros:

- Preserves existing scan semantics and creates a clear CI gate.

Cons:

- Requires code-priority and fixture updates.

## Consequences

Positive:

- CI can fail on explicit local policy without weakening `scan`.
- Machine consumers can parse policy-fail results reliably.

Negative:

- The command boundary must handle a successful domain result with a non-zero
  exit code.

Risks:

- Implementations can accidentally suppress JSON on policy fail or emit JSON on
  technical fail; fixtures must cover both.

## Contract impact

Yes. `docs/contract.md` must define `check`, `PolicyResult`, exit code `5`,
and stdout/stderr discipline.

## Eval impact

Yes. B-check and B-cli fixtures must cover policy pass, policy fail, JSON
policy fail, technical errors, and code priority.

## Design impact

`docs/design.md` must add a policy domain module and command-boundary handling
for code `5`.

## Rollback / supersession

Exit code `5` can only be removed by a future contract-breaking ADR and major
schema/CLI change.

## Links

- `docs/contract.md` — `check`, JSON machine contract, exit codes
- `docs/evals.md` — B-check, B-cli
- `docs/tasks.md` — T19.2
