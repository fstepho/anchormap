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

Install AnchorMap or point at a local build:

```sh
npm install -g anchormap
# or:
# export ANCHORMAP_BIN="node /path/to/anchormap/dist/anchormap.js"
```

If `ANCHORMAP_BIN` is not set, the commands below use the installed
`anchormap` binary:

```sh
ANCHORMAP_BIN="${ANCHORMAP_BIN:-anchormap}"
```

Initialize AnchorMap for the `app` slice and scaffold draft anchors:

```sh
mkdir -p .specify/specs

$ANCHORMAP_BIN init --root app --spec-root .specify/specs
$ANCHORMAP_BIN scaffold --output .specify/specs/scaffold.generated.md
```

Run a first scan using Outline's unchanged root `tsconfig.json`:

```sh
test -f tsconfig.json
$ANCHORMAP_BIN scan --json > anchormap.outline-app.scaffold.json
```

Promote three scaffolded anchors into a temporary active spec:

```sh
cat > .specify/specs/outline-demo-active.md <<'EOF'
# ACTIONS.DEFINITIONS.API_KEYS.CREATE_API_KEY

Allows a user to start the API key creation flow from the action menu.

# ACTIONS.DEFINITIONS.DOCUMENTS.CREATE_DOCUMENT

Allows a user to create a new document from document actions.

# ACTIONS.DEFINITIONS.TEAMS.DESKTOP_LOGIN_TEAM

Allows a desktop login action to route the user into a team session.
EOF
```

Map those anchors one at a time:

```sh
$ANCHORMAP_BIN map \
  --anchor ACTIONS.DEFINITIONS.API_KEYS.CREATE_API_KEY \
  --seed app/actions/definitions/apiKeys.tsx

$ANCHORMAP_BIN map \
  --anchor ACTIONS.DEFINITIONS.DOCUMENTS.CREATE_DOCUMENT \
  --seed app/actions/definitions/documents.tsx

$ANCHORMAP_BIN map \
  --anchor ACTIONS.DEFINITIONS.TEAMS.DESKTOP_LOGIN_TEAM \
  --seed app/actions/definitions/teams.tsx
```

Run the mapped scan:

```sh
$ANCHORMAP_BIN scan --json > anchormap.outline-app.mapped.json
```

## Read The Result

Use the non-contractual scan brief helper from this repository:

```sh
ANCHORMAP_REPO=/path/to/anchormap
node "$ANCHORMAP_REPO/demos/outline-reference/scan-brief.mjs" anchormap.outline-app.mapped.json
```

The helper reads AnchorMap's `scan --json` output and prints a bounded demo
brief. It does not replace `scan --json`, define additional product behavior,
infer ownership, or identify dead code.

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
rm -f anchormap.yaml anchormap.outline-app.scaffold.json anchormap.outline-app.mapped.json
rm -rf .specify
```
