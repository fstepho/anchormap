# S2 — Atomic Write and Cleanup Behavior Report

## Question

Can the selected filesystem/write implementation provide the required same-directory temp write, pre-commit cleanup, and rename boundary for implementation work, with native Linux x86_64 proof retained for the release cross-platform gate?

## Binding References

- `contract.md` §7.5, §9.1, §9.2, §12.5, §13.8
- `design.md` §5.2, §8, §9.5, §12
- `evals.md` §5.7, §6.2, §8.12, §9, Gate D
- `operating-model.md` §17, §19.1
- `ADR-0001` fixes the runtime baseline to Node.js 22.x and npm.

## Selected Approach Under Probe

Use Node.js synchronous filesystem primitives in `config_io.writeConfigAtomic`:

1. Render the complete canonical YAML bytes in memory before touching disk.
2. Reserve one same-directory temp file by trying a bounded sequence of
   candidate names with `openSync(temp, O_CREAT | O_EXCL | O_WRONLY, 0o600)`.
3. Write all bytes to that descriptor.
4. `fsyncSync(fd)`.
5. `closeSync(fd)`.
6. `renameSync(temp, anchormap.yaml)`.
7. Return success immediately after `renameSync` succeeds.

The intended temp path shape for each candidate is:

```text
.<target-basename>.<process-pid>.<attempt-counter>.tmp
```

For `anchormap.yaml`, that yields names such as:

```text
.anchormap.yaml.<pid>.<counter>.tmp
```

Each candidate path is in the same directory as `anchormap.yaml`. It is
reserved exclusively with `O_CREAT | O_EXCL`.

If reservation fails with `EEXIST`, the implementation must treat that as a
collision with a file it did not create, leave that existing path untouched,
and retry the next counter until a candidate is reserved or the bounded
candidate space is exhausted. An `EEXIST` collision is not, by itself, a
pre-commit `WriteError`.

Only these reservation outcomes can return `WriteError`:

- a non-`EEXIST` reservation failure before any temp file is created;
- exhaustion of the bounded candidate space without creating any temp file.

In the exhaustion case, cleanup is a no-op because the attempt owns no temp
file. The implementation must not claim to remove or verify absence of
collision paths it did not create. Fixture-level mutation oracles can still
detect pre-existing auxiliary AnchorMap files when a fixture intentionally
starts with them.

## Write Boundary

The exact commit boundary is successful same-directory `rename(temp, anchormap.yaml)`.

- Before successful rename: failures may return `WriteError` only after cleanup is complete and temp absence has been rechecked.
- At rename failure: the operation is still pre-commit for contract purposes; cleanup must remove the temp file and preserve the original target state.
- After successful rename: there is no fallible filesystem step in the v1.0 path. Directory fsync is intentionally outside the contract path because it would introduce a post-commit failure state.

## Cleanup Verification Method

For every failure before successful rename:

1. Close the temp descriptor if it is still open.
2. Remove the reserved temp path if this attempt created it.
3. Recheck the exact reserved temp path with `lstat`/existence check.
4. Return `WriteError` only after the exact reserved temp path is absent.
5. Verify `anchormap.yaml` is still absent if initially absent, or byte-identical to its initial content if initially present.

The cleanup check is exact-path verification for the candidate actually
created by this attempt, not a directory scan. `EEXIST` collision paths are not
owned by the attempt and must not be unlinked by cleanup. Fixture-level
mutation oracles still check that no auxiliary file remains in the repo.

## Fault-Injection Points

The implementation should expose test-only injection around these pre-commit points:

- before temp reservation;
- exclusive temp creation collision with retry on `EEXIST`;
- non-`EEXIST` exclusive temp creation failure;
- bounded candidate exhaustion without temp creation;
- after temp creation;
- partial write / write failure;
- after full write before `fsync`;
- `fsync` failure;
- after `fsync` before close;
- close failure before rename;
- rename failure before successful commit;
- cleanup close/unlink/absence-check failure, classified as internal/write-path failure that must not be hidden.

No injection point is allowed after successful rename that can turn the command into a non-zero exit.

## Probe Protocol

A throwaway Node.js probe was run outside the repo under `/tmp`.

It exercised:

- initially absent `anchormap.yaml`;
- initially present `anchormap.yaml`;
- injected failures before temp reservation, at exclusive temp creation, after temp creation, during write, after write before fsync, at the `fsyncSync` call, after fsync before close, at the `closeSync` call before rename, after close before rename, and at rename failure;
- pre-created temp candidate collisions that force retry to the next counter;
- bounded candidate exhaustion without temp creation;
- successful write replacing absent and present targets;
- cleanup by close, unlink, and exact temp-path absence check.

The `fsyncSync` and `closeSync` failure cases were test-only monkeypatch
injections around those exact Node.js wrapper calls. They show the proposed
control flow handles wrapper-thrown failures before rename; they are not
evidence of a native kernel/filesystem producing those failures.

The macOS run used Node.js `v22.19.0` with libuv `1.51.0`. The Docker
linux/amd64 run used Node.js `v22.22.2` with libuv `1.51.0`.

## Platform Notes

### macOS arm64

Environment:

- `Darwin 24.6.0 ... RELEASE_ARM64_T6031 arm64`
- Node.js `v22.19.0`
- libuv `1.51.0`

Observed result:

- All injected pre-commit failures preserved the initial target state.
- All injected pre-commit failures that created a temp file removed it and
  verified exact reserved-path absence.
- `EEXIST` reservation collisions skipped the pre-existing candidate without
  unlinking it and succeeded with a later counter.
- Bounded candidate exhaustion returned failure without creating or claiming to
  clean up a temp file.
- Injected `fsyncSync` wrapper failure preserved the original target bytes or
  target absence and removed the owned temp file before returning failure.
- Injected `closeSync` wrapper failure before rename preserved the original
  target bytes or target absence and removed the owned temp file before
  returning failure.
- Successful writes left no temp file and produced the new canonical bytes.
- Simulated rename failure preserved the original target bytes and removed the temp file.

The macOS local `rename(2)` man page states same-filesystem rename removes an existing destination first and guarantees an instance of the destination exists even if the system crashes during the operation.

Assessment: satisfies the required mutation policy on the observed macOS arm64 environment.

### Linux amd64 Docker Desktop Evidence

Environment:

- Docker Desktop server: `linux/arm64`
- Container forced with `--platform linux/amd64`
- `Linux 6.5.11-linuxkit x86_64 GNU/Linux`
- `uname -m`: `x86_64`
- Node.js `process.arch`: `x64`
- Node.js `v22.22.2`
- libuv `1.51.0`

Observed result:

- All injected pre-commit failures preserved the initial target state for both
  initially absent and initially present `anchormap.yaml`.
- All injected pre-commit failures that created a temp file removed it and
  verified exact reserved-path absence.
- `EEXIST` reservation collisions skipped pre-existing candidates without
  unlinking them and succeeded with a later counter.
- Bounded candidate exhaustion returned failure without creating or claiming to
  clean up a temp file.
- Injected `fsyncSync` wrapper failure preserved the original target bytes or
  target absence and removed the owned temp file before returning failure.
- Injected `closeSync` wrapper failure before rename preserved the original
  target bytes or target absence and removed the owned temp file before
  returning failure.
- Successful writes replacing absent and present targets left no temp file and
  produced the new canonical bytes.
- The probe covered `before-temp`, `exclusive-temp-eexist-retry`,
  `exclusive-temp-non-eexist-failure`, `exclusive-temp-exhausted`,
  `after-temp`, `during-write`, `after-write-before-fsync`, `fsync-throws`,
  `after-fsync-before-close`, `close-throws`,
  `after-close-before-rename`, and `rename-failure`.

Assessment: this is partial evidence. It exercises a linux/amd64 Node.js
userland in a Docker Desktop container on an arm64 host, but it does not prove
native Linux x86_64 kernel/filesystem behavior for the supported release
platform matrix. It is sufficient evidence to select the implementation
strategy before `T4.5` when combined with the observed macOS run and the POSIX
same-directory rename model; native Linux x86_64 confirmation remains a
`T9.3` release-gate obligation.

### Native Linux x86_64

Environment:

- Not observed in this rework session.

Assessment: deferred to `T9.3`. Native Linux x86_64 host/kernel/filesystem
evidence is still required before release-gate closure, but it is not required
to select the `T4.5` implementation strategy.

## Result

macOS arm64 evidence passes.

The Docker Desktop linux/amd64 probe passes, including injected `fsyncSync` and
`closeSync` wrapper failures, but it is emulated/containerized partial evidence
only.

Native Linux x86_64 evidence is missing and remains assigned to `T9.3`. S2 can
still select the implementation strategy for `T4.5` because the spike's
pre-implementation requirement is macOS arm64 observation plus Linux amd64
container/POSIX evidence, not release-matrix closure.

## Decision

Do not introduce a production write path in S2.

The selected T4.5 strategy is:

- same-directory temp path owned by `config_io`;
- exclusive temp reservation across a bounded same-directory candidate
  sequence, retrying the next counter on `EEXIST`;
- complete YAML bytes prepared before disk mutation;
- write, `fsync`, close, then same-directory rename as the only commit;
- cleanup and exact reserved-temp absence verification before any `WriteError`
  when the attempt created a temp file;
- no cleanup claim for pre-existing collision candidates that the attempt did
  not create;
- no fallible post-rename step.

S2 is ready for fresh review. Native Linux x86_64 evidence remains required by
`T9.3`, not by S2 blocker clearance.

## Consequences

Design:

- None.

Contract:

- None.

Evals:

- None.

Tasks:

- `T0.2` is the required closure after the S2 result.
- `T4.5`, `T8.5`, and `T9.3` remain blocked until S2 is reviewed and completed.
- `T0.2` must record the selected write-path strategy in `ADR-0008` before the
  autopilot loop returns to the `T4.5` product cursor.
- `T9.3` must record native Linux x86_64 atomic write cleanup and
  rename-boundary evidence as part of the supported-platform matrix.
