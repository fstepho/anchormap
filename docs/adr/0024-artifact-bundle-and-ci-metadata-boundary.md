# ADR-0024: Artifact bundle and CI metadata boundary

Status: Accepted
Date: 2026-05-14
Owner: AnchorMap maintainers

## Context

SaaS-ready 2 needs one local artifact that a future SaaS can consume without
adding upload behavior, implicit CI discovery, Git reads, source snippets, or
secret-bearing logs. SaaS-ready 1 deliberately excluded bundle output and common
artifact provenance.

Relevant constraints:

- Bundle creation must consume explicit artifact files only.
- CI and PR metadata must be user supplied as an explicit input file.
- Git, CI variables, environment, network, cache, and clock remain outside the
  product source of truth.
- Bundle output must remain deterministic for byte-identical inputs.

## Decision

We will add `anchormap bundle` as a local, JSON-only artifact command:

```bash
anchormap bundle \
  --scan <scan.json> \
  --check <check.json> \
  --diff <diff.json> \
  --metadata <metadata.json> \
  --json
```

`bundle` validates each supplied artifact against the supported closed schemas,
validates a closed explicit metadata schema, embeds the parsed artifacts, and
adds SHA-256 hashes of the canonical artifact bytes that AnchorMap embeds.

The metadata file is a control input. It may label repository, commit, branch,
pull request, provider, or run URL values that the user supplied, but AnchorMap
does not verify those values against Git, CI, the network, the environment, or
the current working tree. Metadata never changes scan, check, diff, or report
semantics.

The bundle may include:

- file paths already present in supported AnchorMap artifacts;
- anchors, findings, metrics, policy decisions, and diffs already present in
  supported AnchorMap artifacts;
- explicit closed metadata fields;
- hashes of embedded artifacts.

Outside explicit closed metadata fields, the bundle must not introduce:

- source file contents;
- full spec contents or spec snippets;
- environment variables;
- secrets;
- CI logs;
- implicit Git state;
- network-derived or clock-derived facts.

AnchorMap validates metadata syntactically against the closed schema. It does
not semantically classify explicit metadata values as secrets, logs, source
content, or provenance.

## Alternatives considered

### Option A - Add upload first

Pros:

- Direct hosted workflow.

Cons:

- Requires SaaS API, authentication, network, storage, retry, and privacy
  decisions outside CLI SaaS-ready 2.

### Option B - Infer metadata from Git and CI

Pros:

- Easier CI setup for users.

Cons:

- Violates the explicit-input and no-Git/no-env source-of-truth boundary.

### Option C - Explicit local bundle

Pros:

- Produces a SaaS-consumable artifact without source upload or implicit state.
- Keeps artifact behavior deterministic and fixture-testable.

Cons:

- Users must prepare metadata explicitly in CI.

## Consequences

Positive:

- Future SaaS ingestion can start from a single local JSON artifact.
- Provenance labels are visible without making Git or CI variables product
  truth.

Negative:

- Bundle compatibility rules and hash rendering require new fixtures and
  goldens.

Risks:

- Metadata can be mistaken for verified repository state. Contract and report
  wording must state that metadata is user supplied.

## Contract impact

Yes. `docs/contract.md` must define `bundle`, supported artifact versions,
metadata schema, bundle JSON schema, canonical ordering, hash semantics, and
stream/exit discipline.

## Eval impact

Yes. `docs/evals.md` must add B-bundle fixtures, JSON goldens, invalid metadata
coverage, artifact compatibility coverage, and artifact isolation coverage.

## Design impact

`docs/design.md` must add `metadata_io`, `bundle_model`, canonical artifact
hashing, and the `bundle` command pipeline.

## Rollback / supersession

This ADR can be superseded by a future upload or SaaS-ingestion ADR. Any
superseding ADR must preserve local bundle generation unless it explicitly
changes product scope.

## Links

- `docs/brief.md` — §6.10, §13
- `docs/contract.md` — `bundle`, artifact compatibility, bundle JSON
- `docs/design.md` — SaaS-ready 2 pipelines and module boundaries
- `docs/evals.md` — B-bundle and artifact isolation
- `docs/tasks.md` — T20.0, T20.1, T20.5
