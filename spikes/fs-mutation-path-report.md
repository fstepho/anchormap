# S3 — Filesystem mutation detection and path behavior report

## Scope

- Task: `S3 — Filesystem mutation detection and path behavior report`
- Change type: `spike`
- Files changed: this report and `docs/adr/0003-test-runner-and-fixture-harness.md`
- Production behavior changed: `None`

This spike is bounded by:

- `contract.md` — §§4.1, 5, 9, 12.2, 12.3, 12.4
- `design.md` — §§5.1, 7.1, 10.2, 12
- `evals.md` — §§4.2, 5.5, 8.7, 8.9, 8.12, 9
- `operating-model.md` — §§15, 17, 19.1

## Question

Can the harness and `repo_fs` reliably detect mutation, symlinks, case collisions, and non-canonical paths on supported platforms?

## Probe protocol

Throwaway probes were run with:

- Node `v22.19.0`
- Host platform `darwin arm64`
- Temp sandboxes under `os.tmpdir()`

Probe cases:

1. exact byte read and snapshot encoding
2. symlink discovery and copy behavior
3. case-collision materialization
4. non-canonical filename discovery via control-character path
5. unreadable file and unreadable directory failures
6. existence-test failure behavior under unreadable parents

No Git metadata, clock data, network access, or environment-derived state was used by the probes.

## Must-answer summary

### 1. How are pre/post snapshots represented byte-for-byte?

Use a canonical, path-sorted snapshot keyed by canonical sandbox-relative path. Record entry kind for every discovered path, exact bytes for regular files, and raw symlink targets for symlink entries.

Recommended in-memory shape:

```json
[
  { "path": "anchormap.yaml", "kind": "file", "bytes_b64": "dmVyc2lvbjogMQo=" },
  { "path": "specs", "kind": "dir" },
  { "path": "specs/link", "kind": "symlink", "target_raw": "doc.md" }
]
```

Decision:

- compare snapshots by canonical path order
- compare regular files by exact bytes, not hashes alone
- compare symlink entries by exact raw link target, not by followed destination contents
- encode bytes as Base64 in artifacts and diffs because it is byte-preserving and text-safe
- report `added`, `removed`, `changed`, and `type-changed` paths in canonical order, with symlink target changes classified as `changed`

Observed evidence:

- a probe file with bytes `00 01 02 09 0a 0d 1f 20 7f 80 ff` round-tripped exactly
- Base64 representation was `AAECCQoNHyB/gP8=`

Consequence:

- `existsSync` is insufficient for snapshot or candidate checks because it collapses some read failures into `false`
- snapshot building should use `lstat`/`readFile` and preserve surfaced syscall failures

### 2. How are symlinks detected without following unsupported paths?

Detect symlinks with `lstat` or `Dirent.isSymbolicLink()` before any recursion, `stat`, file open, or parse.

Decision:

- `repo_fs.walk` should reject a symlink as soon as it is discovered in an inspected subtree
- the walker must never call `stat` first, because `stat` follows symlinks
- if diagnostics need the raw link target, use `readlink` only after classifying the entry as a symlink

Observed evidence:

- `readdirSync(..., { withFileTypes: true })` reported symlink entries correctly for:
  - a file symlink
  - a directory symlink
  - a dangling symlink
- `lstatSync` kept all three entries as symlinks
- `statSync` followed a directory symlink and reported it as a directory
- `statSync` on a dangling symlink failed with `ENOENT`

Harness materialization consequence:

- `fs.cpSync(src, dst, { recursive: true, dereference: false })` preserved symlink kind on macOS arm64 but rewrote a relative target (`bytes.bin`) into an absolute source path
- `fs.cpSync(..., { dereference: false, verbatimSymlinks: true })` preserved the raw relative target unchanged

Decision:

- the harness must not use default `cpSync` symlink behavior for symlink fixtures
- fixture materialization must use either:
  - `fs.cpSync(..., { recursive: true, dereference: false, verbatimSymlinks: true })`, or
  - an explicit `readlink`/`symlink` copy path

### 3. How are non-canonical in-scope paths detected?

Detect them during recursive discovery, before the path is admitted into the `RepoPath` index.

Decision:

- each discovered entry name must be converted to a sandbox-relative POSIX path and then validated against the `RepoPath` rules in `contract.md` §12.2
- any discovered path containing a control character `U+0000..U+001F` or `U+007F`, or any other discovered shape that cannot be represented as canonical `RepoPath`, must fail the walk as unsupported
- unsupported-path detection must be based on the discovered entry name itself, not on CLI `UserPathArg` normalization, because `fx42c_repo_noncanonical_path_in_scope` is about in-scope discovery

Observed evidence:

- a file named with an actual tab control character, rendered here as `bad\\tname.ts`, was created successfully on the probed macOS arm64 filesystem
- `readdirSync` returned the raw entry name with byte sequence `62 61 64 09 6e 61 6d 65 2e 74 73`
- that discovered name is not representable as canonical `RepoPath` because `RepoPath` forbids control characters under `contract.md` §12.2.1

Fixture consequence:

- `fx42c_repo_noncanonical_path_in_scope` should be realized by creating the non-canonical entry directly inside the sandboxed repo, preferably via a harness setup step after copy
- the fixture must not rely on CLI path arguments to create or reference that path, because `UserPathArg` rejection happens earlier and exercises a different contract boundary

### 4. How are case collisions detected consistently?

Detect them from normalized discovered paths, not from platform case rules.

Decision:

- after each path is converted to canonical `RepoPath`, compute a stable lowercase projection of the full path
- if two distinct canonical paths map to the same lowercase projection, fail the walk as unsupported
- the comparison must be locale-independent

Observed result on the current macOS volume:

- creating `Case.ts` and then writing `case.ts` did not materialize two entries
- the second write updated the existing file
- the directory still contained a single entry, `Case.ts`

Result:

- collision detection logic is reliable only when the underlying filesystem can represent both entries
- a regular committed fixture tree on a default case-insensitive macOS developer volume cannot encode `fx39_repo_case_collision_in_scope`

Decision:

- Linux x86_64 should run the real boundary fixture against native filesystem entries
- macOS arm64 needs a harness-level synthetic setup path for this case unless the test volume is explicitly case-sensitive

### 5. How are unreadable files and enumeration failures simulated in fixtures?

Simulate them after sandbox materialization, not as committed fixture-tree state.

Observed evidence:

- `chmod 000` on a file caused `readFileSync` to fail with `EACCES` and syscall `open`
- `chmod 000` on a directory caused `readdirSync` to fail with `EACCES` and syscall `scandir`
- `lstatSync` on a child under the blocked directory failed with `EACCES`
- `existsSync` on that same child returned `false`, hiding the permission failure

Decision:

- unreadable file fixtures should be created by a harness setup step that changes permissions after copy
- enumeration-failure fixtures should be created by a harness setup step that removes directory read/execute permissions after copy
- required existence tests in `repo_fs` or `ts_graph` must not use `existsSync`
- candidate existence checks must use an operation that surfaces `EACCES`/`EPERM` as failures

Current fixture mechanism implication:

- the existing `fault_injection` marker in `manifest.json` is the right control point for harness-only permission setup or syscall injection
- Git-tracked fixture trees should not be relied on to preserve unreadable modes portably

## Probe outcomes by platform

| Probe | macOS arm64 observed here | Linux x86_64 outcome |
| --- | --- | --- |
| Exact byte snapshot | Pass. Raw bytes round-trip exactly; Base64 is stable and lossless. | Not observed in this workspace. Expected to pass with the same representation. |
| Symlink discovery | Pass with `lstat`/`Dirent.isSymbolicLink()`. `stat` follows links and is unsuitable for classification. | Not observed in this workspace. Must be rerun in `T9.3`. |
| Symlink copy fidelity | Default `cpSync` is insufficient because it rewrites relative link targets; `verbatimSymlinks: true` preserved them. | Not observed in this workspace. Must be rerun in `T9.3`. |
| Non-canonical path discovery | Pass. A filename containing an actual tab control character was created; `readdirSync` returned the raw bytes unchanged, so the walker can reject it during `RepoPath` validation. | Not observed in this workspace. Expected on POSIX filesystems; must be rerun in `T9.3`. |
| Unreadable file | Pass. `readFileSync` surfaced `EACCES`. | Not observed in this workspace. Must be rerun in `T9.3`. |
| Enumeration failure | Pass. `readdirSync` on a `000` directory surfaced `EACCES`. | Not observed in this workspace. Must be rerun in `T9.3`. |
| Case collision native fixture | Native reproduction unavailable on the default case-insensitive macOS volume. | Expected to be reproducible on a case-sensitive Linux filesystem; must be observed there in `T9.3`. |

## Result

Partial yes.

- Mutation snapshots, symlink detection, non-canonical path detection by discovered-name validation, unreadable-file failures, and enumeration failures can be handled reliably with ordinary Node filesystem APIs on the supported macOS arm64 host.
- Case-collision detection is a valid `repo_fs` rule, but native fixture materialization of that condition is not reliable on a default case-insensitive macOS volume.
- Default `cpSync` symlink copying is not faithful enough for harness fixtures because it can rewrite relative symlink targets.
- `existsSync` is not admissible anywhere the contract requires distinguishing “missing” from “existence test failed”.

## Decision

Adopt the following implementation constraints for the blocked tasks:

1. Harness snapshots should record canonical path order, entry kind, exact file bytes encoded as Base64 for regular files, and exact raw symlink targets for symlink entries.
2. Harness and `repo_fs` walkers should classify with `lstat`/`Dirent.isSymbolicLink()` and never `stat` first.
3. Discovered in-scope paths must be validated against `RepoPath` invariants before they enter any index; control-character paths must fail as unsupported.
4. Harness fixture copy must preserve symlink targets verbatim.
5. Non-canonical-path, unreadable-file, and enumeration-failure fixtures should be created post-copy via harness-only setup.
6. Case-collision coverage needs one of:
   - a synthetic walker/input hook on macOS arm64, or
   - an explicitly case-sensitive test volume.
7. The cross-platform release matrix must observe the native collision case on Linux x86_64.

## Consequences

### ADR

- `ADR-0003` consequence: the accepted harness ADR must record the S3 closure points for canonical byte snapshots, verbatim symlink copy, post-copy permission setup, and cross-platform handling of case-collision fixtures.

### Design

- `design.md` consequence: `repo_fs` should explicitly require `lstat`-first traversal and locale-independent lowercase collision keys.
- `design.md` consequence: `repo_fs` should reject discovered names that fail `RepoPath` validation before indexing or recursion continues.
- `design.md` consequence: the harness sandbox copy path should explicitly preserve symlink targets verbatim.
- `design.md` consequence: existence checks must surface filesystem permission failures instead of coercing them to “missing”.

### Contract

- `None`

The contract already says symlinks, case collisions, and non-canonical in-scope paths are unsupported, and already classifies required-read failures under §12.3.

### Evals

- `evals.md` consequence: `fx39_repo_case_collision_in_scope` needs an explicit cross-platform execution note, because a plain committed fixture tree is not natively materializable on a default macOS case-insensitive volume.
- `evals.md` consequence: `fx42c_repo_noncanonical_path_in_scope` should be understood as a discovery-time path-validation fixture, ideally created through harness setup rather than CLI path arguments.
- `evals.md` consequence: fixtures that model unreadable paths or enumeration failures should be understood as harness-setup fixtures, not static tree-only fixtures.

### Tasks

- `T1.2` consequence: sandbox materialization must preserve symlink targets verbatim and support harness-only post-copy setup.
- `T1.2` consequence: sandbox setup must be able to create a discovered in-scope path that violates `RepoPath` invariants for `fx42c`.
- `T1.5` consequence: the mutation snapshot must retain entry kind as well as regular-file bytes so type-changes and symlink additions/removals are observable.
- `T6.1` consequence: repository guardrails must avoid `existsSync`, must classify `EACCES`/`EPERM` existence-test failures as unsupported-repo failures, and must reject discovered non-canonical in-scope paths before indexing.
- `T9.3` consequence: Linux x86_64 must run the native case-collision probe/fixture; macOS arm64 must either use synthetic collision injection or an explicitly case-sensitive test volume.

## Deviation classification

One likely deviation was found:

- Classification: `design gap`
- Point: current docs identify case-collision detection as required, but they do not yet state how the harness should realize that fixture on default case-insensitive macOS volumes.
- Blocking status: non-blocking for this spike report; relevant to `T1.2`, `T6.1`, and `T9.3`

## Conclusion

The spike does not justify a contract change. It does justify a stricter harness and `repo_fs` implementation strategy:

- `lstat`-first traversal
- verbatim symlink copy
- Base64 byte snapshots over canonical paths
- post-copy permission fault setup
- non-`existsSync` existence checks

No production repository traversal behavior was introduced by this spike itself.
