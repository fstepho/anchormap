# AnchorMap

AnchorMap is a local deterministic CLI for auditing structural traceability
between formal spec anchors and supported TypeScript repositories.

It shows what is observed in specs, what has been mapped explicitly by a human,
what is structurally covered by supported local TypeScript edges, and whether
the analysis is clean or degraded. AnchorMap is not a pruning system and is not
a deletion-safety system.

## Public Demo

A reference demo is available at
[fstepho/anchormap-h3-demo](https://github.com/fstepho/anchormap-h3-demo).

It applies AnchorMap to the `src/` tree of
[h3](https://github.com/unjs/h3) and shows the core mapping and scan flow:
`init`, `scaffold`, selective anchor promotion, `map`, and `scan --json`.

The demo includes a 308-anchor scaffold draft, 3 promoted active anchors, 3
explicit mappings, clean analysis health, a pretty-printed full scan output,
and a short scan brief with the same status, coverage, anchors, findings, and
interpretation vocabulary used by the reference runbooks.

The same demo repository also hosts the draft GitHub Action PR preview set:
one workflow-base PR plus clean, unmapped-anchor, stale-mapping, and
degraded-analysis scenario PRs. The preview uses
`fstepho/anchormap-action@v0-preview.2` with `anchormap@1.2.2` and uploads
GitHub workflow artifacts only. It does not create PR comments or upload source
to an AnchorMap service.

## Install

AnchorMap is distributed as the public npm package `anchormap`.

```sh
npm install -g anchormap
```

The installed command is `anchormap`. The current support matrix is:

- Linux x86_64
- macOS arm64
- Node.js 22 or newer

Other platforms are outside the supported release contract.

## Supported Repository Shape

AnchorMap is intentionally narrow:

- one repository root, which is the current working directory where the command
  starts;
- one TypeScript product tree under `product_root`;
- one or more spec roots containing Markdown or YAML specs;
- product files are `.ts` and `.tsx` files under `product_root`, excluding
  `.d.ts`;
- supported local graph edges come from static TypeScript `import` and `export`
  declarations with relative string-literal specifiers or supported
  deterministic local alias specifiers from `./tsconfig.json`.

`.tsx` files are treated as syntax-only TypeScript product files. JSX is
accepted only as parser syntax in `.tsx`; AnchorMap does not interpret React,
component ownership, JSX runtime behavior, or framework conventions.

AnchorMap automatically reads `./tsconfig.json` when it is present. The
supported alias subset is deliberately small: local relative `extends`, optional
`compilerOptions.baseUrl`, and `compilerOptions.paths` entries with exactly one
terminal `/*` key and exactly one terminal `/*` target under the repository
root. Aliases that target `product_root` are public local aliases and are
reported in `scan --json` as `config.local_aliases`; aliases that target the
repository root but leave `product_root` are used only to classify references
that leave the selected slice.

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

With that config, static `import` and `export` declarations such as
`import { checkReadme } from "@/rules/readme"` are treated as supported local
edges. A missing `./tsconfig.json`, or a supported config chain without
effective `paths`, preserves relative-only graph behavior. A present
`./tsconfig.json` that is unreadable, invalid, cyclic, non-local, or outside
the supported deterministic alias subset makes `scan` and `map` fail with
repository error code `3`.

The following are outside the current support boundary: monorepos, `.js` and
`.jsx` product files, declaration files as product files, TypeScript aliases
beyond the deterministic local subset above, package specifier resolution,
dynamic imports, `require`, project references, Node resolver conditions,
framework semantics, and repository-wide inference beyond the configured roots.

## Existing Codebase Slice Setup

Run AnchorMap on an unmodified existing TypeScript codebase slice. No framework
setup, no build integration, no tsconfig edits. AnchorMap reports what is
deterministically traceable inside the slice, and marks references that leave
that scope.

A slice is one configured `product_root` inside a larger repository. Common
examples are `app`, `src`, or `server`.

Start at the existing repository root:

```sh
mkdir -p .specify/specs
anchormap init --root app --spec-root .specify/specs
anchormap scan --json > anchormap.scan.json
```

Keep the repository's original `./tsconfig.json`. AnchorMap reads only the root
`./tsconfig.json` and local relative `extends` files. It does not read
framework configuration, package exports, project references, workspace
metadata, Git state, caches, network data, clocks, or environment variables as
resolver truth.

Interpret the first report as a slice boundary report:

- `files[*].supported_local_targets` lists supported static references traced
  inside `product_root`;
- `out_of_scope_static_edge` means a supported static reference points to an
  existing file outside the selected slice;
- `unresolved_static_edge` means a supported local or alias reference could not
  be resolved inside the deterministic subset;
- aliases outside `product_root` are not rendered in `config.local_aliases`,
  even when they are used internally to classify an outgoing reference.

These findings are analysis results, not proof of dead code or ownership. To
try a different slice, run `init` in a fresh checkout or replace
`anchormap.yaml` intentionally with a new `product_root`.

For a reference runbook against an existing codebase slice, see
[`demos/outline-reference`](demos/outline-reference/README.md). It uses
Outline's original `tsconfig.json` and presents the result as a degraded slice
boundary report, not as the clean public demo.

## Minimal Example

Start in a TypeScript mono-package repository:

```text
.
├── .specify/
│   └── specs/
│       └── requirements.md
└── src/
    ├── index.ts
    └── rules/
        └── readme.ts
```

Example spec:

```md
# DOC.README.PRESENT README present
```

Example product files:

```ts
// src/index.ts
import { checkReadme } from "./rules/readme";

export { checkReadme };
```

```ts
// src/rules/readme.ts
export function checkReadme(path: string): boolean {
	return path.endsWith("README.md");
}
```

Initialize AnchorMap:

```sh
anchormap init --root src --spec-root .specify/specs
```

This creates `anchormap.yaml`:

```yaml
version: 1
product_root: 'src'
spec_roots:
  - '.specify/specs'
mappings: {}
```

Add a human-approved mapping from an anchor to one or more seed files:

```sh
anchormap map --anchor DOC.README.PRESENT --seed src/index.ts
```

Run the machine-readable scan:

```sh
anchormap scan --json
```

`scan --json` writes one canonical JSON object to stdout on success. The root
keys are `schema_version`, `config`, `analysis_health`, `observed_anchors`,
`stored_mappings`, `files`, `traceability_metrics`, and `findings`.

Formatted for readability, the example above reports:

```json
{
  "schema_version": 5,
  "config": {
    "version": 1,
    "product_root": "src",
    "spec_roots": [".specify/specs"],
    "ignore_roots": [],
    "tsconfig_path": null,
    "local_aliases": []
  },
  "analysis_health": "clean",
  "observed_anchors": {
    "DOC.README.PRESENT": {
      "spec_path": ".specify/specs/requirements.md",
      "mapping_state": "usable",
      "source": {
        "kind": "markdown_atx_heading",
        "line": 1,
        "column": 3,
        "heading_level": 1
      }
    }
  },
  "stored_mappings": {
    "DOC.README.PRESENT": {
      "state": "usable",
      "seed_files": ["src/index.ts"],
      "reached_files": ["src/index.ts", "src/rules/readme.ts"]
    }
  },
  "files": {
    "src/index.ts": {
      "covering_anchor_ids": ["DOC.README.PRESENT"],
      "supported_local_targets": ["src/rules/readme.ts"]
    },
    "src/rules/readme.ts": {
      "covering_anchor_ids": ["DOC.README.PRESENT"],
      "supported_local_targets": []
    }
  },
  "traceability_metrics": {
    "summary": {
      "product_file_count": 2,
      "stored_mapping_count": 1,
      "usable_mapping_count": 1,
      "observed_anchor_count": 1,
      "active_anchor_count": 1,
      "draft_anchor_count": 0,
      "covered_product_file_count": 2,
      "uncovered_product_file_count": 0,
      "directly_seeded_product_file_count": 1,
      "single_cover_product_file_count": 2,
      "multi_cover_product_file_count": 0
    },
    "anchors": {
      "DOC.README.PRESENT": {
        "seed_file_count": 1,
        "direct_seed_file_count": 1,
        "reached_file_count": 2,
        "transitive_reached_file_count": 1,
        "unique_reached_file_count": 2,
        "shared_reached_file_count": 0
      }
    }
  },
  "findings": []
}
```

## Scaffold Draft Specs

For an existing TypeScript repo, `scaffold` can create a draft Markdown spec
from public exports in supported `.ts` and `.tsx` product files:

```sh
anchormap scaffold --output .specify/specs/scaffold.generated.md
```

The generated file starts with:

```md
<!-- anchormap: draft -->
```

Draft anchors are visible in `scan --json` with `mapping_state: "draft"`, but
they do not emit `unmapped_anchor` findings and they cannot be mapped. To
promote an anchor, add the human intent, remove the draft marker from the file
or move the selected anchor to an active spec file, then run `anchormap map`.
When `scaffold` is run again, anchors already present in current specs are
skipped and only new draft sections are written.

## Local CI And PR Artifacts

`scan --json` is the source artifact for local CI and PR workflows:

```sh
anchormap scan --json > anchormap.scan.json
```

Current scans use schema v5, which adds closed source-location metadata for
observed spec anchors. Source locations contain line and column numbers only;
they do not include source text or snippets. Artifact commands that consume
scan files accept supported schema v4 and v5 inputs.

Use `check` to evaluate a local policy against either a live scan or an
explicit scan artifact:

```sh
anchormap check --policy anchormap.policy.yaml --json
anchormap check --scan anchormap.scan.json --policy anchormap.policy.yaml --json
```

The supported policy file is a closed YAML object with `version: 1` and
optional `fail_on` and `thresholds` sections:

```yaml
version: 1
fail_on:
  analysis_health: degraded
  finding_kinds:
    - untraced_product_file
thresholds:
  min_covered_product_file_percent: 80
  max_untraced_product_files: 0
```

Policy failures are not technical errors. With `--json`, `check` writes a
stable `PolicyResult` JSON artifact to stdout and exits with code `5`.

Compare two scan artifacts without Git:

```sh
anchormap diff --base base.scan.json --head head.scan.json --json > anchormap.diff.json
```

Explain one anchor or one file from a scan artifact alone:

```sh
anchormap explain --anchor DOC.README.PRESENT --scan anchormap.scan.json --json
anchormap explain --file src/index.ts --scan anchormap.scan.json --json
```

Render a stable Markdown report from explicit artifacts:

```sh
anchormap report --scan anchormap.scan.json --format markdown > anchormap.report.md
anchormap report --scan anchormap.scan.json --check anchormap.check.json --diff anchormap.diff.json --format markdown > anchormap.report.md
```

Render CI-native reports from explicit artifacts:

```sh
anchormap report --check anchormap.check.json --format junit > anchormap.junit.xml
anchormap report --scan anchormap.scan.json --format sarif > anchormap.sarif.json
```

For future SaaS ingestion, `bundle` can assemble explicit scan, check, diff,
and metadata inputs into one local JSON artifact without uploading anything.

`diff`, `explain`, `report`, and `bundle` are artifact-only. They do not read
Git, `anchormap.yaml`, repository source files, CI variables, network data,
caches, clocks, or environment variables as product truth. `report` serializes
the artifacts it is given; `bundle` validates and embeds the artifacts and the
explicit metadata it is given. Neither command proves that the inputs came from
the same run.

The current artifact workflow is deliberately local. AnchorMap does not provide
upload, dashboard, GitHub App, source snippets, symbol observation, call graph,
or implicit CI metadata inference.

## Commands

AnchorMap exposes these commands:

- `anchormap init --root <path> --spec-root <path> [--spec-root <path> ...] [--ignore-root <path> ...]`
- `anchormap map --anchor <anchor_id> --seed <path> [--seed <path> ...] [--replace]`
- `anchormap scan [--json]`
- `anchormap scaffold --output <path>`
- `anchormap check --policy <path> [--scan <scan.json>] [--json]`
- `anchormap diff --base <base.scan.json> --head <head.scan.json> [--json]`
- `anchormap explain (--anchor <anchor_id> | --file <path>) --scan <scan.json> [--json]`
- `anchormap report --scan <scan.json> [--check <check.json>] [--diff <diff.json>] --format markdown`
- `anchormap report --check <check.json> --format junit`
- `anchormap report --scan <scan.json> [--check <check.json>] [--diff <diff.json>] --format sarif`
- `anchormap bundle --scan <scan.json> --check <check.json> --diff <diff.json> --metadata <metadata.json> --json`

`init` creates `./anchormap.yaml` once. `map` creates or replaces explicit human
mappings in `./anchormap.yaml`. `scan` reads `./anchormap.yaml` and the
configured repository inputs; it never writes to disk. `scaffold` creates one
draft Markdown file and never mutates `./anchormap.yaml`. `check` applies a
local policy to either a live scan or an explicit scan artifact. `diff`
compares two explicit scan artifacts. `explain` reconstructs one anchor or file
view from a scan artifact. `report` renders Markdown, JUnit XML, or SARIF JSON
from explicit artifacts. `bundle` assembles explicit scan, check, diff, and
metadata inputs into one local JSON artifact.

Human-readable terminal output is not a stable contract. Use `scan --json`,
`check --json`, `diff --json`, `explain --json`, `report --format markdown`,
`report --format junit`, `report --format sarif`, and `bundle --json` for
stable outputs.

## Exit Codes

Exit-code overview:

- `0`: success, including completed analyses that emit findings in JSON;
- `1`: write failure or internal failure;
- `2`: `anchormap.yaml` is missing, unreadable, invalid, or violates config
  rules;
- `3`: repository inputs outside `anchormap.yaml` cannot be read, decoded,
  parsed, indexed, or otherwise inspected as required;
- `4`: unsupported command, option, option combination, policy, artifact path,
  artifact JSON, or artifact schema;
- `5`: `check` policy failure after all technical preconditions succeeded.

For `scan --json`, `check --json`, `diff --json`, `explain --json`,
`report --format sarif`, and `bundle --json`, success writes JSON to stdout and
leaves stderr empty. For `report --format markdown`, success writes Markdown to
stdout and leaves stderr empty. For `report --format junit`, success writes XML
to stdout and leaves stderr empty. `check --json` with a policy failure also
writes JSON to stdout and exits `5`. On technical exit codes `1` through `4`,
stdout is empty and no machine result is emitted.

For `scan` and `map`, an invalid present `./tsconfig.json` is a repository
input failure and exits with code `3`. Argument errors still have priority over
repository inspection, and `anchormap.yaml` config errors still have priority
over other repository input errors.

## Interpreting Results

`anchormap.yaml` is the only AnchorMap-owned persistent source of truth. It
stores stable config and explicit human mappings only; it does not store caches,
derived graph data, candidates, classifications, history, metrics, or
`tsconfig.json` aliases. Alias state from `./tsconfig.json` is an observed input
rendered in `scan --json` as `config.tsconfig_path` and
`config.local_aliases`.

`covering_anchor_ids` reports structural reachability from usable mappings under
the supported local TypeScript rules. It is not ownership proof.

`untraced_product_file` means a product file was not reached by any usable
mapping when the analysis was clean enough to emit that finding. It does not
mean dead code, and it does not authorize removing the file.

`analysis_health = clean` means no degrading findings were emitted. It does not
mean every product file is mapped.

For the full machine contract, see the
[repository contract](https://github.com/fstepho/anchormap/blob/main/docs/contract.md).
