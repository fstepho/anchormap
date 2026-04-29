# ADR-0012: TypeScript ESM `.js` specifier source resolution

Status: Accepted
Date: 2026-04-29
Owner: AnchorMap maintainers

## Context

AnchorMap v1.0 treats a relative `.js` specifier in a `.ts` product file as a
diagnostic-only exact target. That keeps the v1.0 graph subset narrow, but it
does not cover TypeScript repositories using Node ESM style source imports such
as `import "./dep.js"` while the checked-in source file is `dep.ts`.

Relevant constraints:

- `docs/brief.md` keeps v1.0 intentionally narrow and excludes `.js` files as
  product files.
- `docs/contract.md` section 10.2 owns candidate construction and classification
  for supported static TypeScript occurrences.
- `docs/design.md` assigns project-owned TypeScript graph resolution to
  `ts_graph`.
- `ADR-0006` keeps the parser profile and graph subset reproducible and
  intentionally smaller than full TypeScript module resolution.

## Decision

AnchorMap v1.1 should support relative explicit `.js` specifiers in `.ts`
source files by first testing the sibling `.ts` source candidate produced by
replacing the terminal `.js` with `.ts`.

This extends `ADR-0006` for candidate construction only. It does not replace the
`typescript@6.0.3` parser profile, does not make `.js` a supported product-file
extension, and does not adopt TypeScript or Node module resolution.

For an explicit `.js` specifier:

1. the source candidate `<specifier without terminal .js>.ts` is considered
   before the exact `.js` diagnostic candidate;
2. if that `.ts` source candidate exists, is under `product_root`, and is not
   under `ignore_roots`, it is the supported target;
3. if both the `.ts` source candidate and the exact `.js` file exist in
   supported scope, the `.ts` source candidate wins;
4. if no source `.ts` candidate is retained but the exact `.js` file exists in
   supported scope, the occurrence produces `unsupported_local_target`;
5. unresolved, out-of-scope, and ignored-target classification remains governed
   by the existing ordered graph-finding rules.

## Alternatives considered

### Option A - Keep v1.0 `.js` specifiers diagnostic-only

Pros:

- preserves the already released v1.0 behavior;
- avoids any risk of users reading AnchorMap as a full module resolver.

Cons:

- excludes common Node ESM TypeScript source layouts where local source imports
  are written with runtime `.js` specifiers.

### Option B - Add narrow `.js -> .ts` source candidate resolution

Pros:

- covers the common ESM source pattern while staying file-level and
  deterministic;
- keeps `.js` runtime files diagnostic-only;
- does not require `tsconfig.json`, `package.json`, Node conditions, or package
  exports.

Cons:

- changes observable graph behavior for repositories that currently receive an
  `unsupported_local_target` or `unresolved_static_edge` for an explicit `.js`
  specifier.

### Option C - Implement TypeScript or Node module resolution

Pros:

- would match more modern TypeScript projects.

Cons:

- imports `tsconfig.json`, `package.json`, package conditions, filesystem
  conventions, and version-sensitive resolver semantics into the product truth
  boundary;
- exceeds the deterministic, narrow graph subset selected for AnchorMap.

## Consequences

Positive:

- TypeScript ESM source repositories become a planned supported segment without
  broadening product files beyond `.ts`.
- The v1.1 implementation has an exact candidate-order contract before code
  changes begin.

Negative:

- The v1.1 implementation must update graph fixtures and scan goldens because
  supported edges and findings can change for explicit `.js` specifiers.

Risks:

- Users may expect full Node ESM behavior. Documentation and findings must keep
  this extension framed as a narrow source-candidate rule only.

## Contract impact

Yes, for v1.1 only.

`docs/contract.md` now records the v1.1 candidate list and diagnostic rules in
the v1.1 `.js` specifier section. The v1.0 section 10.2 remains unchanged
until the implementation task deliberately activates the extension.

## Eval impact

The v1.1 B-graph fixtures must cover:

- `.js` specifier to `.ts` source resolution;
- import and re-export forms;
- explicit `index.js` to `index.ts` source resolution;
- priority when both `.ts` and `.js` exist;
- exact `.js` unsupported-target diagnostics when no `.ts` source exists;
- unresolved explicit `.js` specifiers.

## Design impact

`ts_graph` must add a distinct candidate-definition branch for explicit `.js`
specifiers when the v1.1 extension is activated. The parser profile and
product-file discovery rules remain unchanged.

## Rollback / supersession

This ADR can be superseded if AnchorMap later adopts a broader TypeScript or
Node resolver strategy through an explicit product and contract change.

## Links

- `docs/brief.md`
- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/adr/0006-typescript-parser-and-graph-subset.md`
- `docs/tasks.md`
