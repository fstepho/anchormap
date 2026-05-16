# AnchorMap — GitHub Action, PR report, and self-serve design partner plan

**Statut**: proposition exploratoire, non normative  
**Portée** : ce document propose une trajectoire GitHub Action + rapport PR + programme design partners pour AnchorMap. Il couvre deux repos : le repo principal `anchormap` — docs, issue templates, workflow exemples — et le repo externe `anchormap-action` — `action.yml`, scripts, README. Les artefacts documentaires produisibles dans le repo actuel sont : ADR, entrées `docs/tasks.md`, docs self-serve, issue templates. Les phases opérationnelles — créer des PRs démo, configurer des labels GitHub, recruter des design partners — peuvent produire de l'état GitHub hors repo, mais ne produisent pas d'artefacts contractuels dans le repo principal.  
**Prévalence** : ce document ne modifie pas le comportement runtime, ne crée aucune tâche active dans `docs/tasks.md`, ne remplace pas `docs/contract.md`, `docs/evals.md`, `docs/design.md`, `docs/brief.md` ni les ADR acceptées.

Les labels `GHA-1` à `GHA-5` ci-dessous sont des labels de plan techniques proposés. Ils ne sont pas des milestones `docs/tasks.md` et ne deviennent exécutables qu'après modification explicite des documents d'autorité applicables, avec tâches traçables, contrat, evals et ADR si nécessaire.

Les labels `PREVIEW-1` à `PREVIEW-3` désignent des activités de validation produit et design partners. Ils peuvent produire de l'état GitHub hors repo — PRs démo, labels, feedback issues — mais ne deviennent des tâches `docs/tasks.md` que pour les artefacts documentaires explicitement ajoutés au repo principal.

## État de traitement

Ce plan est réconcilié avec l'état livré après M20, avec la preview GitHub
finalisée le 2026-05-15, puis avec le rafraîchissement Node 24 du
2026-05-17 :

- `docs/brief.md` §6.10 autorise déjà la surface locale CI/PR par artefacts CLI ;
- `docs/brief.md` §13 distingue déjà `anchormap.yaml` comme seule persistance mutable possédée par AnchorMap des policies et artefacts explicites lus seulement ;
- `ADR-0019` à `ADR-0026` couvrent déjà la surface CLI `check`, `diff`, `explain`, `report`, `bundle`, scan v5, JUnit et SARIF ;
- `docs/contract.md`, `docs/design.md` et `docs/evals.md` définissent déjà les comportements CLI correspondants.
- `ADR-0027` couvre l'orchestration composite de l'action GitHub ;
- `fstepho/anchormap-action@v0-preview.4` est le tag preview audité ;
- `fstepho/anchormap-action#1`, `fstepho/anchormap-h3-demo#1` et `fstepho/anchormap#3` sont mergées sur `main` ;
- les PRs scénario `fstepho/anchormap-h3-demo#2` à `#5` restent ouvertes en draft sur `main` comme cas de démonstration vivants ;
- l'issue ops `fstepho/anchormap#2` est close comme completed après audit réel des artifacts.

Conséquence : ce document ne doit pas rouvrir le contrat CLI déjà accepté. GHA-1
à GHA-3 ainsi que PREVIEW-1 et PREVIEW-2 sont traités pour la preview
`v0-preview.4`. Les décisions restantes portent sur GHA-4, GHA-5 et PREVIEW-3 :
commentaire PR opt-in, exposition Action de JUnit/SARIF, collecte de feedback
réel et décision SaaS-lite/GitHub App/amélioration CLI-Action. Toute tâche
exécutable dans le repo principal devra être ajoutée explicitement à
`docs/tasks.md`; toute décision structurante future de l'action devra être
portée par une ADR dédiée ou par une ADR existante explicitement vérifiée comme
suffisante.

Le principe : AnchorMap reste un CLI local-first ; l’action GitHub ne fait qu’orchestrer les commandes déjà prévues : `scan`, `check`, `diff`, `report`, `bundle`. Le README documente déjà ces commandes comme workflow local CI/PR : elles produisent les artefacts nécessaires, et `diff`, `explain`, `report` et `bundle` sont artifact-only, sans lecture de Git, CI, réseau, caches ou variables d’environnement comme vérité produit. Le package expose aussi déjà les modules `diff-engine`, `policy-engine`, `explain-engine`, `render-markdown-report`, `render-junit-report`, `render-sarif-report` et `bundle-model`, donc le terrain technique est bon.

# Objectif

Créer un parcours autonome où une équipe peut :

```text
1. installer AnchorMap dans un repo TypeScript ;
2. ajouter une policy minimale ;
3. activer une GitHub Action ;
4. obtenir un rapport PR exploitable ;
5. participer comme design partner sans call ni intervention manuelle.
```

Le livrable doit valider une seule hypothèse :

```text
Le signal AnchorMap est-il utile dans le workflow PR ?
```

Pas encore :

```text
Peut-on vendre un SaaS complet ?
```

---

# Décision produit

Je choisirais cette séquence :

```text
Phase 1 — GitHub Action sans SaaS
Phase 2 — PR report autonome
Phase 3 — programme design partners self-serve
Phase 4 — collecte de signaux
Phase 5 — décision SaaS-lite ou non
```

À ne pas faire maintenant :

```text
- dashboard SaaS ;
- GitHub App complète ;
- upload automatique ;
- billing ;
- auth ;
- stockage serveur ;
- commentaire PR automatique par défaut ;
- logique de commentaire PR avancée avant validation du job summary ;
- analyse du code côté serveur.
```

---

## Prérequis d’autorité

Les labels `GHA-N` ne deviennent exécutables qu’après vérification de conformité et adoption ou vérification explicite des autorités applicables listées ci-dessous. Tant qu’ils ne sont pas adoptés ou rattachés à une autorité acceptée, aucune ligne du backlog n’est imputable à `docs/tasks.md` et aucune gate de `docs/evals.md` ne peut être ouverte pour ces milestones.

### Conformité à `docs/brief.md`

**§6.10 — surface CI/PR locale via artefacts CLI**

Le plan ne requiert pas d'amendement préalable à `docs/brief.md` tant que la GitHub Action reste une couche d'orchestration locale des commandes CLI existantes et respecte les contraintes suivantes :

- aucune logique serveur ;
- aucun dashboard SaaS ;
- aucun upload automatique vers un service tiers ;
- aucune GitHub App complète ;
- aucune lecture de Git, CI, réseau, caches ou variables d'environnement comme vérité produit AnchorMap ;
- aucune analyse de code côté serveur ;
- aucun commentaire PR automatique par défaut.

La GitHub Action peut lire le contexte GitHub uniquement comme contexte d'exécution GitHub Actions — par exemple pour écrire un job summary ou uploader des workflow artifacts — mais ce contexte ne devient pas une source de vérité produit pour `scan`, `check`, `diff`, `report` ou `bundle`.

`docs/brief.md` §6.2 reste le garde-fou OUT : un amendement à `docs/brief.md` devient nécessaire seulement si le plan introduit une intégration serveur, un upload SaaS, une GitHub App complète, une inférence implicite depuis Git/CI comme vérité produit, ou un comportement write-by-default dans les PRs.

### Autorités à créer ou vérifier

| Roadmap | Autorité CLI déjà disponible | Décision restante côté Action / preview |
| --- | --- | --- |
| GHA-1 | `ADR-0019`, `ADR-0020`, `ADR-0021`, `ADR-0023`; `docs/contract.md` §§9.5, 9.6, 9.8 | ADR dédiée ou vérification ADR explicite pour `action.yml` composite, script shell, inputs/outputs, forwarding contrôlé de l’exit code `5`, upload d'artefacts workflow et job summary |
| GHA-2 | `ADR-0023`; `docs/contract.md` §13.13 | ADR dédiée ou vérification ADR explicite pour affichage GitHub job summary + artifact sans altérer le Markdown canonique |
| GHA-3 | `ADR-0021`; règle commune des commandes d'artefacts dans `docs/contract.md` §9 | ADR dédiée ou vérification ADR explicite pour mode baseline fourni par l'utilisateur et refus de récupération automatique d'un artifact `main` |
| GHA-4 | aucune autorité CLI supplémentaire requise si le rapport reste l'artefact Markdown canonique | ADR dédiée recommandée pour modèle de permissions opt-in, `pull-requests: write`, update-not-create et restrictions fork PR |
| GHA-5 | `ADR-0024`, `ADR-0025`, `ADR-0026`; `docs/contract.md` §§9.8, 9.9, 13.14, 13.15, 13.16 | ADR dédiée ou vérification ADR explicite pour intégration GitHub `actions/upload-artifact`, exposition optionnelle JUnit/SARIF et absence d'upload SARIF implicite |

Les décisions CLI ne doivent pas être dupliquées dans une ADR GitHub Action. Une ADR Action doit seulement décider l'orchestration, les permissions, les artefacts GitHub Actions, les inputs/outputs et les garanties de non-inférence propres au workflow. `docs/tasks.md` peut ensuite planifier l'exécution de ces décisions, mais ne peut pas les porter comme autorité de remplacement.

### Ordre d’adoption recommandé

1. Vérifier la conformité à `docs/brief.md` §6.10 et §13 et documenter explicitement que GHA-1 à GHA-3 restent dans la surface CLI locale CI/PR déjà autorisée. Fait pour la preview `v0-preview.4`.
2. ADR GHA-1 acceptée, ou vérification écrite qu'une ADR existante couvre toute la décision structurante, puis tâche de planification traçable → ouvre l'implémentation de l'action composite. Fait via `ADR-0027`.
3. Vérification de `ADR-0023` + décision d'affichage GitHub job summary → ouvre GHA-2. Fait pour job summary + artifact Markdown.
4. Vérification de `ADR-0021` + décision baseline explicite → ouvre GHA-3. Fait pour le mode `base-scan` explicite.
5. ADR GHA-4 et GHA-5 après validation de GHA-1 et GHA-2. Reste futur.

GHA-1 à GHA-3 ainsi que PREVIEW-1 et PREVIEW-2 ne sont plus seulement
exploratoires pour la preview auditée. GHA-4, GHA-5 et PREVIEW-3 restent des
suites futures qui nécessitent des issues et décisions dédiées.

---

# Phase 1 — Créer l’action GitHub officielle

## Nom recommandé

Deux options :

```text
fstepho/anchormap-action
```

ou, dans le repo actuel au début :

```text
action.yml
```

Je recommande **un repo séparé** :

```text
github.com/fstepho/anchormap-action
```

Raison : l’action devient un produit d’intégration indépendant du moteur CLI. Cela évite de mélanger release CLI et release Action.

## Type d’action

GHA-1 minimal action : **composite action**.

Elle ne doit pas implémenter de logique métier. Elle doit seulement :

```text
- installer Node ;
- installer anchormap ;
- lancer scan ;
- lancer check ;
- éventuellement lancer diff ;
- générer report Markdown ;
- produire artifacts ;
- exposer outputs ;
- respecter les exit codes.
```

## Inputs GHA-1

```yaml
inputs:
  anchormap-version:
    description: 'Pinned npm version of anchormap to install'
    required: true

  node-version:
    description: 'Node.js version used to run anchormap'
    required: false
    default: '22'

  policy:
    description: 'Path to anchormap policy file'
    required: false
    default: 'anchormap.policy.yaml'

  base-scan:
    description: 'Optional path to base scan artifact'
    required: false

  upload-artifacts:
    description: 'Whether to upload generated artifacts'
    required: false
    default: 'true'

  fail-on-policy:
    description: 'Whether exit code 5 should fail the workflow'
    required: false
    default: 'true'
```

## Outputs GHA-1

```yaml
outputs:
  decision:
    description: 'pass or fail from PolicyResult'

  analysis_health:
    description: 'clean or degraded'

  policy_exit:
    description: 'Exit code returned by anchormap check'

  scan_path:
    description: 'Path to generated scan JSON'

  check_path:
    description: 'Path to generated check JSON'

  diff_path:
    description: 'Path to generated diff JSON, if produced'

  report_path:
    description: 'Path to generated Markdown report'
```

## Artefacts produits

Toujours produire :

```text
anchormap.scan.json
anchormap.check.json
anchormap.report.md
```

Produire si possible :

```text
anchormap.diff.json
```

Produire plus tard côté Action, dans GHA-5 ou dans une étape dédiée après stratégie metadata :

```text
anchormap.junit.xml
anchormap.sarif.json
anchormap.bundle.json
```

Le README et le contrat indiquent déjà les commandes de génération : `scan --json`, `check --json`, `diff --json`, `report --format markdown`, `report --format junit`, `report --format sarif` et `bundle --json`. `bundle` exige des artefacts `scan`, `check`, `diff` et un fichier `--metadata` explicite ; il n’est donc pas un artefact GHA-1 implicite.

## Bundle strategy

`bundle` is not generated by GHA-1. The CLI command exists, but it requires explicit `--scan`, `--check`, `--diff`, and `--metadata` inputs. Because GHA-1 does not require a baseline diff and does not define an Action-level metadata input boundary, generating a bundle in GHA-1 would be premature.

A future Action bundle capability may add:

```yaml
with:
  generate-bundle: true
  metadata: anchormap.metadata.json
```

When enabled, the action must require both:

- `base-scan`, so that `anchormap.diff.json` exists;
- `metadata`, so that `anchormap.bundle.json` can be generated without implicit CI metadata inference.

The valid command is:

```sh
anchormap bundle \
  --scan anchormap.scan.json \
  --check anchormap.check.json \
  --diff anchormap.diff.json \
  --metadata anchormap.metadata.json \
  --json > anchormap.bundle.json
```

---

# Phase 2 — Workflow GitHub minimal

## Fichier utilisateur cible

À documenter comme copier-coller :

```yaml
name: AnchorMap

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

jobs:
  anchormap:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v6

      - uses: fstepho/anchormap-action@v0-preview.4
        with:
          anchormap-version: "1.2.2"
          policy: anchormap.policy.yaml
          upload-artifacts: true
```

Les labels `GHA-*` décrivent le plan. Pour la preview auditée, l'exemple
utilise `fstepho/anchormap-action@v0-preview.4` avec `anchormap@1.2.2`. Une
release stable ou Marketplace reste une décision séparée.

Ce workflow doit être suffisant pour obtenir :

```text
- un check CI pass/fail ;
- un rapport Markdown dans les artifacts ;
- un résumé job ;
- un scan JSON ;
- un check JSON.
```

## Variante PR avec base scan

Le `diff` ne doit pas deviner Git. Le CLI actuel compare deux scans explicites. Donc GHA-1 peut proposer deux modes.

### Mode simple

Pas de base scan :

```text
scan + check + report
```

### Mode avancé

L’utilisateur fournit un scan baseline, par exemple via artifact téléchargé ou fichier committé :

```yaml
- uses: fstepho/anchormap-action@v0-preview.4
  with:
    anchormap-version: "1.2.2"
    policy: anchormap.policy.yaml
    base-scan: .anchormap/baseline.scan.json
```

Puis l’action produit :

```text
scan + check + diff + report
```

À ce stade, ne pas essayer de récupérer automatiquement l’artifact du dernier run `main`. C’est plus complexe et moins déterministe.

---

# Phase 3 — PR report

## Priorité

Le rapport PR est le cœur du plan. Pas le dashboard.

Le rapport doit répondre vite à :

```text
Cette PR a-t-elle cassé la traçabilité ?
Qu’est-ce qui est nouveau ?
Qu’est-ce qui est devenu pire ?
Que faut-il faire ?
```

## Format contractuel

```md
# AnchorMap traceability report

## Summary

- Analysis health: clean
- Observed anchors: 42
- Usable mappings: 38
- Covered product files: 102/120 (85%)
- Findings: 2

## Policy violations

Decision: FAIL
- {"kind":"finding_kind_present","finding_kind":"unmapped_anchor","count":3}
- {"kind":"finding_kind_present","finding_kind":"stale_mapping_anchor","count":1}

## Change impact

- Comparability: same_scope
- Analysis health: clean -> degraded
- Anchors added: 2
- Anchors removed: 0
- Anchor mapping states changed: 0
- Mappings added: 0
- Mappings removed: 0
- Mapping states changed: 0
- Files added: 1
- Files removed: 0
- Files became covered: 0
- Files lost coverage: 4
- Findings added: 4
- Findings removed: 0

## Findings

- {"kind":"unmapped_anchor","anchor_id":"QA-001"}
- {"kind":"stale_mapping_anchor","anchor_id":"QA-002"}

## Suggested actions

- Add a mapping for "QA-001".
- Inspect lost coverage for "src/example.ts".
```

GHA-2 doit utiliser le format produit par `anchormap report --format markdown`. Le format canonique vit dans `docs/contract.md` §13.13 et les goldens associés. Toute autre présentation est une évolution de contrat/evals ou un wrapper explicitement non contractuel, pas le rapport Markdown AnchorMap canonique.

## Où afficher le rapport

GHA-2 initial display :

```text
- job summary ;
- artifact `anchormap.report.md`.
```

GHA-4 extension :

```text
- commentaire PR optionnel.
```

Je ne mettrais pas le commentaire PR dans GHA-1/GHA-2. Les commentaires PR demandent des permissions supplémentaires, peuvent spammer, et créent une surface de maintenance. Le job summary suffit pour valider l’usage.

## GHA-4 commentaire PR

Ajouter un input :

```yaml
comment-pr:
  required: false
  default: 'false'
```

Quand activé :

```yaml
permissions:
  contents: read
  pull-requests: write
```

Règle produit :

```text
Par défaut, pas de commentaire PR.
Le rapport est disponible en job summary et artifact.
Le commentaire PR est opt-in.
```

---

# Phase 4 — Repo de démo autonome

Le README mentionne déjà une démo publique `fstepho/anchormap-h3-demo` appliquant AnchorMap à `h3`, avec scaffold, anchors promues, mappings explicites, analyse clean et scan brief.  Ce repo est maintenant aussi un **repo de démo PR workflow**, pas seulement un repo de démonstration CLI.

## But du repo démo

Permettre à quelqu’un de comprendre AnchorMap sans te parler.

Le repo doit contenir :

```text
- anchormap.yaml ;
- anchormap.policy.yaml ;
- .github/workflows/anchormap.yml ;
- baseline scan ;
- exemples de PRs ;
- captures ou markdowns de rapports ;
- guide "break traceability intentionally".
```

## PRs de démonstration

Les 4 PRs scénario existent et restent ouvertes en draft sur `main`.

### PR 1 — Clean

```text
Titre : demo: clean traceability check
Résultat : pass
```

Montre le cas nominal.

### PR 2 — New unmapped anchor

```text
Titre : demo: new active anchor without mapping
Résultat : fail
```

Montre la valeur directe :

```text
Une nouvelle exigence a été ajoutée mais pas reliée au code.
```

### PR 3 — Stale mapping

```text
Titre : demo: stale mapping after file move
Résultat : fail
```

Montre :

```text
Un mapping humain est devenu obsolète.
```

### PR 4 — Degraded analysis

```text
Titre : demo: degraded analysis from unresolved edge
Résultat : fail ou warning selon policy
```

Montre :

```text
L’analyse n’est plus fiable à 100%.
```

## Document clé

Créé :

```text
docs/github-action-demo.md
```

Contenu :

```text
- ce que la GitHub Action vérifie ;
- ce que le rapport veut dire ;
- ce que AnchorMap ne prouve pas ;
- comment corriger chaque type de finding ;
- comment adapter la policy.
```

---

# Phase 5 — Design partners self-serve

## Objectif

Obtenir des utilisateurs réels sans organiser de calls, sans onboarding manuel, sans intervention directe.

Le programme doit être autonome.

## Positionnement public

Nom recommandé :

```text
AnchorMap Design Partner Preview
```

Promesse :

```text
Use AnchorMap in your TypeScript PR workflow.
Get docs-to-code drift reports without uploading source code.
```

## Parcours design partner

L’utilisateur suit ce parcours :

```text
1. lit une page "Design Partner Preview" ;
2. installe l’action ;
3. lance une première PR ;
4. remplit un formulaire court ou ouvre une issue template ;
5. partage son report anonymisé ou son feedback ;
6. reçoit des recommandations automatiques via docs, pas via call.
```

## Pas de call

Écrire explicitement :

```text
This preview is self-serve.
No onboarding call is required.
No source-code access is requested.
```

## Page créée

Dans le repo AnchorMap :

```text
docs/design-partner-preview.md
```

Structure :

```md
# AnchorMap Design Partner Preview

## Who this is for

- TypeScript repos
- specs in Markdown/YAML
- GitHub Actions users
- teams that want PR-level traceability checks

## What you get

- local scan
- policy check
- PR report
- JSON artifacts
- no source upload

## What we ask

- run it on at least one active repo
- inspect at least three PR reports
- open one feedback issue using the template

## Setup

1. Install AnchorMap locally
2. Add `anchormap.yaml`
3. Add `anchormap.policy.yaml`
4. Add GitHub workflow
5. Open a PR

## Feedback

Use the issue template:
- onboarding friction
- false positives
- confusing report section
- missing policy control
- desired SaaS capability
```

---

# Phase 6 — Feedback autonome

## Créer des issue templates

Dans le repo principal :

```text
.github/ISSUE_TEMPLATE/design-partner-feedback.yml
.github/ISSUE_TEMPLATE/action-installation-problem.yml
.github/ISSUE_TEMPLATE/report-confusing.yml
.github/ISSUE_TEMPLATE/policy-request.yml
```

## Template 1 — Design partner feedback

Champs :

```yaml
- repo shape:
    - product_root
    - spec_roots
    - TypeScript only?
    - framework

- setup time:
    - <10 min
    - 10–30 min
    - >30 min

- first useful signal:
    - yes/no

- report usefulness:
    - 1–5

- noise level:
    - 1–5

- policy used:
    - paste policy

- artifacts:
    - optional sanitized report
```

## Template 2 — Report confusing

Champs :

```text
- report section
- command used
- expected interpretation
- actual interpretation
- sanitized snippet
```

## Template 3 — Policy request

Champs :

```text
- finding kind
- desired behavior
- should it fail CI?
- should it be warning only?
```

## Template 4 — Installation problem

Champs :

```text
- Node version
- OS
- workflow YAML
- command output
- exit code
- artifact paths
```

## Labels

Créer les labels :

```text
preview
design-partner
github-action
pr-report
policy
onboarding
false-positive
docs
blocked
saas-signal
```

---

# Phase 7 — Documentation self-serve

## Docs minimales à ajouter

```text
docs/github-action.md
docs/pr-report.md
docs/design-partner-preview.md
docs/policy-examples.md
docs/troubleshooting-github-action.md
```

## `docs/github-action.md`

Doit contenir :

```text
- installation minimale ;
- inputs ;
- outputs ;
- permissions ;
- artifacts produits ;
- exemples push et pull_request ;
- mode simple sans diff ;
- mode avec baseline scan ;
- opt-in PR comments ;
- limites.
```

## `docs/pr-report.md`

Doit expliquer :

```text
- Summary ;
- Policy violations ;
- Change impact ;
- Findings ;
- Suggested actions ;
- ce que le rapport ne prouve pas.
```

## `docs/policy-examples.md`

Inclure 3 policies.

### Policy permissive

```yaml
version: 1
fail_on:
  analysis_health: degraded
thresholds:
  max_untraced_product_files: 9999
```

### Policy standard

```yaml
version: 1
fail_on:
  analysis_health: degraded
  finding_kinds:
    - stale_mapping_anchor
    - broken_seed_path
    - unmapped_anchor
thresholds:
  min_covered_product_file_percent: 50
```

### Policy stricte

```yaml
version: 1
fail_on:
  analysis_health: degraded
  finding_kinds:
    - stale_mapping_anchor
    - broken_seed_path
    - unmapped_anchor
    - untraced_product_file
thresholds:
  min_covered_product_file_percent: 80
  max_untraced_product_files: 0
```

## `docs/troubleshooting-github-action.md`

Cas à couvrir :

```text
- anchormap.yaml introuvable ;
- policy introuvable ;
- scan produit findings mais check passe ;
- check sort 5 ;
- action échoue sur Node ;
- aucun diff produit ;
- fork PR sans commentaire ;
- artifacts absents ;
- report vide ou incomplet.
```

---

# Phase 8 — Baseline scan strategy

Le `diff` AnchorMap exige deux scans explicites.  Il faut donc une stratégie simple pour les utilisateurs.

## Recommandation GHA-3

Ne pas faire de diff automatique par défaut.

```text
Par défaut :
scan + check + report
```

Puis proposer un mode baseline optionnel :

```text
.anchormap/baseline.scan.json
```

L’utilisateur peut le générer sur `main` :

```sh
anchormap scan --json > .anchormap/baseline.scan.json
```

Puis le committer.

Avantage :

```text
- simple ;
- reproductible ;
- pas besoin d’API GitHub ;
- pas besoin de récupérer des artifacts ;
- pas de logique Git cachée.
```

Inconvénient :

```text
- baseline à maintenir.
```

C’est acceptable pour GHA-3.

## Extension future possible

Ajouter une action séparée :

```text
anchormap-baseline-action
```

ou un mode :

```yaml
baseline-source: artifact
```

Mais seulement après validation de GHA-1 à GHA-3.

---

# Phase 9 — Sécurité et permissions

## Règle principale

Par défaut :

```yaml
permissions:
  contents: read
```

Pas de write token.

Pas d’upload externe.

Pas de lecture des secrets.

Pas de commentaire PR par défaut.

## Commentaire PR

Uniquement si :

```yaml
comment-pr: true
```

Et dans la doc :

```yaml
permissions:
  contents: read
  pull-requests: write
```

## Fork PRs

Mode recommandé :

```text
Pour les forks, produire uniquement job summary + artifacts.
Ne pas tenter d’écrire un commentaire PR par défaut.
```

## Pas d’`pull_request_target` dans la doc initiale

Ne pas recommander `pull_request_target` dans la doc initiale.

Trop de risques de mauvais usage.

---

# Phase 10 — Mesure de signal sans SaaS

Comme il n’y a pas de SaaS, les métriques doivent venir de signaux publics ou volontaires.

## Signaux à suivre

```text
- stars repo principal ;
- stars repo action ;
- issues design-partner ;
- nombre de reports anonymisés partagés ;
- demandes de policy ;
- demandes de PR comment ;
- demandes d’historique ;
- demandes de dashboard ;
- forks du repo démo ;
- installations déclarées via issue template.
```

## Questions à poser dans le feedback

```text
1. Le premier report était-il compréhensible ?
2. Le signal aurait-il changé une décision de merge ?
3. La policy était-elle facile à régler ?
4. Le rapport était-il trop bruyant ?
5. Le mode no-source-upload est-il important ?
6. Voulez-vous un historique multi-PR ?
7. Voulez-vous un dashboard multi-repo ?
8. Voulez-vous un GitHub App plutôt qu’une Action ?
9. Payeriez-vous pour l’historique, pas pour le scan ?
```

La question importante est la dernière. Si les utilisateurs veulent payer, ce sera probablement pour :

```text
- historique ;
- collaboration ;
- multi-repo ;
- policy management ;
- audit exports ;
- GitHub App.
```

Pas pour le scan lui-même.

---

# Phase 11 — Critères de décision SaaS

Après 4 à 6 semaines de preview self-serve, décider.

## Continuer vers SaaS-lite si

```text
- au moins 5 repos externes installent l’action ;
- au moins 3 équipes ouvrent du feedback utile ;
- au moins 2 utilisateurs demandent explicitement l’historique ;
- le PR report est jugé utile ;
- les findings ne sont pas perçus comme trop bruyants ;
- le mode no-source-upload est mentionné comme avantage.
```

## Ne pas faire SaaS encore si

```text
- l’action est difficile à installer ;
- les utilisateurs ne comprennent pas les reports ;
- les policies sont trop difficiles ;
- le diff sans baseline est bloquant ;
- les utilisateurs veulent surtout plus de CLI ;
- personne ne demande d’historique.
```

## Dans ce cas, améliorer d’abord

```text
- documentation ;
- policy examples ;
- report wording ;
- baseline strategy ;
- action ergonomics.
```

---

# Phase 12 — Roadmap concrète

## GHA-1 — Minimal action

Livrables :

```text
- repo anchormap-action ;
- action.yml ;
- script shell interne ;
- README ;
- workflow exemple ;
- installation depuis npm ;
- scan/check/report ;
- workflow artifacts ;
- job summary ;
- diff optionnel si base-scan explicite ;
- pas de bundle ;
- pas de commentaire PR par défaut ;
- pas de SaaS ;
- pas de GitHub App.
```

Acceptation :

```text
Un workflow GitHub Actions produit scan, check, report Markdown, job summary et artifacts sans intervention manuelle.
```

## GHA-2 — PR report and job summary

Livrables :

```text
- structure du rapport PR ;
- rendu job summary ;
- artifact anchormap.report.md ;
- absence de commentaire PR par défaut ;
- documentation de ce que le rapport ne prouve pas.
```

Acceptation :

```text
Un utilisateur peut comprendre pass/fail et les actions mécaniques recommandées depuis le job summary et l'artifact Markdown.
```

## GHA-3 — Baseline scan strategy

Livrables :

```text
- mode simple scan/check/report ;
- mode base-scan explicite ;
- documentation de maintenance de .anchormap/baseline.scan.json ;
- refus d'une récupération automatique du dernier artifact main dans GHA-3.
```

Acceptation :

```text
Le diff PR est disponible seulement quand l'utilisateur fournit explicitement un scan baseline.
```

## GHA-4 — PR comment opt-in

Livrables :

```text
- input comment-pr ;
- permissions documentées ;
- commentaire stable ;
- anti-spam : update existing comment, pas nouveau commentaire à chaque run.
```

Acceptation :

```text
Un repo trusted peut afficher AnchorMap directement dans la conversation PR.
```

## GHA-5 — SARIF/JUnit and artifact upload integration

Livrables :

```text
- génération SARIF via `anchormap report --format sarif` ;
- génération JUnit via `anchormap report --format junit` ;
- upload-artifact documenté ;
- documentation CI ;
- restrictions fork PR et permissions.
```

Acceptation :

```text
Les findings AnchorMap peuvent apparaître dans les surfaces CI natives sans upload implicite, sans lecture Git/CI comme vérité produit, et sans réouvrir les formats CLI déjà fixés par `ADR-0026`.
```

## PREVIEW-1 — Repo démo PR workflow

Livrables :

```text
- workflow AnchorMap ;
- policy ;
- baseline optionnelle ;
- 4 PRs de démonstration ;
- reports attachés ;
- README démo.
```

Acceptation :

```text
Un utilisateur peut comprendre pass/fail en lisant uniquement la PR.
```

## PREVIEW-2 — Docs self-serve and feedback templates

Livrables :

```text
docs/github-action.md
docs/pr-report.md
docs/policy-examples.md
docs/troubleshooting-github-action.md
docs/design-partner-preview.md
issue templates
labels
feedback checklist
sanitized report instructions
```

Acceptation :

```text
Un utilisateur peut installer l’action et partager un feedback structuré sans te contacter.
```

## PREVIEW-3 — Preview review and SaaS-lite decision

Livrables :

```text
- synthèse des issues design-partner ;
- décision go/no-go SaaS-lite ;
- liste des objections récurrentes ;
- backlog priorisé.
```

Acceptation :

```text
Décision claire : SaaS-lite, GitHub App, ou amélioration CLI/Action.
```

---

# Structure recommandée du repo `anchormap-action`

```text
anchormap-action/
├── action.yml
├── README.md
├── LICENSE
├── scripts/
│   └── run.sh
├── examples/
│   ├── basic.yml
│   ├── with-baseline.yml
│   └── with-pr-comment.yml
├── docs/
│   ├── inputs.md
│   ├── outputs.md
│   ├── permissions.md
│   └── troubleshooting.md
└── test/
    └── smoke/
```

## `action.yml` conceptuel

```yaml
name: AnchorMap
description: Run AnchorMap traceability audit and produce PR-ready artifacts.

inputs:
  anchormap-version:
    required: true
  node-version:
    required: false
    default: '22'
  policy:
    required: false
    default: anchormap.policy.yaml
  base-scan:
    required: false
  upload-artifacts:
    required: false
    default: 'true'
  fail-on-policy:
    required: false
    default: 'true'

outputs:
  decision:
    description: 'Policy decision: pass or fail.'
    value: ${{ steps.anchormap.outputs.decision }}
  analysis_health:
    description: 'Analysis health from the check result.'
    value: ${{ steps.anchormap.outputs.analysis_health }}
  policy_exit:
    description: 'Exit code returned by anchormap check.'
    value: ${{ steps.anchormap.outputs.policy_exit }}
  scan_path:
    description: 'Path to generated scan JSON.'
    value: ${{ steps.anchormap.outputs.scan_path }}
  check_path:
    description: 'Path to generated check JSON.'
    value: ${{ steps.anchormap.outputs.check_path }}
  diff_path:
    description: 'Path to generated diff JSON, when produced.'
    value: ${{ steps.anchormap.outputs.diff_path }}
  report_path:
    description: 'Path to generated Markdown report.'
    value: ${{ steps.anchormap.outputs.report_path }}

runs:
  using: composite
  steps:
    - name: Set up Node
      uses: actions/setup-node@v4
      with:
        node-version: ${{ inputs.node-version }}

    - name: Run AnchorMap
      id: anchormap
      shell: bash
      run: ${{ github.action_path }}/scripts/run.sh
      env:
        ANCHORMAP_VERSION: ${{ inputs.anchormap-version }}
        ANCHORMAP_POLICY: ${{ inputs.policy }}
        ANCHORMAP_BASE_SCAN: ${{ inputs.base-scan }}

    - name: Upload AnchorMap artifacts
      if: ${{ always() && inputs.upload-artifacts == 'true' }}
      uses: actions/upload-artifact@v4
      with:
        name: anchormap-artifacts
        if-no-files-found: ignore
        path: .anchormap/action-output/

    - name: Fail on AnchorMap policy violation
      if: ${{ inputs.fail-on-policy == 'true' && steps.anchormap.outputs.policy_exit == '5' }}
      shell: bash
      run: exit 5
```

---

# Script d’orchestration conceptuel

```sh
#!/usr/bin/env sh
set -eu

npm install -g "anchormap@${ANCHORMAP_VERSION}"

output_dir=".anchormap/action-output"
rm -rf "$output_dir"
mkdir -p "$output_dir"

scan_path="$output_dir/anchormap.scan.json"
check_path="$output_dir/anchormap.check.json"
diff_path="$output_dir/anchormap.diff.json"
report_path="$output_dir/anchormap.report.md"
generated_diff="false"

anchormap scan --json > "$scan_path"

set +e
anchormap check \
  --scan "$scan_path" \
  --policy "${ANCHORMAP_POLICY}" \
  --json > "$check_path"
check_exit="$?"
set -e

case "$check_exit" in
  0|5)
    ;;
  *)
    echo "anchormap check failed with technical exit code ${check_exit}; no PolicyResult-compatible report will be generated." >&2
    exit "$check_exit"
    ;;
esac

if [ -n "${ANCHORMAP_BASE_SCAN:-}" ]; then
  anchormap diff \
    --base "${ANCHORMAP_BASE_SCAN}" \
    --head "$scan_path" \
    --json > "$diff_path"
  generated_diff="true"

  anchormap report \
    --scan "$scan_path" \
    --check "$check_path" \
    --diff "$diff_path" \
    --format markdown > "$report_path"
else
  anchormap report \
    --scan "$scan_path" \
    --check "$check_path" \
    --format markdown > "$report_path"
fi

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  cat "$report_path" >> "$GITHUB_STEP_SUMMARY"
fi

decision="$(node -e 'const fs=require("node:fs"); const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log(j.decision ?? "")' "$check_path")"
analysis_health="$(node -e 'const fs=require("node:fs"); const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log(j.analysis_health ?? "")' "$check_path")"

{
  echo "decision=${decision}"
  echo "analysis_health=${analysis_health}"
  echo "policy_exit=${check_exit}"
  echo "scan_path=${scan_path}"
  echo "check_path=${check_path}"
  echo "report_path=${report_path}"
  if [ "$generated_diff" = "true" ]; then
    echo "diff_path=${diff_path}"
  fi
} >> "$GITHUB_OUTPUT"

exit 0
```

---

# Design partner program autonome

## Page publique

Titre :

```text
AnchorMap Design Partner Preview
```

Message :

```text
AnchorMap flags docs-to-code drift in TypeScript PRs before merge.
The preview is self-serve, local-first, and does not require uploading source code.
```

## Conditions d’entrée

```text
- repo TypeScript ;
- GitHub Actions ;
- specs Markdown/YAML ou volonté d’en créer ;
- acceptation de partager feedback structuré ;
- pas besoin de partager le code source.
```

## Ce que le design partner fait

```text
1. Installe la GitHub Action.
2. Lance au moins 3 PRs.
3. Partage un feedback structuré.
4. Indique si un SaaS d’historique aurait de la valeur.
```

## Ce que tu ne fais pas

```text
- pas de call ;
- pas d’audit manuel ;
- pas d’accès au repo privé ;
- pas de correction personnalisée ;
- pas de promesse de support immédiat.
```

## Feedback minimum attendu

```text
- temps d’installation ;
- première erreur rencontrée ;
- report utile ou non ;
- finding le plus confus ;
- policy trop stricte ou trop permissive ;
- intérêt pour historique/dashboard ;
- importance du no-source-upload.
```

---

# Ce qu’il faut mesurer

## Signal produit fort

```text
Le rapport PR est consulté et influence la review.
```

## Signal SaaS fort

```text
Les utilisateurs demandent l’historique et la comparaison multi-PR.
```

## Signal GitHub App fort

```text
Les utilisateurs veulent éviter de gérer artifacts/baselines et veulent un commentaire PR automatique.
```

## Signal enterprise fort

```text
Les utilisateurs demandent self-hosting, SSO, retention, audit exports.
```

## Signal négatif

```text
Les utilisateurs demandent surtout du mapping automatique par IA.
```

Cela indiquerait que le marché attend autre chose que le positionnement déterministe actuel.

---

# Livrable final attendu

À la fin de ce cycle, tu dois avoir :

```text
- une action GitHub installable ;
- un workflow exemple ;
- un repo démo avec PRs parlantes ;
- un rapport PR lisible ;
- des issue templates ;
- une page design partner ;
- des feedbacks structurés ;
- une décision documentée sur SaaS-lite.
```

La décision attendue n’est pas “faire SaaS ou non” en général. Elle est plus précise :

```text
Est-ce que les équipes veulent payer pour conserver, comparer et partager les artefacts AnchorMap dans le temps ?
```

Si oui, le prochain plan sera :

```text
SaaS-lite d’ingestion de bundles + historique PR/repo.
```

Si non, il faudra rester sur :

```text
CLI + GitHub Action + reports + éventuellement paid support.
```
