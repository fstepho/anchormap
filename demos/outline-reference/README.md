# Outline Reference Demo Runbook

This runbook exercises the M17 existing-codebase slice story against the
Outline repository without editing Outline's original `tsconfig.json`.

One-minute story:

> AnchorMap traced this `app` product slice; these references leave the selected
> scope.

## Boundary

- Use Outline's root `tsconfig.json` exactly as it exists in the checkout.
- Do not replace it with an alias-only config.
- Do not add framework setup or build integration.
- Treat the result as a slice boundary report, not monorepo-wide traceability,
  dead-code detection, or framework awareness.

## Run

Start outside this AnchorMap repository:

```sh
git clone https://github.com/outline/outline.git outline-anchormap-demo
cd outline-anchormap-demo
```

Install or point at an AnchorMap build:

```sh
npm install -g anchormap
```

Create one active demo spec and initialize AnchorMap for the `app` slice:

```sh
mkdir -p .specify/specs
cat > .specify/specs/anchormap-outline-slice.md <<'EOF'
# OUTLINE.APP.SLICE Outline app slice smoke
EOF

anchormap init --root app --spec-root .specify/specs
```

Run the first scan using Outline's unchanged root `tsconfig.json`:

```sh
test -f tsconfig.json
anchormap scan --json > anchormap.outline-app.scan.json
```

Optional local formatting for inspection:

```sh
node -e 'const fs=require("node:fs"); const p="anchormap.outline-app.scan.json"; console.log(JSON.stringify(JSON.parse(fs.readFileSync(p,"utf8")), null, 2));'
```

## Read The Result

Use this quick pass:

```sh
node - <<'NODE'
const fs = require("node:fs");
const report = JSON.parse(fs.readFileSync("anchormap.outline-app.scan.json", "utf8"));
const files = Object.entries(report.files);
const traced = files.filter(([, file]) => file.supported_local_targets.length > 0);
const leaving = report.findings.filter((finding) => finding.kind === "out_of_scope_static_edge");
const unresolved = report.findings.filter((finding) => finding.kind === "unresolved_static_edge");

console.log(`schema_version: ${report.schema_version}`);
console.log(`product_root: ${report.config.product_root}`);
console.log(`tsconfig_path: ${report.config.tsconfig_path}`);
console.log(`public local aliases: ${report.config.local_aliases.length}`);
console.log(`product files: ${files.length}`);
console.log(`files with traced in-slice references: ${traced.length}`);
console.log(`references leaving selected scope: ${leaving.length}`);
console.log(`unresolved supported references: ${unresolved.length}`);
NODE
```

The expected M17 readout is bounded:

- `tsconfig_path` is `"tsconfig.json"`, proving the original root config was
  read;
- `supported_local_targets` shows references traced inside `app`;
- `out_of_scope_static_edge` marks existing targets outside `app`;
- `unresolved_static_edge` marks supported local or alias references that could
  not be resolved by AnchorMap's deterministic subset;
- aliases that point outside `app` are not public local aliases and do not
  appear in `config.local_aliases`.

## Reset

Remove only the demo artifacts created by this runbook:

```sh
rm -f anchormap.yaml anchormap.outline-app.scan.json
rm -rf .specify
```
