# ADR-0009: Packaging and distribution

Status: Accepted
Date: 2026-04-27
Owner: AnchorMap maintainers

## Context

AnchorMap v1.0 needs a publishable artifact after the M9 release gates pass.
The packaging decision must preserve the existing runtime contract and must not
introduce a second product truth source.

Relevant constraints:

- `docs/contract.md` section 3.1 guarantees deterministic v1.0 behavior,
  including no disk writes by `scan` and no failed-write mutation by `init` or
  `map`.
- `docs/contract.md` section 9 exposes exactly `init`, `map`, and `scan`.
- `docs/contract.md` section 12.4 limits the supported v1.0 platform matrix to
  Linux x86_64 and macOS arm64.
- `docs/contract.md` section 12.6 forbids cache, Git metadata, clock, network,
  and environment variables as product sources of truth.
- `docs/design.md` section 2.1 records stack decisions through accepted ADRs.
- `docs/design.md` section 11 requires pinned release inputs,
  `package-lock.json`, and the release launcher from `ADR-0011`.
- `docs/design.md` section 15 keeps the repository layout illustrative rather
  than contractual.
- `docs/evals.md` section 11 requires all release gates to pass before a v1.0
  release is accepted.
- `docs/evals.md` section 12 requires archived technical publication evidence.
- `ADR-0001` selects Node.js 22.x, npm, CommonJS compiled output in `dist/`,
  and no direct TypeScript execution in the product path.
- `ADR-0002` keeps the CLI command boundary project-owned.
- `ADR-0011` selects `bin/anchormap` as the release CLI launcher measured by
  Gate F.
- Public npm consumers do not install through this repository's
  `package-lock.json`; the published package therefore needs a consumer-visible
  lockback mechanism for parser-affecting transitive dependencies such as the
  `commonmark@0.30.0` dependency closure.

At decision time, the repository package metadata already uses the unscoped
package name `anchormap`. A registry metadata check on 2026-04-27 returned
`E404` for `npm view anchormap`, which is compatible with using that name if the
registry still accepts it during publication.

## Decision

AnchorMap v1.0 will be distributed as a public npm registry package:

- package coordinate: `anchormap@1.0.0`;
- distribution channel: the public npm registry;
- package visibility: public;
- distribution mode: registry-based, with the npm package tarball as the
  immutable release artifact;
- versioning: SemVer 2.0.0, with the first stable release published as
  `1.0.0`;
- npm dist-tag: `latest` for the stable v1.0 artifact;
- repository tag: `v1.0.0` for publication evidence and source correlation;
- runtime entrypoint: `bin/anchormap`, preserving the `ADR-0011` Node launch
  profile.

The published package must be installed through npm-compatible registry flows,
for example `npm install -g anchormap` or an equivalent package-manager command
that resolves the same public registry artifact. A GitHub release may mirror
checksums and evidence, but it is not the canonical distribution channel for
v1.0.

The package contents policy is a closed publish allowlist:

- `package.json`, included by npm;
- `npm-shrinkwrap.json`, generated for the v1.0 publication candidate;
- `bin/anchormap`;
- compiled runtime files under `dist/`;
- root user-facing release documents that npm includes by convention, such as
  `README.md` or `LICENSE`, when present.

The package must not include `src/`, `fixtures/`, `bench/`, `reports/`,
`docs/adr/`, developer-only scripts, or local task/process documents unless a
later ADR supersedes this policy. The package must not depend on Git metadata,
registry metadata, network access, clock time, cache state, or environment
variables for runtime behavior.

`package.json` must be updated in T10.2 to match this decision before any
publish attempt. At minimum, T10.2 must set the v1.0 package identity and
visibility, preserve the `bin` mapping, preserve the closed `files` allowlist,
and keep direct contract-affecting dependencies pinned exactly.

T10.2 must also add `npm-shrinkwrap.json` as the published consumer lockback
mechanism. The shrinkwrap must be derived from the same lockfile state as the
Gate G/M9 release candidate and must pin the production dependency closure that
can affect TypeScript parsing, Markdown parsing, YAML parsing, filesystem
enumeration, JSON serialization, or canonical YAML writing. It must include
exact versions and integrity evidence for transitive runtime dependencies,
including the `commonmark@0.30.0` transitive closure. `package-lock.json` remains
the repository lockfile required by `ADR-0001` and Gate G, but it is not
sufficient publication evidence by itself because public npm consumers do not
use this repository's package lock when installing `anchormap@1.0.0`.

If the public npm registry no longer accepts `anchormap` at publication time,
publication must stop and this ADR must be superseded before choosing a
different package name or channel.

Artifact checksums are required:

- T10.5 must produce an actual named package tarball with `npm pack` or an
  equivalent command that writes a reusable package file before checksum
  evidence is recorded. A dry-run report may be archived as supplemental
  evidence, but dry-run metadata alone is not sufficient checksum evidence.
- T10.5 must record the tarball filename, included files, package version, npm
  `integrity` value, npm `shasum`, and a separately computed SHA-256 checksum
  computed from that tarball file.
- T10.5 publication dry-run evidence must target the same named tarball whose
  package, install, checksum, and lockback evidence is archived.
- T10.6 must publish the same validated tarball artifact, or produce a new
  named tarball and rerun the required package, install, checksum, lockback,
  and publication dry-run checks for that regenerated artifact if the channel
  requires regeneration.
- Publication evidence must record the final registry coordinate,
  `dist.integrity`, `dist.shasum`, SHA-256 checksum, package URL or registry
  lookup result, and post-publish install verification result.

M9 release evidence is linked to the published artifact by publication
evidence, not by runtime behavior. The T10.5 tarball artifact report and any
supplemental dry-run report must reference:

- the M9 release gate report from `reports/t9.6/release-report.json`;
- the M9 release gate markdown summary when present;
- the T9.7 entropy review artifact;
- the T10.3 installed-artifact verification report;
- the artifact checksum record for the exact package tarball.

T10.6 publication evidence must reference the T10.5 tarball artifact report and
its artifact checksum record, so publication links back to the already
validated tarball without making the T10.5 report reference itself.

Publication is forbidden unless the referenced M9 release verdict is passing
and the T10 installed-artifact checks pass for the package shape selected here.

## Alternatives considered

### Option A - Public npm package `anchormap`

Pros:

- matches the existing Node/npm runtime and package-manager ADR;
- gives users the simplest CLI installation path;
- uses the package-manager registry as the canonical artifact store;
- preserves the `bin/anchormap` release launcher selected by `ADR-0011`;
- makes package contents and post-publish verification auditable through npm
  metadata.

Cons:

- requires npm publication credentials and registry availability;
- package-name availability is an external pre-publication condition;
- npm publication is effectively immutable for a given version and must be
  treated as a release operation, not a test.

### Option B - Private npm package

Pros:

- avoids accidental broad public visibility during release rehearsals;
- can use the same registry mechanics as public npm.

Cons:

- contradicts the v1.0 goal of a distributable public CLI artifact;
- makes install verification dependent on account access;
- increases support friction without improving determinism or contract safety.

### Option C - GitHub release tarball as canonical distribution

Pros:

- can colocate release notes, checksums, and evidence links;
- avoids npm package-name availability risk.

Cons:

- makes installation less natural for a Node CLI;
- shifts package installation, bin linking, and dependency resolution away from
  npm's standard package flow;
- increases the risk that the downloaded artifact and installed artifact are
  not the same thing users exercise.

### Option D - Source-only Git tag or repository checkout

Pros:

- minimal packaging work;
- source correlation is direct.

Cons:

- turns Git availability and local build tooling into distribution
  prerequisites;
- weakens the artifact boundary that T10.3, T10.5, and T10.6 are meant to
  verify;
- risks publishing a source state rather than the exact installed CLI artifact.

### Option E - Standalone native binary or bundled executable

Pros:

- can avoid a user-visible Node/npm prerequisite;
- may simplify a single-file install story.

Cons:

- contradicts the Node/npm baseline selected by `ADR-0001`;
- adds new platform-specific artifact and launcher behavior before v1.0;
- would require new cross-platform packaging evidence and likely a
  superseding release-launcher decision.

## Consequences

Positive:

- the distribution channel aligns with the accepted Node/npm stack;
- the release artifact has a clear registry coordinate and checksum policy;
- package installation can be verified against the same `bin/anchormap`
  launcher measured by release gates;
- M9 evidence remains archived and linked without becoming runtime input.

Negative:

- T10.2 must change package metadata before publication can proceed;
- T10.5 and T10.6 must perform external npm dry-run and publish operations;
- publication is blocked if the npm registry no longer accepts the unscoped
  package name.

Risks:

- if the package allowlist drifts, tests may pass against local `dist/` while
  the published package omits required files;
- if publication evidence is generated from a rebuilt tarball without rerunning
  install verification, the artifact link to M9 can become misleading;
- if repository tags are treated as runtime input, the implementation would
  violate `docs/contract.md` section 12.6.

## Contract impact

No.

This ADR does not change the command set, CLI arguments, stdout/stderr policy,
exit codes, JSON/YAML output, supported platforms, parser profiles, or mutation
behavior. It forbids using package metadata, Git tags, registry metadata, or
release evidence as runtime product truth.

## Eval impact

Yes.

No fixture or gate criteria change is introduced by this ADR. T10.3, T10.5, and
T10.6 must verify the installed npm package artifact, publish allowlist,
consumer lockback evidence, checksums, M9 evidence links, and post-publish
registry discovery required by `docs/evals.md` sections 11 and 12.

## Design impact

The current design remains compatible with this decision because `ADR-0001`
already selects npm, compiled CommonJS output in `dist/`, and no direct
TypeScript execution in the product path, while `ADR-0011` selects
`bin/anchormap` as the release launcher.

Repository docs and future package metadata updates should preserve:

- section 2.1's ADR list, which now includes this accepted packaging ADR;
- section 11's pinned dependency and release-launcher requirements;
- section 15's non-contractual repository layout status.

## Rollback / supersession

Before publication, this decision can be superseded by another accepted ADR if
the npm package name, registry policy, or release evidence requirements prove
incompatible with v1.0.

After publication, a superseding ADR must preserve the published artifact
evidence for `anchormap@1.0.0` and define whether future versions remain on npm
or move to another channel. Published npm versions must not be replaced in
place.

## Links

- `docs/contract.md`
- `docs/design.md`
- `docs/evals.md`
- `docs/tasks.md`
- `docs/adr/0001-runtime-and-package-manager.md`
- `docs/adr/0002-cli-interface-strategy.md`
- `docs/adr/0011-release-cli-node-launch-profile.md`
