# AnchorMap v1.0 Release Runbook

This runbook covers the public npm release selected by `ADR-0009`:
`anchormap@1.0.0`, public registry, dist-tag `latest`, and repository tag
`v1.0.0`.

Publication is forbidden unless all fail-closed checks below pass from the
repository root.

## Starting Evidence

Required starting evidence:

- `reports/t9.6/release-report.json` exists and records
  `release_verdict: "pass"`.
- `reports/t9.6/release-report.md` exists as the M9 summary.
- `reports/t9.7/entropy-review.json` exists for the release candidate.
- `reports/t10.3/installed-artifact-report.json` exists and records
  `verdict: "pass"`.

Do not publish from a missing, failing, edited-by-hand, or stale replacement of
that evidence. If any item is missing or failing, stop and return to the owning
task instead of continuing this runbook.

## Pre-Publish Checks

Run the release gates and package evidence commands:

```sh
npm run release:gates
npm run verify:installed-artifact
npm run release:publication-dry-run
```

`npm run release:publication-dry-run` builds the package, writes the reusable
tarball, computes the SHA-256 checksum from that tarball file, validates the
closed `ADR-0009` package allowlist, validates the runtime closure and
`npm-shrinkwrap.json` lockback, and runs:

```sh
npm publish --dry-run reports/t10.5/anchormap-1.0.0.tgz --json
```

Required T10.5 outputs:

- `reports/t10.5/anchormap-1.0.0.tgz`
- `reports/t10.5/anchormap-1.0.0.tgz.sha256`
- `reports/t10.5/consumer-lockback.json`
- `reports/t10.5/t10.5-tarball-artifact.json`
- `reports/t10.5/t10.5-publication-dry-run.json`
- matching archived evidence under `reports/t9.6/evidence/`

Recompute the tarball checksum before publishing:

```sh
shasum -a 256 reports/t10.5/anchormap-1.0.0.tgz
cat reports/t10.5/anchormap-1.0.0.tgz.sha256
```

The two SHA-256 values must match exactly. The npm `integrity`, npm `shasum`,
tarball filename, package name, and package version in
`reports/t10.5/t10.5-tarball-artifact.json` and
`reports/t10.5/t10.5-publication-dry-run.json` must describe the same named
tarball.

## Credential Assumptions

The publish operator must have an npm account with permission to publish the
unscoped public package `anchormap` to `https://registry.npmjs.org/`.

Before the real publish, verify credentials without changing package state:

```sh
npm whoami --registry https://registry.npmjs.org/
```

If the registry no longer accepts `anchormap`, stop. `ADR-0009` must be
superseded before changing the package name or distribution channel.

## Publish

Publish the exact tarball validated by T10.5:

```sh
npm publish reports/t10.5/anchormap-1.0.0.tgz --access public --tag latest --registry https://registry.npmjs.org/
```

Do not rebuild the package between the T10.5 dry-run and this command. If a new
tarball is created for any reason, rerun package creation, checksum, lockback,
installed-artifact verification, and publication dry-run for that new tarball.

After a successful npm publish, create the repository tag used for source
correlation:

```sh
git tag v1.0.0
git push origin v1.0.0
```

Git tags and registry metadata are release evidence only. They are not runtime
product inputs.

## Post-Publish Verification

Record T10.6 evidence before closing the release:

- final registry coordinate: `anchormap@1.0.0`
- `dist.integrity` and `dist.shasum` from npm registry metadata
- SHA-256 for the published tarball
- link to `reports/t10.5/t10.5-tarball-artifact.json`
- post-publish installation result

Verify registry metadata:

```sh
npm view anchormap@1.0.0 dist.integrity dist.shasum version --registry https://registry.npmjs.org/
```

Verify install from the public registry in a clean temporary consumer project:

```sh
post_publish_check_dir="$(mktemp -d /tmp/anchormap-post-publish-check.XXXXXX)"
cd "$post_publish_check_dir"
npm init -y
npm install anchormap@1.0.0 --no-audit --no-fund --registry https://registry.npmjs.org/
mkdir -p src specs
printf 'export const value = 1;\n' > src/index.ts
printf '# AM-001: Minimal behavior\n' > specs/requirements.md
./node_modules/.bin/anchormap init --root src --spec-root specs
./node_modules/.bin/anchormap map --anchor AM-001 --seed src/index.ts
./node_modules/.bin/anchormap scan --json
```

The installed package must still resolve through `bin/anchormap` and compiled
`dist/` files.

## Rollback Or Deprecation

npm versions are immutable. Do not attempt to replace `anchormap@1.0.0` in
place.

If the publish is wrong but the package is not useful to users, deprecate the
published version with a precise message:

```sh
npm deprecate anchormap@1.0.0 "Do not use: release evidence failed post-publication verification."
```

If a corrected package is required, publish a new SemVer version only after a
superseding task or ADR defines the release path and all required gates and
publication evidence pass for the replacement artifact.
