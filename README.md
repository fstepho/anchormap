# AnchorMap

AnchorMap is a local deterministic structural traceability CLI for narrow-scope
TypeScript repositories.

It shows what is observed in specs, what has been mapped explicitly by a human,
what is structurally covered by supported local TypeScript edges, and whether
the analysis is clean or degraded. AnchorMap is not a pruning system and is not
a deletion-safety system.

## Install

AnchorMap v1.0 is distributed as the public npm package `anchormap@1.0.0`.

```sh
npm install -g anchormap
```

The installed command is `anchormap`. The v1.0 support matrix is:

- Linux x86_64
- macOS arm64
- Node.js 22 or newer

Other platforms are outside the v1.0 contract.

## Supported Repository Shape

AnchorMap v1.0 is intentionally narrow:

- one repository root, which is the current working directory where the command
  starts;
- one TypeScript product tree under `product_root`;
- one or more spec roots containing Markdown or YAML specs;
- product files are `.ts` files under `product_root`, excluding `.d.ts`;
- supported local graph edges come from static TypeScript `import` and `export`
  declarations with relative string-literal specifiers.

The following are outside the v1.0 support boundary: monorepos, JavaScript
product files, TSX product files, declaration files as product files, TypeScript
path aliases, package specifier resolution, dynamic imports, `require`, and
repository-wide inference beyond the configured roots.

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
anchormap map --anchor DOC.README.PRESENT --seed src/rules/readme.ts
```

Run the machine-readable scan:

```sh
anchormap scan --json
```

`scan --json` writes one canonical JSON object to stdout on success. The root
keys are `schema_version`, `config`, `analysis_health`, `observed_anchors`,
`stored_mappings`, `files`, and `findings`.

## Commands

AnchorMap v1.0 exposes exactly three commands:

- `anchormap init --root <path> --spec-root <path> [--spec-root <path> ...] [--ignore-root <path> ...]`
- `anchormap map --anchor <anchor_id> --seed <path> [--seed <path> ...] [--replace]`
- `anchormap scan [--json]`

`init` creates `./anchormap.yaml` once. `map` creates or replaces explicit human
mappings in `./anchormap.yaml`. `scan` reads `./anchormap.yaml` and the
configured repository inputs; it never writes to disk.

Human-readable terminal output is not a stable contract in v1.0. Use
`scan --json` for the guaranteed machine interface.

## Exit Codes

Exit-code overview:

- `0`: success, including completed analyses that emit findings in JSON;
- `1`: write failure or internal failure;
- `2`: `anchormap.yaml` is missing, unreadable, invalid, or violates config
  rules;
- `3`: repository inputs outside `anchormap.yaml` cannot be read, decoded,
  parsed, indexed, or otherwise inspected as required;
- `4`: unsupported command, option, or option combination.

For `scan --json`, success writes JSON to stdout and leaves stderr empty, even
when the JSON contains findings. On exit codes `1` through `4`, stdout is empty
and no JSON is emitted.

## Interpreting Results

`anchormap.yaml` is the only AnchorMap-owned persistent source of truth. It
stores stable config and explicit human mappings only; it does not store caches,
derived graph data, candidates, classifications, history, or metrics.

`covering_anchor_ids` reports structural reachability from usable mappings under
the supported local TypeScript rules. It is not ownership proof.

`untraced_product_file` means a product file was not reached by any usable
mapping when the analysis was clean enough to emit that finding. It does not
mean dead code, and it does not authorize removing the file.

`analysis_health = clean` means no degrading findings were emitted. It does not
mean every product file is mapped.

For the full machine contract, see `docs/contract.md`.
