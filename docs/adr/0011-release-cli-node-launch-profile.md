# ADR-0011: Release CLI Node launch profile

Status: Accepted
Date: 2026-04-26
Owner: AnchorMap maintainers

## Context

Gate F requires process-level p95 and peak RSS evidence for the release CLI on
supported platforms. The TypeScript compiler API startup is a large fixed RSS
contributor, so the release command may use pinned Node/V8 flags that reduce
startup and parser memory without changing observable AnchorMap behavior.

The launcher must not cap V8 old-space below the direct Node CLI behavior. A
valid supported repository that succeeds through `node dist/anchormap.js scan
--json` must not fail only because the packaged `bin/anchormap` entrypoint
uses a tighter old-space limit.

The contract still names `typescript@6.0.3 parser API` as `TS_PROFILE`.
Replacing the parser would therefore require a contract-visible parser-profile
change. The bounded release strategy is to keep the parser and observable
behavior unchanged while using only launch flags that do not reduce the class of
valid inputs accepted by the direct Node CLI.

Relevant constraints:

- `docs/contract.md` sections 1.1, 4.1, and 12.6 require the pinned
  TypeScript parser profile, determinism, and no implicit data source.
- `docs/evals.md` section 10 and Gate F require process-level p95 and peak RSS
  budgets for the release CLI.
- `docs/design.md` sections 11 and 13 require reproducible release inputs and
  performance budgets without persistent cache.
- `ADR-0001` selects Node.js, npm, compiled JavaScript in `dist/`, and no
  direct TypeScript execution in the product path.
- `ADR-0006` selects `typescript@6.0.3` for the TypeScript parser profile.

## Decision

The release CLI entrypoint is a POSIX launcher at `bin/anchormap`. It invokes
the compiled CommonJS CLI with:

```text
node --no-opt --max-semi-space-size=1 --no-expose-wasm dist/anchormap.js
```

No `--max-old-space-size` flag is used in the release launcher.

Gate F benchmarks measure this release launcher, not direct
`node dist/anchormap.js` invocation.

The TypeScript parser remains `typescript@6.0.3`. This ADR does not supersede
`ADR-0006`.

## Alternatives considered

### Option A - Replace the TypeScript parser

Pros:

- Directly removes the largest RSS contributor.
- Could create more memory headroom than launch tuning.

Cons:

- Changes the parser profile named by `docs/contract.md`.
- Requires new parser semantics, fixtures, dependency audit, and a replacement
  ADR for `ADR-0006`.
- Higher implementation and review risk than a release launcher change.

### Option B - Project-owned lexical/syntax extractor

Pros:

- Lowest likely runtime RSS.
- Can be tailored exactly to AnchorMap's graph subset.

Cons:

- Cannot preserve the current `TS_PROFILE` parse-acceptance contract without
  implementing or embedding a TypeScript-compatible parser.
- Would change the supported/rejected TypeScript input class unless
  `docs/contract.md` changes.

### Option C - Launch the existing release CLI with bounded Node/V8 flags

Pros:

- Preserves `TS_PROFILE` and graph behavior.
- Does not add a parser dependency, cache, network source, Git dependency, or
  environment source of truth.
- Keeps the packaged launcher from imposing an old-space ceiling below direct
  Node CLI behavior.

Cons:

- The release launcher becomes part of the measured runtime strategy.
- The flags are Node/V8-specific and must remain covered by supported-platform
  release measurements.

### Option D - Cap old-space in the release launcher

Pros:

- Can lower peak RSS on small benchmark corpora.
- Keeps the parser profile unchanged.

Cons:

- Can make packaged `bin/anchormap` fail with V8 OOM on valid supported inputs
  that direct `node dist/anchormap.js` accepts.
- Narrows the effective release runtime below the development CLI behavior.
- Hides a memory problem behind an input-size ceiling instead of satisfying the
  product behavior and Gate F together.

### Option E - Weaken Gate F or change the benchmark corpus

Pros:

- Minimal implementation work.

Cons:

- Masks a real release-gate failure.
- Contradicts the eval authority and does not improve the product runtime.

## Consequences

Positive:

- Gate F has a concrete unblocking path without parser replacement.
- The parser contract remains unchanged.
- The release benchmark measures the same entrypoint users will receive through
  `package.json` `bin`.
- Supported inputs are not capped by a release-only old-space limit.

Negative:

- Direct `node dist/anchormap.js` remains a development/test entrypoint, while
  the release CLI is the POSIX launcher.
- If a future Node release removes or materially changes these flags, this ADR
  must be revisited before release.
- Without an old-space cap, RSS improvements must come from bounded in-process
  memory retention or a future parser strategy, not from rejecting larger
  repositories earlier.

Risks:

- Full Gate F still must be rerun on supported platforms.
- The selected flags may need retuning if TypeScript, Node, or the benchmark
  corpus changes.
- If this no-old-space-cap profile fails Gate F, the release strategy is not
  valid and must not be replaced by a smaller old-space cap without a new
  accepted decision that also preserves supported-input behavior.

## Contract impact

No.

No CLI command, option, output, exit code, mutation policy, parser profile, or
finding classification changes.

## Eval impact

Yes.

Gate F benchmarks must invoke `bin/anchormap` so the report measures the
release launcher. No budget is weakened and no corpus shape changes.

## Design impact

`docs/design.md` must reference this ADR from:

- section 2.1 Stack and ADRs;
- section 11 Dependencies and reproducibility;
- section 13 Complexity and budgets.

## Rollback / supersession

This decision can be superseded if a lower-RSS parser strategy is selected by a
contract-compatible parser ADR and the Gate F reports pass without the launch
profile, or if a future packaging ADR selects an equivalent release launcher.

## Links

- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/tasks.md`
- `docs/adr/0001-runtime-and-package-manager.md`
- `docs/adr/0006-typescript-parser-and-graph-subset.md`
