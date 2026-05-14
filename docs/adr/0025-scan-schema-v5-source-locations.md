# ADR-0025: Scan schema v5 source locations

Status: Accepted
Date: 2026-05-14
Owner: AnchorMap maintainers

## Context

SaaS-ready 1 kept `scan --json` at schema v4 and deliberately excluded source
locations. JUnit, SARIF, and future SaaS UIs need precise enough source
locations to point at anchors without embedding source text or changing the
file-level nature of AnchorMap analysis.

Relevant constraints:

- Source locations must not include source snippets, spec snippets, or spec
  contents.
- The scan schema remains closed and canonical.
- Existing schema v4 scan artifacts remain useful to artifact commands.
- Source locations describe observed anchor occurrences, not symbol-level or
  call-graph facts.

## Decision

We will introduce scan schema v5 by adding a closed `source` object to every
`observed_anchors[anchor_id]` entry.

Supported source objects are:

- `markdown_atx_heading`, with `line`, `column`, and `heading_level`;
- `yaml_root_id`, with `line` and `column`.

Line and column values are one-based integers. Markdown heading prose is not
serialized in the source object.

Artifact commands that consume scan artifacts in SaaS-ready 2 must support scan
schema v4 and v5 where the command can operate without losing its existing
meaning:

- `check --scan`: v4 and v5.
- `diff`: v4/v4, v5/v5, v4/v5, and v5/v4.
- `explain --scan`: v4 and v5.
- `report --scan`: v4 and v5.

`bundle --scan` must also support v4 and v5, but its compatibility coverage is
owned by the bundle task and B-bundle fixtures after `bundle` exists.

Unknown scan schemas remain closed failures. Supporting v5 does not imply
accepting open objects, source snippets, symbol locations, Git state, or
environment data.

## Alternatives considered

### Option A - Keep v4 only until SaaS upload exists

Pros:

- Avoids scan golden churn.

Cons:

- Blocks precise SARIF and SaaS UI locations.

### Option B - Add source snippets to scan

Pros:

- Richer UI context.

Cons:

- Moves source/spec content into artifacts and weakens the privacy boundary.

### Option C - Add closed source locations only

Pros:

- Enables precise location reporting without embedding source contents.
- Preserves file-level analysis and deterministic artifact semantics.

Cons:

- Requires v4/v5 compatibility handling across artifact commands.

## Consequences

Positive:

- SARIF can point at anchor locations when scans are v5.
- Future SaaS can render source-location links without receiving source text.

Negative:

- Scan goldens and artifact validators must cover both v4 and v5.

Risks:

- Implementations can accidentally treat v5 as permission to add snippets or
  symbol-level facts. The contract must keep the schema closed.

## Contract impact

Yes. `docs/contract.md` must define scan schema v5, source-location object
forms, v4/v5 artifact compatibility, and canonical key ordering.

## Eval impact

Yes. `docs/evals.md` must add B-scan-v5 fixtures and cross-version
compatibility fixtures for existing scan artifact consumers. Bundle-specific
v4/v5 acceptance belongs to B-bundle.

## Design impact

`docs/design.md` must add source-location extraction at the spec parser
boundary and keep source text out of scan artifacts.

## Rollback / supersession

Schema v5 can be superseded by a future schema v6 ADR. Future schemas must
state their compatibility with v4 and v5 artifact commands explicitly.

## Links

- `docs/contract.md` — scan schema v5 and artifact compatibility
- `docs/design.md` — spec parser source-location extraction
- `docs/evals.md` — B-scan-v5 compatibility fixtures and B-bundle
  bundle-specific v4/v5 acceptance
- `docs/tasks.md` — T20.0, T20.2, T20.5
