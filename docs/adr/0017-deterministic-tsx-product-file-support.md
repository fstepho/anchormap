# ADR-0017: Deterministic TSX product file support

Status: Accepted
Date: 2026-05-06
Owner: AnchorMap maintainers

## Context

AnchorMap now supports deterministic local aliases from `tsconfig.json`, but
otherwise eligible TypeScript mono-package repositories are still rejected when
their product code includes React-style `.tsx` source files.

Relevant constraints:

- `docs/brief.md` identifies segment fit as an adoption risk.
- `docs/contract.md` owns the supported `product_file` class, parser profile,
  candidate ordering, and failure classification.
- `ADR-0006` pins the TypeScript parser dependency and graph subset.
- `ADR-0012` and `ADR-0016` keep source-candidate resolution project-owned and
  smaller than full TypeScript or Node module resolution.

## Decision

AnchorMap M16 will support `.tsx` as a product-file extension alongside `.ts`.

The same exact `typescript@6.0.3` parser dependency remains normative. `.ts`
product files are parsed with `ScriptKind.TS`; `.tsx` product files are parsed
with `ScriptKind.TSX`. JSX is accepted only as syntax in `.tsx`; AnchorMap does
not interpret components, JSX runtime behavior, React semantics, framework
conventions, or symbol-level ownership.

Static `ImportDeclaration` and `ExportDeclaration` resolution remains
file-level and project-owned. Exact `.tsx` specifiers are supported targets.
Extensionless specifiers consider `.ts`, then `.tsx`, then `index.ts`, then
`index.tsx`, before diagnostic-only JavaScript or declaration candidates.
Explicit `.js` runtime specifiers consider the sibling `.ts` source first, then
the sibling `.tsx` source, then the exact `.js` diagnostic candidate.
This explicitly amends the candidate order accepted by `ADR-0012`.

`.js`, `.jsx`, and `.d.ts` remain unsupported as product files.

## Alternatives considered

### Option A - Keep `.tsx` unsupported

Pros:

- Preserves the smallest TypeScript parser surface.
- Avoids any risk of users expecting React or framework semantics.

Cons:

- Excludes many otherwise supported TypeScript mono-package repositories.
- Leaves a visible adoption blocker after M15 alias support.

### Option B - Support `.tsx` as syntax-only TypeScript source

Pros:

- Covers common React-style source layouts with a narrow deterministic rule.
- Reuses the existing TypeScript parser dependency and graph model.
- Does not introduce package, framework, or resolver state.

Cons:

- Changes graph outputs where `.tsx` previously produced
  `unsupported_local_target` or stale seed behavior.
- Requires fixture and golden updates across graph, map, scaffold, and
  metamorphic coverage.

### Option C - Add framework-aware TSX support

Pros:

- Could match more frontend project expectations.

Cons:

- Pulls framework semantics, JSX runtime conventions, and often `package.json`
  into the product truth boundary.
- Conflicts with AnchorMap's file-level deterministic scope.

## Consequences

Positive:

- More real TypeScript mono-package repositories become eligible.
- TSX behavior is visible through the existing `files`,
  `supported_local_targets`, mappings, and metrics surfaces.

Negative:

- `.tsx` is no longer available as a convenient `unsupported_local_target`
  fixture case; fixtures that need that finding must use `.js` or `.d.ts`
  instead.

Risks:

- Users may infer React, Next, or full TypeScript resolver support. Contract,
  docs, and eval names must keep M16 framed as syntax-only `.tsx` product-file
  support.

## Contract impact

Yes.

`docs/contract.md` must update `TS_PROFILE`, `product_file`, seed
admissibility, candidate ordering, `.js` source-candidate resolution, scaffold
module-path stripping, and unsupported-extension wording.

## Eval impact

Yes.

`docs/evals.md` must add B-graph, B-map, and B-scaffold coverage for `.tsx`,
including import, re-export, extensionless, `index.tsx`, alias, `.js -> .tsx`,
and `.ts` before `.tsx` precedence cases. The M16 closure must also update
unsupported-extension, metamorphic, and affected B-scan golden fixtures that
previously used `.tsx` as an unsupported target.

## Design impact

`docs/design.md` must update `product_files`, `ts_graph`, `map`, and
`scaffold` behavior to treat `.tsx` as a supported product-file extension while
preserving the existing file-level graph.

## Rollback / supersession

This ADR can be superseded only by an explicit product decision to return to
`.ts`-only product files or to adopt a broader TypeScript/framework resolver.

## Links

- `docs/brief.md`
- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/adr/0006-typescript-parser-and-graph-subset.md`
- `docs/adr/0012-typescript-esm-js-specifier-source-resolution.md`
- `docs/adr/0016-deterministic-tsconfig-local-alias-resolution.md`
- `docs/tasks.md`
