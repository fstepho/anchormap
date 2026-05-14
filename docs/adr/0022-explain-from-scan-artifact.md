# ADR-0022: Explain from scan artifact

Status: Accepted
Date: 2026-05-14
Owner: AnchorMap maintainers

## Context

Users and future artifact consumers need focused anchor and file explanations
without rereading the repository. The current scan artifact already contains
observed anchors, stored mappings, files, `supported_local_targets`,
`covering_anchor_ids`, metrics, and findings.

Relevant constraints:

- Explain must work from one scan artifact alone.
- No source files, Git state, cache, network, or config reload may be required
  in artifact mode.
- Paths and traversal must remain deterministic.

## Decision

We will add `anchormap explain` for exactly one subject:

- `--anchor <anchor_id>`
- `--file <path>`

With `--scan <scan.json>`, the command reconstructs an `ExplainResult` from the
scan artifact alone. Anchor explanations use deterministic traversal over
`files[*].supported_local_targets` and stored mapping seeds. File explanations
summarize the file entry, coverage state, and matching findings already present
in the artifact.

Anchor explanation paths use the first path discovered by deterministic BFS.
Seed files are visited in canonical `RepoPath` order. For each file, local
targets are visited in canonical `RepoPath` order. Once a file has been
discovered, its explanation predecessor is not reassigned.

A file explanation for a path absent from `files` may still include findings
that reference that path, such as `broken_seed_path`,
`out_of_scope_static_edge`, or `unsupported_local_target`.

## Alternatives considered

### Option A - Re-run repository analysis for every explain

Pros:

- Can reflect the current working tree.

Cons:

- Prevents SaaS-style artifact consumption and creates divergence from the
  inspected scan.

### Option B - Store extra path explanations in scan

Pros:

- Simpler explain runtime.

Cons:

- Expands scan schema before there is evidence that every explanation needs to
  be precomputed.

### Option C - Reconstruct from scan artifact

Pros:

- Preserves scan as the single analysis artifact and avoids source access.

Cons:

- Explanations are limited to file-level graph data already present in schema
  v4.

## Consequences

Positive:

- Future consumers can explain historical artifacts without code access.

Negative:

- No symbol-level or source-location explanation is possible in SaaS-ready 1.

Risks:

- Traversal order bugs can make output nondeterministic; fixtures must cover
  branching graph paths.

## Contract impact

Yes. `docs/contract.md` must define anchor and file explain outputs and
artifact-only reconstruction.

## Eval impact

Yes. B-explain fixtures and JSON goldens must cover anchor, file, missing
subject, degraded scan, invalid artifact, and deterministic path output.

## Design impact

`docs/design.md` must add an explain domain module that consumes parsed scan
artifacts and performs no repository I/O.

## Rollback / supersession

Future ADRs may add richer explain output after scan schema v5 source
locations. They must keep artifact-only behavior or explicitly supersede this
decision.

## Links

- `docs/contract.md` — `explain`, `ExplainResult`
- `docs/evals.md` — B-explain
- `docs/tasks.md` — T19.4
