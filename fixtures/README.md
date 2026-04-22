# Fixture Contract

`T1.1` defines the fixture manifest as `manifest.json`, which is the accepted equivalent of `manifest.yaml` for the harness.

This choice is deliberate:

- it stays inside the current repository baseline without adding a YAML dependency before config work;
- it keeps closed-object validation explicit and easy to fail closed;
- it stays compatible with `docs/adr/0003-test-runner-and-fixture-harness.md`, which requires bespoke manifest validation in project code.

## Directory layout

Every fixture lives at `fixtures/<family>/<id>/`.

```text
fixtures/
  <family>/
    <id>/
      manifest.json
      repo/
      stdout.golden
      expected/
        repo/
```

Rules:

- the `<family>` directory basename must equal `manifest.family`;
- the `<id>` directory basename must equal `manifest.id`;
- `repo/` is required, must be a real directory in the fixture tree, and is the source repository tree that later harness tasks materialize into a sandbox;
- `stdout.golden` is required and byte-exact when `stdout.kind = "golden"` and must be a regular non-symlink file;
- `expected/repo/` is required when `filesystem.kind = "expected_files"` and must be a real directory in the fixture tree containing every declared expected file as a regular non-symlink file;
- the manifest is a closed object: unsupported top-level keys are rejected.

## Manifest schema

Required keys:

- `id`: stable fixture identifier surfaced by runner output
- `family`: stable fixture family
- `purpose`: one-line reviewable intent
- `command`: non-empty argv array
- `cwd`: normalized POSIX path relative to the sandboxed repo root
- `exit_code`: expected numeric exit code in the contract range `0..4`
- `stdout`: `{ "kind": "ignored" }`, `{ "kind": "empty" }`, `{ "kind": "golden" }`, or `{ "kind": "exact", "value": "<utf8-text>" }`
- `stderr`: `{ "kind": "ignored" }`, `{ "kind": "empty" }`, `{ "kind": "contains", "value": "<utf8-text>" }`, or `{ "kind": "pattern", "value": "<utf8-pattern>" }`
- `filesystem`: `{ "kind": "no_mutation" }` or `{ "kind": "expected_files", "files": [...] }`

Semantic rules already enforced by the harness validator in `T1.1`:

- `scan --json` success fixtures must use `stdout.kind = "golden"`, `stderr.kind = "empty"`, and `filesystem.kind = "no_mutation"` to stay compatible with `docs/evals.md` §4.2;
- `scan --json` failure fixtures must use `stdout.kind = "empty"`, `stderr.kind = "ignored"` or `stderr.kind = "empty"`, and `filesystem.kind = "no_mutation"`;
- `scan` fixtures without `--json` must not oracle human terminal text and therefore must use `stdout.kind = "ignored"`, `stderr.kind = "ignored"` or `stderr.kind = "empty"`, and `filesystem.kind = "no_mutation"`;
- `init` and `map` fixtures must not oracle human terminal text and therefore must use `stdout.kind = "ignored"` and `stderr.kind = "ignored"` or `stderr.kind = "empty"`;
- `init` and `map` success fixtures must use `filesystem.kind = "expected_files"`;
- `init` and `map` failure fixtures must use `filesystem.kind = "no_mutation"`;
- `stdout.kind = "golden"` requires `stdout.golden` as a regular non-symlink file;
- every fixture directory must contain `repo/` as a real directory, not a symlink;
- `filesystem.kind = "expected_files"` requires `expected/repo/` as a real directory and every declared file under that tree as a regular non-symlink file.

Command shape note:

- the manifest stores `command` as a closed argv contract, not as a shell snippet;
- `T1.1` accepts only `["<cli>", "<subcommand>", ...]` and `["node", "<script>", "<subcommand>", ...]` launcher shapes;
- the harness validates the subcommand from that fixed command slot, so ordinary argument values such as `--seed scan` do not change the fixture oracle rules;
- the harness recognizes `scan --json` only when `--json` occupies the contract flag position immediately after `scan`; later argument values that happen to equal `--json` do not switch the fixture into machine-output mode;
- wrapper forms such as `npm exec -- ...` or `node --eval ...` are rejected until they are modeled explicitly in the fixture contract and test coverage.

Optional keys:

- `tags`: stable tags for selection
- `groups`: stable groups for broader selection
- `fault_injection`: `{ "marker": "<stable-id>" }` for test-only code paths

## Mapping To `docs/evals.md`

For contract boundary fixtures, `manifest.family` should match the eval family name from `docs/evals.md` such as `B-scan`, `B-config`, or `B-cli`.

For any fixture listed in `docs/evals.md`, `manifest.id` must equal the published fixture ID exactly, for example `fx01_scan_min_clean`.

The `harness-schema` examples in this directory are schema-contract examples for `T1.1`; they are not product fixtures and do not replace the future `B-*` corpus.

The runnable `harness-smoke` family is the `T1.8` walking skeleton proof. These fixtures are explicitly harness smoke fixtures, not release-grade product fixtures.

## Local command surface

`T1.7` exposes the stable local harness commands through `package.json`.
The default `fixtures/` tree is the runnable fixture corpus scanned by the
fixture runner. Intentionally invalid manifest examples used only by manifest
validator tests live outside that tree under `testdata/fixture-manifest/`.

- `npm run test:unit` builds the repo and runs the `node:test` suite.
- `npm run test:fixtures:all` builds the repo and runs the fixture runner over the default `fixtures/` tree.
- `npm run test:fixtures -- --fixture harness_smoke_scan_success` runs a single walking skeleton smoke fixture by ID.
- `npm run test:fixtures -- --family harness-smoke` runs the walking skeleton smoke family.
- `npm run check:goldens -- --fixture harness_smoke_scan_success` runs only fixtures with `stdout.kind = "golden"` and fails if the selection has none.

Fixture manifests may target either:

- a built project binary such as `node dist/anchormap.js ...` once the real CLI exists;
- the repository stub binary `node dist/cli-stub.js ...` while the product CLI is still incomplete.

Only those explicit built `dist/` entrypoints are resolved from the project root
when the sandboxed fixture repo does not contain them. Other relative script
paths remain sandbox-local and fail normally if the fixture does not provide
them.
