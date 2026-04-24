# ADR-0008: Atomic config write path

Status: Accepted
Date: 2026-04-25
Owner: AnchorMap maintainers

## Context

AnchorMap has one persisted state file: `anchormap.yaml`. The write commands
`init` and `map` must either leave that file in the exact new canonical state
or return a non-zero result only while preserving the initial target state and
removing any write attempt artifact owned by AnchorMap.

`S2` probed whether the selected Node.js filesystem path can provide the
required same-directory temp write, cleanup verification, and rename commit
boundary before `T4.5` implements the production path.

Relevant constraints:

- `docs/contract.md` sections 7.5, 9.1, 9.2, 12.5, and 13.8 require exact
  canonical config writes, stable outputs, and write failure classification.
- `docs/design.md` sections 5.2, 8, 9.5, and 12 assign config writes and
  `WriteError` ownership to `config_io`.
- `docs/evals.md` sections 5.7, 6.2, 8.12, 9, and Gate D require YAML
  goldens, write failure preservation, no `scan` mutation, and platform
  evidence.
- `docs/operating-model.md` sections 8.6 and 17 require ADR closure for a
  structural filesystem mutation strategy selected by a spike.
- `ADR-0001` selects Node.js 22.x and npm as the runtime baseline.
- `ADR-0007` selects a custom closed-shape YAML writer before the atomic
  write path begins.

## Decision

We will implement `config_io.writeConfigAtomic` with Node.js synchronous
filesystem primitives and one same-directory temp file owned by the current
write attempt.

The write path is:

1. Render the complete canonical YAML bytes in memory before touching disk.
2. Reserve one same-directory temp path by trying a bounded sequence of
   candidate names with exclusive creation.
3. Write all rendered bytes to the reserved descriptor.
4. `fsync` the temp file descriptor.
5. Close the temp file descriptor.
6. Rename the temp path to `anchormap.yaml` in the same directory.
7. Return success immediately after the rename succeeds.

Temp path candidates use this shape:

```text
.<target-basename>.<process-pid>.<attempt-counter>.tmp
```

The bounded candidate sequence is exactly 100 counters: decimal
`attempt-counter` values `0` through `99`, inclusive, with no zero padding.
Counter `0` is attempted first and counter `99` is attempted last. If every
candidate in that range fails reservation with `EEXIST`, the reservation phase
is exhausted and returns `WriteError` without creating, deleting, or verifying
any temp path.

For `anchormap.yaml`, this yields names such as:

```text
.anchormap.yaml.<pid>.<counter>.tmp
```

Each candidate is in the same directory as `anchormap.yaml` and is reserved
with `openSync(temp, O_CREAT | O_EXCL | O_WRONLY, 0o600)`.

If reservation fails with `EEXIST`, the implementation treats that candidate
as a collision with a path it does not own, leaves it untouched, and retries
the next bounded counter. `EEXIST` is not itself a `WriteError`.

Only these reservation outcomes can return `WriteError`:

- a non-`EEXIST` reservation failure before any temp file is created;
- exhaustion of the bounded candidate space without creating any temp file.

The commit boundary is exactly successful same-directory
`rename(temp, anchormap.yaml)`.

Before successful rename, any failure can become `WriteError` only after the
attempt has:

- closed the temp descriptor if it is still open;
- unlinked the exact reserved temp path if this attempt created it;
- rechecked that exact reserved temp path is absent;
- preserved the initial target state, whether absent or byte-identical to the
  initial `anchormap.yaml` bytes.

Cleanup verification is exact-path verification for the candidate created by
the current attempt. It is not a directory scan, and it must not delete
collision paths that existed before or were not created by the attempt.

There is no fallible filesystem step after successful rename in the v1.0
contract path. Directory `fsync` after rename is intentionally outside the
contract path because it would introduce a post-commit failure state.

The production implementation should expose test-only injection around these
pre-commit points:

- before temp reservation;
- exclusive temp creation collision with retry on `EEXIST`;
- non-`EEXIST` exclusive temp creation failure;
- bounded candidate exhaustion without temp creation;
- after temp creation;
- partial write or write failure;
- after full write before `fsync`;
- `fsync` failure;
- after `fsync` before close;
- close failure before rename;
- rename failure before successful commit;
- cleanup close, unlink, or absence-check failure.

No injection point is allowed after successful rename that can turn the command
into a non-zero exit.

## Alternatives considered

### Option A - In-place write or truncate existing target

Pros:

- simplest implementation shape.

Cons:

- can leave a partial `anchormap.yaml` on failure;
- violates the mutation policy for failed `init` and `map`;
- has no clean commit boundary.

### Option B - Same-directory temp write with post-rename directory fsync

Pros:

- can improve crash durability on some filesystems.

Cons:

- introduces a fallible filesystem step after the target has visibly changed;
- cannot return a non-zero code after that point without violating the
  contract rule that failed writes preserve the initial target state.

### Option C - Same-directory temp write, verified pre-commit cleanup, and
rename commit

Pros:

- gives a single visible mutation boundary;
- keeps every fallible filesystem operation before commit;
- lets fixture mutation oracles assert target preservation and temp absence;
- avoids claiming ownership of pre-existing collision paths.

Cons:

- requires explicit descriptor lifecycle and cleanup code;
- requires bounded collision handling and fault-injection coverage.

## Consequences

Positive:

- `T4.5` has a binding write-path strategy before implementation begins.
- Failed write attempts can be tested at every pre-commit boundary.
- `config_io` remains the sole owner of `anchormap.yaml` mutation semantics.

Negative:

- The implementation must carry careful descriptor state and exact-path cleanup
  verification.
- Candidate exhaustion and `EEXIST` retry behavior need explicit tests even
  though they are uncommon in normal use.

Risks:

- Native Linux x86_64 host/kernel/filesystem evidence is not yet complete.
  `S2` assigns that release-matrix confirmation to `T9.3`, not to `T4.5`.
- Cleanup absence checks must distinguish attempt-owned temp files from
  unrelated pre-existing collision files.

## Contract impact

No.

This ADR records the implementation strategy for existing config mutation
guarantees. It does not change `docs/contract.md`.

## Eval impact

No eval weakening is required.

Existing YAML goldens, write-failure fixtures, mutation oracles, and the
cross-platform release matrix remain binding. `T4.5` and later write-command
tasks should include fault-injection coverage for the pre-commit points listed
above.

Native Linux x86_64 evidence remains required by `T9.3` before release-gate
closure.

## Design impact

`docs/design.md` must reference this ADR from:

- section 2.1 Stack and ADRs;
- section 5.2 `config_io`;
- section 8 Chemin d'ecriture unique, borne et atomique;
- section 12 Considerations cross-platform.

The design remains compatible with the existing module boundary:
`config_io.writeConfigAtomic` owns YAML byte preparation, same-directory temp
reservation, pre-commit cleanup, and the rename commit boundary.

## Rollback / supersession

This ADR can be superseded if a later spike proves a safer write strategy that
preserves the same contract guarantees, keeps all fallible filesystem steps
before commit, preserves exact target state on failure, verifies cleanup of
attempt-owned artifacts, and passes the platform matrix.

## Links

- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/tasks.md`
- `docs/adr/0001-runtime-and-package-manager.md`
- `docs/adr/0007-canonical-json-and-yaml-rendering.md`
- `spikes/atomic-write-report.md`
