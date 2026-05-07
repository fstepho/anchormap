# ADR-0018: Slice-compatible tsconfig alias resolution

Status: Accepted
Date: 2026-05-07
Owner: AnchorMap maintainers

## Context

`ADR-0016` made deterministic `tsconfig.json` aliases usable when aliases
target the configured `product_root`. That keeps the graph small, but it still
blocks adoption in existing TypeScript repositories where the unmodified root
`tsconfig.json` contains both product-slice aliases and aliases for code outside
the selected slice.

M17 is an onboarding improvement: a user selects one product surface, for
example `product_root: app`, keeps the repository's existing `tsconfig.json`,
and receives a deterministic report separating traced in-slice references from
references that leave that selected scope.

Relevant constraints:

- no CLI change;
- no `anchormap.yaml` schema change;
- no JSON schema version change beyond the existing schema `4`;
- no full TypeScript, Node, framework, package, project-reference, or monorepo
  resolver;
- only root `./tsconfig.json` and local relative `extends` remain readable;
- invalid or non-deterministic tsconfig inputs must still fail before mutation.

## Decision

AnchorMap M17 amends `ADR-0016` by classifying deterministic aliases into two
valid internal categories plus one invalid category.

Valid categories:

- **Public local alias**: a deterministic alias whose normalized target remains
  under `product_root`. It is used by graph resolution and rendered in
  `scan --json` as `config.local_aliases`.
- **Resolution alias**: a deterministic alias whose normalized target remains
  under the repository root but outside `product_root`. It is used internally by
  graph resolution and never rendered in `config.local_aliases`.

Invalid category:

- **Invalid alias/input**: malformed, non-deterministic, escaping the repository
  root, invalid or cyclic `extends`, symlink in inspected tsconfig path, invalid
  JSONC, or any other unsupported inspected tsconfig shape. `scan` and `map`
  fail with repository error code `3`.

Alias matching uses one canonical order over public local aliases and
resolution aliases. Rendering filters that same ordered list to the public local
aliases only, preserving JSON schema `4`.

When a product file uses a resolution alias:

- an existing candidate outside `product_root` produces
  `out_of_scope_static_edge`;
- a candidate that normalizes back under `product_root` through the resolution
  alias suffix never creates a covered edge and produces `unresolved_static_edge`;
- an absent candidate produces `unresolved_static_edge`;
- an unused resolution alias produces no finding.

`map` still validates the graph before mutation, but graph findings caused by
out-of-slice resolution aliases are not blockers by themselves. Invalid
tsconfig inputs still block `map` before any write and preserve the existing
no-mutation guarantee.

`scaffold` remains outside tsconfig alias resolution.

## Alternatives considered

### Option A - Keep M15 strict product-root alias targets

Pros:

- Smallest implementation change.
- Keeps `config.local_aliases` as the complete alias set.

Cons:

- Existing codebases often have shared or server aliases outside the selected
  product slice.
- Users must edit or fork `tsconfig.json` before a first successful scan,
  weakening the onboarding promise.

### Option B - Render every deterministic repo-root alias

Pros:

- Makes all accepted aliases visible.
- Reduces internal/public distinction.

Cons:

- Suggests AnchorMap is tracing the whole repository.
- Changes the public meaning of `config.local_aliases`.
- Makes the selected `product_root` less legible.

### Option C - Internal resolution aliases with public alias filtering

Pros:

- Lets an unmodified existing `tsconfig.json` coexist with a selected slice.
- Preserves schema `4` and the existing public `config.local_aliases` meaning.
- Keeps references that leave the slice visible as findings instead of silently
  ignoring them.

Cons:

- Adds an internal alias visibility distinction.
- Requires fixtures that prove unused out-of-slice aliases are quiet while used
  ones degrade analysis.

## Consequences

Positive:

- First scan can succeed on more existing TypeScript codebase slices without
  tsconfig edits.
- Reports can distinguish in-slice traced edges, existing out-of-slice targets,
  and unresolved alias targets.
- The adoption story remains deterministic and contract-bound.

Negative:

- `tsconfig_io` must carry aliases that are intentionally not rendered.
- Reviewers must check that docs do not imply global monorepo traceability.

Risks:

- Users may infer full TypeScript resolver or framework support. README,
  runbooks, contract text, and fixture names must frame M17 as slice onboarding
  only.

## Contract impact

Yes.

`docs/contract.md` must define public local aliases, internal resolution
aliases, invalid tsconfig inputs, matching order, out-of-slice findings,
schema-v4 preservation, `map` behavior, and the continued exclusion of
`scaffold` from alias resolution.

## Eval impact

Yes.

`docs/evals.md` must requalify `fx38v` from code `3` to a successful degraded
scan, add mixed alias fixtures, add unused out-of-slice alias coverage, add
invalid repo-root escape and invalid `extends` coverage, and add B-map coverage
for success despite out-of-slice alias findings.

## Design impact

`docs/design.md` must extend `tsconfig_io` with public and internal alias
visibility, pass the full resolution alias set to `ts_graph`, pass only public
aliases to scan rendering, and keep `scaffold` outside this resolver.

## Rollback / supersession

This ADR can be superseded by either returning to strict M15 product-root alias
targets or by a future accepted ADR that adopts a broader TypeScript resolver.
The latter must explicitly preserve or replace the slice boundary and finding
model.

## Links

- `docs/brief.md`
- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/tasks.md`
- `docs/adr/0016-deterministic-tsconfig-local-alias-resolution.md`
