# ADR-0016: Deterministic tsconfig local alias resolution

Status: Accepted, amended by ADR-0018
Date: 2026-05-05
Owner: AnchorMap maintainers

## Context

AnchorMap adoption is limited when otherwise supported TypeScript repositories
express local product dependencies through common `tsconfig.json` aliases such
as `@/* -> src/*`.

Relevant constraints:

- `docs/brief.md` identifies local aliases as a major segment risk.
- `docs/contract.md` currently treats non-relative specifiers as external for
  v1.0.
- `docs/design.md` keeps TypeScript graph resolution project-owned and smaller
  than full TypeScript or Node module resolution.
- `ADR-0006` fixes the parser profile and graph subset.
- `ADR-0012` already rejects adopting full TypeScript or Node module
  resolution for `.js` specifiers.

## Decision

AnchorMap M15 will read `./tsconfig.json` automatically for deterministic local
alias resolution.

The command surface remains unchanged. `init` does not gain alias options and
`anchormap.yaml` does not store alias declarations.

M15 supports only local deterministic aliases derived from
`compilerOptions.baseUrl` and `compilerOptions.paths` where each supported
entry has exactly one terminal path-segment wildcard `/*` in the key and
exactly one target with exactly one terminal path-segment wildcard `/*`, for
example:

```jsonc
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

AnchorMap reads the root `./tsconfig.json` and follows local relative
`extends`. A missing `./tsconfig.json`, or a present supported config chain
without `compilerOptions.paths`, is allowed and preserves the existing
relative-only graph behavior. If `./tsconfig.json` is present but unreadable,
invalid, or contains M15-inspected configuration that cannot be validated
deterministically, `scan`, `map`, and graph validation fail with repository
error code `3`.

For local relative `extends`, AnchorMap uses a deliberately small inheritance
rule: the nearest config in the root-to-base chain that declares
`compilerOptions.paths` provides the whole paths mapping, without merging paths
from multiple files. Targets are resolved relative to that file's effective
`baseUrl`; declared `baseUrl` values are resolved relative to the config file
that declares them.

Alias-matching `ImportDeclaration` and `ExportDeclaration` string-literal
specifiers are resolved by rewriting the alias prefix to its normalized target,
then applying the existing project-owned candidate and finding classification
rules. Non-relative specifiers that do not match a supported alias remain
external and produce no finding.

## Alternatives considered

### Option A - Declare aliases in `anchormap.yaml`

Pros:

- Keeps `anchormap.yaml` as the only non-spec configuration source.
- Avoids reading TypeScript project configuration.

Cons:

- Makes users duplicate existing TypeScript configuration.
- Reintroduces the startup friction M15 is intended to remove.
- Creates a new config-writing concern for `init` and manual editing.

### Option B - Read the full TypeScript resolver configuration

Pros:

- Matches more TypeScript projects.

Cons:

- Pulls `package.json`, package conditions, project references, resolution
  modes, and TypeScript resolver behavior into the product truth boundary.
- Makes the contract much harder to explain, fixture, and reproduce.

### Option C - Deterministic local alias subset from `tsconfig.json`

Pros:

- Covers the common adoption blocker with a narrow, auditable rule.
- Avoids a new CLI or `anchormap.yaml` schema surface.
- Preserves the existing file-level graph and finding model.

Cons:

- Some valid TypeScript `paths` configurations remain unsupported.
- Users may expect AnchorMap to behave like the full TypeScript resolver.

## Consequences

Positive:

- More real TypeScript mono-package repositories become eligible without manual
  alias duplication.
- Alias behavior is visible in `scan --json` and remains reproducible.
- Existing relative-only repositories continue to work without `tsconfig.json`.

Negative:

- `tsconfig.json` becomes an observed repository input for graph resolution.
- `scan --json` requires a schema bump to expose normalized resolver state.
- Graph fixtures and goldens must cover alias behavior and failure modes.

Risks:

- Users may infer full TypeScript module-resolution support. Documentation,
  findings, and eval names must keep M15 framed as deterministic local alias
  resolution only.

## Contract impact

Yes.

`docs/contract.md` must define the M15 `tsconfig.json` read boundary, supported
alias subset, failure classification, candidate rewriting, non-matching
specifier behavior, and schema v4 config fields.

## Eval impact

Yes.

`docs/evals.md` must add B-graph/B-map/B-cli oracles for missing, invalid, and
supported tsconfig aliases, plus JSON schema v4 goldens with deterministic
alias ordering.

## Design impact

`docs/design.md` must add the `tsconfig_io` boundary and update `ts_graph` so
alias-aware candidate construction reuses the existing graph classification
rules.

## Rollback / supersession

This ADR can be superseded only by an explicit product decision to adopt a
broader TypeScript resolver strategy or to return to relative-only graph
resolution.

## Amendment

`ADR-0018` amends this decision for existing-codebase slice onboarding. Aliases
whose deterministic targets remain under the repository root but outside
`product_root` may be retained as internal resolution aliases. They are not
rendered in `config.local_aliases`, do not create covered local edges, and only
produce graph findings when used by product files.

## Links

- `docs/brief.md`
- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/tasks.md`
- `docs/adr/0006-typescript-parser-and-graph-subset.md`
- `docs/adr/0012-typescript-esm-js-specifier-source-resolution.md`
- `docs/adr/0018-slice-compatible-tsconfig-alias-resolution.md`
