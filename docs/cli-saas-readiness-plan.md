# AnchorMap CLI — SaaS readiness plan

**Statut**: proposition exploratoire, non normative  
**Portée**: ce document propose une trajectoire CLI post-M17 pour rendre les
artefacts AnchorMap exploitables par CI, reporting PR et futur SaaS.  
**Prévalence**: ce document ne modifie pas le comportement runtime, ne crée
aucune tâche active dans `docs/tasks.md`, ne remplace pas `docs/contract.md`,
`docs/evals.md`, `docs/design.md`, `docs/brief.md` ni les ADR acceptées.

Les labels `CLI-SaaS 1` à `CLI-SaaS 9` ci-dessous sont des labels de plan
proposés. Ils ne sont pas des milestones `docs/tasks.md` et ne deviennent
exécutables qu'après modification explicite des documents d'autorité
applicables, avec tâches traçables, contrat, evals et ADR si nécessaire.

Voici le plan CLI proposé, en partant de l’existant et en gardant l’objectif
SaaS en arrière-plan.

## Prérequis d’autorité

Les labels `CLI-SaaS N` ne deviennent exécutables qu’après adoption des
amendements et ADR listés ci-dessous. Tant qu’ils ne sont pas adoptés, aucune
ligne du backlog n’est imputable à `docs/tasks.md` et aucune gate de
`docs/evals.md` ne peut être ouverte pour ces milestones.

### Amendements `docs/brief.md` requis

**A. §6.2 — surface CI/PR via artefacts CLI**

`docs/brief.md` §6.2 liste actuellement OUT :

- `CI/CD` ;
- `API séparée de navigation ou de reporting`.

`check`, `report` (markdown/junit/sarif) et `bundle` constituent une surface
CI/PR. L’amendement doit :

- autoriser une surface CI/PR livrée **exclusivement** comme artefacts CLI
  locaux, sans API serveur, sans upload, sans lecture Git ni variables CI
  implicites ;
- réaffirmer que restent OUT : LLM, recommandation de suppression, décision
  automatique, preuve de conformité fonctionnelle, interprétation métier ;
- préciser que `report` est une sérialisation stable d’artefacts machine
  existants, pas une nouvelle source d’information ;
- préciser que la couche SaaS future est une couche d’exploitation des mêmes
  artefacts, pas une promesse produit nouvelle.

**B. §13 — fichiers persistants lus par AnchorMap**

`docs/brief.md` §13 gèle : *pas de persistance autre que `anchormap.yaml`*.
Cette règle vise l’état mutable possédé par AnchorMap. L’amendement doit
distinguer :

- `anchormap.yaml` : seul fichier mutable possédé par AnchorMap (inchangé) ;
- `anchormap.policy.yaml` : nouveau fichier **lu seulement**, fourni par
  l’utilisateur, jamais écrit par AnchorMap, jamais migré implicitement ;
- les artefacts produits sur stdout (`scan.json`, `check.json`, `diff.json`,
  `explain.json`, `bundle.json`) restent transitoires et hors `anchormap.yaml`.

CLI-SaaS 8 étend `anchormap.yaml` lui-même (champs `owner`, `rationale`,
`confidence`, `reviewed_at`, `tags`) et exige donc un amendement plus profond
de §13, traité dans son propre milestone et sa propre ADR.

### ADR à créer

Chaque milestone du plan suppose une ADR acceptée avant ouverture de ses
tâches dans `docs/tasks.md`. Les noms ci-dessous sont des propositions de
portée, les numéros ADR seront attribués à l’acceptation.

| Milestone  | ADR proposée                                                  | Portée principale                                                                                            |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| CLI-SaaS 1 | CLI artifact surface and live/artifact mode duality           | Cadre contractuel des nouvelles commandes, double mode live/artifact, validation `schema_version` en entrée  |
| CLI-SaaS 2 | Policy semantics, exit code 5, and `check --json` discipline  | Grammaire fermée de la policy, nouvel exit code `5`, règle stdout/stderr en cas de policy fail               |
| CLI-SaaS 3 | Scan-vs-scan diff comparability rules                         | Champs déclencheurs de `same_scope` vs `scope_changed` (config, `spec_roots`, aliases, `schema_version`)     |
| CLI-SaaS 4 | Explain reconstruction from scan artifact                     | BFS déterministe sur `supported_local_targets`, absence de recalcul depuis le repo                           |
| CLI-SaaS 5 | Report formats and SARIF minimality without source locations  | Choix markdown/junit/sarif, décision de livrer SARIF avant ou après schema v5                                |
| CLI-SaaS 6 | Artifact bundle format and CI metadata boundary               | Format bundle, frontière données AnchorMap / metadata CI fournie, gestion `tool.version` vs déterminisme     |
| CLI-SaaS 7 | Scan schema v5 source locations                               | Bump `schema_version`, support v4/v5 dans diff/explain/report, migration des goldens                         |
| CLI-SaaS 8 | `anchormap.yaml` v2 human metadata and explicit migration     | Nouveaux champs humains optionnels, `migrate-config --to-version 2`, conservation de la mutation policy `map` |
| CLI-SaaS 9 | Symbol observation without symbol-level mapping               | Bloc `symbols` observé, garantie d’absence de bascule vers mapping symbol-level                              |

### Ordre d’adoption recommandé

1. Amendements `brief.md` §6.2 et §13 (un seul PR, justification commune).
2. ADR CLI-SaaS 1 acceptée → ouvre la voie à toutes les suivantes.
3. ADR CLI-SaaS 2 acceptée → premier milestone exécutable.
4. ADR CLI-SaaS 3, 4, 5 en parallèle dès CLI-SaaS 2 en cours.
5. ADR CLI-SaaS 6, 7 après livraison de la version « SaaS-ready 1 ».
6. ADR CLI-SaaS 8, 9 traitées comme milestones autonomes, après validation
   d’usage CI/PR.

Tant que l’étape 1 n’est pas adoptée, les sections CLI-SaaS 1 à CLI-SaaS 9
ci-dessous restent strictement exploratoires.

---

## Point de départ

AnchorMap a déjà un socle solide : le contrat actuel définit une traçabilité structurelle déterministe, limitée au **niveau fichier**, avec séparation stricte entre données **Observed**, **Human** et **Derived**. Il exclut explicitement le call graph, la preuve de dead code, l’inférence d’intention métier et la réconciliation automatique. 

La CLI actuelle expose quatre commandes : `init`, `map`, `scan`, `scaffold`. Le parser confirme que `scan` ne supporte aujourd’hui que le mode humain ou `--json`.  Le modèle JSON actuel est en `schema_version: 4`, avec `config`, `analysis_health`, `observed_anchors`, `stored_mappings`, `files`, `traceability_metrics` et `findings`. 

Le moteur calcule déjà les mappings exploitables, les fichiers atteints, les fichiers couverts, les métriques et les findings à partir de la config, du spec index et du graph produit.  Le graph TypeScript reste volontairement limité aux imports / exports statiques locaux et à certains aliases déterministes. 

Donc le plan ne doit pas commencer par "plus d’analyse". Il doit d’abord rendre les résultats **actionnables**, **comparables**, **exploitables en CI** et **transportables vers un SaaS sans uploader le code source**.

---

# Objectif du plan CLI

Transformer AnchorMap en moteur local complet pour :

```text
scan -> check -> diff -> explain -> report -> bundle
```

Avec ces garanties :

* le CLI reste autonome ;
* aucune dépendance SaaS ;
* aucun accès réseau ;
* aucun accès Git comme source de vérité ;
* aucun cache persistant ;
* artefacts JSON stables ;
* outputs consommables par CI, GitHub Actions, GitLab CI et futur SaaS ;
* pas d’inférence sémantique opaque ;
* pas de claim de conformité fonctionnelle.

Le SaaS futur devra pouvoir consommer les artefacts CLI, pas refaire l’analyse.

---

# Plan d’évolution

## CLI-SaaS 1 — Formaliser l’extension CLI et les nouveaux artefacts

### But

Créer le cadre contractuel pour ajouter des commandes sans affaiblir le modèle actuel.

Aujourd’hui, `scan --json` est le seul output machine stable. Pour préparer CI et SaaS, il faut définir plusieurs nouveaux artefacts machine :

```text
ScanResult        déjà existant, schema_version 4
PolicyResult      nouveau
TraceabilityDiff  nouveau
ExplainResult     nouveau
Report inputs     nouveau
ArtifactBundle    nouveau
```

### Changements à faire

Ajouter dans les docs :

```text
docs/contract.md
docs/evals.md
docs/tasks.md
```

les nouveaux principes :

```text
- scan produit l’état courant ;
- check interprète cet état selon une policy ;
- diff compare deux états ;
- explain rend un état intelligible ;
- report rend un état publiable ;
- bundle prépare un artefact uploadable.
```

### Règles importantes

Les nouvelles commandes doivent pouvoir fonctionner dans deux modes :

```bash
# Mode live : relance l’analyse depuis le repo
anchormap check --policy anchormap.policy.yaml

# Mode artifact : consomme un scan déjà produit
anchormap check --scan scan.json --policy anchormap.policy.yaml
```

Le mode artifact est important pour le futur SaaS : le serveur pourra expliquer, comparer ou reporter sans lire le code source.

### À ne pas faire dans CLI-SaaS 1

Ne pas ajouter d’upload SaaS.

Ne pas lire Git.

Ne pas lire les variables CI automatiquement.

Ne pas introduire d’IA.

---

## CLI-SaaS 2 — Ajouter `anchormap check`

### But

Faire de la sortie AnchorMap un vrai gate CI.

Aujourd’hui, `scan --json` peut contenir des findings tout en sortant avec `0`, ce qui est correct : les findings sont des résultats d’analyse, pas des erreurs CLI. Pour CI, il faut une commande qui transforme ces résultats en décision.

### Commande cible

```bash
anchormap check --policy anchormap.policy.yaml
anchormap check --policy anchormap.policy.yaml --json
anchormap check --scan scan.json --policy anchormap.policy.yaml --json
```

### Exemple de policy

```yaml
version: 1

fail_on:
  analysis_health: degraded
  finding_kinds:
    - stale_mapping_anchor
    - broken_seed_path
    - unmapped_anchor

thresholds:
  min_covered_product_file_percent: 70
  max_untraced_product_files: 20
```

### Sortie JSON cible

```json
{
  "schema_version": 1,
  "decision": "fail",
  "source_scan_schema_version": 4,
  "analysis_health": "clean",
  "violations": [
    {
      "kind": "finding_kind_present",
      "finding_kind": "unmapped_anchor",
      "count": 3
    }
  ],
  "summary": {
    "observed_anchor_count": 42,
    "usable_mapping_count": 37,
    "covered_product_file_count": 128,
    "uncovered_product_file_count": 19
  }
}
```

### Exit codes

Ajouter un code spécifique :

```text
0  policy pass
5  policy fail
1  internal/write error
2  config error
3  repository input error
4  usage error
```

Point important : pour `check --json`, un échec de policy doit pouvoir écrire un JSON valide sur stdout et sortir avec `5`.

En revanche, une erreur technique — config invalide, repo non analysable, argument invalide — doit garder la discipline actuelle : pas de faux résultat machine.

### Valeur SaaS

Le SaaS pourra stocker :

```text
- pass/fail ;
- violations ;
- thresholds ;
- métriques ;
- politique appliquée ;
- scan associé.
```

C’est le premier artefact commercialement utile.

---

## CLI-SaaS 3 — Ajouter `anchormap diff`

### But

Comparer deux scans sans dépendre de Git.

Ne pas commencer par :

```bash
anchormap diff main HEAD
```

Cela introduirait Git comme source implicite. Commencer par :

```bash
anchormap diff --base base.scan.json --head head.scan.json
anchormap diff --base base.scan.json --head head.scan.json --json
```

### Sortie JSON cible

```json
{
  "schema_version": 1,
  "base_scan_schema_version": 4,
  "head_scan_schema_version": 4,
  "comparability": "same_scope",
  "analysis_health_change": {
    "from": "clean",
    "to": "degraded"
  },
  "anchors": {
    "added": ["AUTH.SESSION.EXPIRY"],
    "removed": [],
    "mapping_state_changed": [
      {
        "anchor_id": "PAYMENT.IDEMPOTENCY",
        "from": "usable",
        "to": "absent"
      }
    ]
  },
  "mappings": {
    "added": [],
    "removed": [],
    "state_changed": []
  },
  "files": {
    "became_covered": [],
    "lost_coverage": ["src/auth/session.ts"],
    "covering_anchor_ids_changed": []
  },
  "findings": {
    "added": [
      {
        "kind": "unresolved_static_edge",
        "importer": "src/auth/session.ts",
        "specifier": "./policy"
      }
    ],
    "removed": []
  },
  "metrics_delta": {
    "covered_product_file_count": -1,
    "uncovered_product_file_count": 1
  }
}
```

### Cas à gérer

| Cas                       | Comportement                           |
| ------------------------- | -------------------------------------- |
| même config               | `comparability: same_scope`            |
| `product_root` changé     | `comparability: scope_changed`         |
| schema supporté différent | comparer si possible                   |
| schema inconnu            | erreur d’usage                         |
| scan JSON invalide        | erreur d’usage ou input artifact error |

### Valeur SaaS

C’est l’artefact central pour les PR.

Le SaaS ne doit pas seulement afficher "état actuel". Il doit dire :

```text
Cette PR a ajouté quoi ?
Cette PR a cassé quoi ?
Cette PR a dégradé quoi ?
```

---

## CLI-SaaS 4 — Ajouter `anchormap explain`

### But

Rendre le résultat exploitable humainement, sans demander à l’utilisateur de lire tout le JSON.

### Commandes cibles

```bash
anchormap explain --anchor AUTH.SESSION.EXPIRY
anchormap explain --anchor AUTH.SESSION.EXPIRY --json

anchormap explain --file src/auth/session.ts
anchormap explain --file src/auth/session.ts --json

anchormap explain --anchor AUTH.SESSION.EXPIRY --scan scan.json --json
anchormap explain --file src/auth/session.ts --scan scan.json --json
```

### Principe

`explain` doit pouvoir fonctionner depuis un `scan.json` seul.

Le `scan.json` contient déjà :

* les mappings ;
* les seed files ;
* les reached files ;
* les fichiers ;
* les supported local targets ;
* les covering anchor ids ;
* les findings.

Il est donc possible de reconstruire des chemins explicatifs par BFS déterministe à partir de `files[*].supported_local_targets`.

### Sortie anchor

```json
{
  "schema_version": 1,
  "subject": {
    "kind": "anchor",
    "anchor_id": "AUTH.SESSION.EXPIRY"
  },
  "observed": {
    "present": true,
    "spec_path": "specs/auth.md",
    "mapping_state": "usable"
  },
  "mapping": {
    "present": true,
    "state": "usable",
    "seed_files": ["src/auth/session.ts"],
    "reached_file_count": 7
  },
  "coverage": {
    "reached_files": [
      {
        "path": "src/auth/session.ts",
        "path_from_seed": ["src/auth/session.ts"]
      },
      {
        "path": "src/auth/policy.ts",
        "path_from_seed": [
          "src/auth/session.ts",
          "src/auth/policy.ts"
        ]
      }
    ]
  },
  "findings": []
}
```

### Sortie file

```json
{
  "schema_version": 1,
  "subject": {
    "kind": "file",
    "path": "src/auth/session.ts"
  },
  "file": {
    "present": true,
    "covering_anchor_ids": [
      "AUTH.SESSION.EXPIRY",
      "AUTH.SESSION.REFRESH"
    ],
    "supported_local_targets": [
      "src/auth/policy.ts"
    ]
  },
  "coverage": {
    "covered": true,
    "single_cover": false,
    "multi_cover": true
  }
}
```

### Valeur SaaS

Le SaaS pourra afficher des vues anchor/file sans refaire de calcul côté serveur.

C’est aussi utile pour les PR comments :

```text
AUTH.SESSION.EXPIRY is unmapped.
Observed in specs/auth.md.
No usable mapping exists.
```

---

## CLI-SaaS 5 — Ajouter `anchormap report`

### But

Transformer les artefacts machine en outputs intégrables.

### Commandes cibles

```bash
anchormap report --scan scan.json --format markdown
anchormap report --scan scan.json --check check.json --format markdown
anchormap report --scan head.json --diff pr.diff.json --check check.json --format markdown
```

### Formats à livrer dans l’ordre

#### 1. Markdown

Priorité haute.

Usage :

```bash
anchormap report \
  --scan head.scan.json \
  --diff pr.diff.json \
  --check head.check.json \
  --format markdown > anchormap-pr.md
```

Sortie :

```md
# AnchorMap traceability report

Result: FAIL

## Policy violations

- `unmapped_anchor`: 3 anchors
- coverage below threshold: 68.2% < 70%

## PR impact

- 2 anchors added
- 1 file lost coverage
- analysis health: clean -> degraded

## Suggested actions

- map `AUTH.SESSION.EXPIRY`
- inspect unresolved edge in `src/auth/session.ts`
```

#### 2. JUnit

Priorité moyenne.

Usage CI générique :

```bash
anchormap report --check check.json --format junit > anchormap.junit.xml
```

Chaque violation devient un testcase failed.

#### 3. SARIF

Priorité moyenne / haute si GitHub App.

Usage :

```bash
anchormap report --scan scan.json --format sarif > anchormap.sarif.json
```

Les findings peuvent être rendus comme résultats SARIF.

Sans `line/column`, SARIF peut déjà pointer vers le fichier. Les régions précises viendront plus tard avec le scan schema v5.

#### 4. HTML

À repousser.

Le HTML est moins prioritaire si un SaaS doit exister ensuite.

### Valeur SaaS

`report` permet d’avoir immédiatement :

* commentaires PR ;
* artefacts CI ;
* intégration GitHub code scanning ;
* dashboards simples ;
* valeur utilisateur sans UI SaaS.

---

## CLI-SaaS 6 — Ajouter `anchormap bundle`

### But

Préparer un artefact SaaS sans introduire d’upload.

### Commande cible

```bash
anchormap bundle \
  --scan head.scan.json \
  --check head.check.json \
  --diff pr.diff.json \
  --metadata ci.metadata.json \
  --json > anchormap.bundle.json
```

### Metadata explicite

Ne pas lire Git automatiquement.

Ne pas lire GitHub Actions automatiquement.

Le fichier metadata doit être fourni explicitement :

```json
{
  "provider": "github",
  "repository": "fstepho/anchormap",
  "commit": "abc123",
  "branch": "feature/trace-check",
  "pull_request": 42,
  "run_url": "https://github.com/..."
}
```

### Bundle cible

```json
{
  "schema_version": 1,
  "tool": {
    "name": "anchormap",
    "version": "<version CLI publiée>"
  },
  "metadata": {
    "provider": "github",
    "repository": "fstepho/anchormap",
    "commit": "abc123",
    "branch": "feature/trace-check",
    "pull_request": 42
  },
  "artifacts": {
    "scan": {},
    "check": {},
    "diff": {}
  },
  "hashes": {
    "scan_sha256": "...",
    "check_sha256": "...",
    "diff_sha256": "..."
  }
}
```

### Règle SaaS-ready

Le bundle ne doit pas contenir :

* contenu source ;
* contenu complet des specs ;
* variables d’environnement ;
* secrets ;
* logs CI ;
* état Git implicite.

Il peut contenir :

* chemins de fichiers ;
* anchors ;
* findings ;
* métriques ;
* metadata CI explicitement fournie ;
* hashes d’artefacts.

### Valeur SaaS

Le futur SaaS pourra recevoir un seul artefact :

```text
anchormap.bundle.json
```

Et construire :

* historique ;
* PR summary ;
* policies ;
* dashboards ;
* audit timeline ;
* explain UI.

---

## CLI-SaaS 7 — Enrichir `scan --json` en schema v5

### But

Ajouter les données nécessaires aux rapports précis et au SaaS, sans changer la nature de l’analyse.

Le scan schema v4 actuel expose `spec_path` pour les anchors, mais pas de localisation fine ni de contexte source. 

### Champs à ajouter

```json
"observed_anchors": {
  "AUTH.SESSION.EXPIRY": {
    "spec_path": "specs/auth.md",
    "mapping_state": "usable",
    "anchor_status": "active",
    "source": {
      "kind": "markdown_atx_heading",
      "line": 12,
      "column": 1,
      "heading_level": 2,
      "title": "Session expiry"
    }
  }
}
```

Pour YAML :

```json
"source": {
  "kind": "yaml_root_id",
  "line": 1,
  "column": 1
}
```

### Pourquoi après `check`, `diff`, `explain`, `report`

Parce que `check`, `diff`, `explain` et `report` peuvent déjà être utiles avec schema v4.

Le schema v5 est une amélioration, pas un prérequis.

### Attention

C’est une évolution contractuelle importante :

* bump `schema_version` ;
* update des goldens ;
* update du renderer ;
* update du dogfood ;
* update des fixtures ;
* support possible de v4 et v5 dans `diff`, `explain`, `report`, `bundle`.

---

## CLI-SaaS 8 — Ajouter un `anchormap.yaml` v2 avec métadonnées humaines

### But

Préparer les workflows de revue et de gouvernance.

Aujourd’hui, le mapping persistant est volontairement minimal : une anchor et une liste de `seed_files`. Le contrat actuel impose même que chaque mapping contienne exactement `seed_files`. 

Pour un futur SaaS, il sera utile de stocker des métadonnées humaines :

```yaml
version: 2
product_root: 'src'
spec_roots:
  - 'specs'
mappings:
  'AUTH.SESSION.EXPIRY':
    seed_files:
      - 'src/auth/session.ts'
    owner: 'identity-team'
    rationale: 'Session expiry enforcement starts at session policy.'
    confidence: 'high'
    reviewed_at: '2026-05-14'
```

### Champs recommandés

| Champ         | Type                      | Statut    |
| ------------- | ------------------------- | --------- |
| `owner`       | string                    | optionnel |
| `rationale`   | string                    | optionnel |
| `confidence`  | `low` / `medium` / `high` | optionnel |
| `reviewed_at` | date ISO                  | optionnel |
| `tags`        | string[]                  | optionnel |

### Commandes possibles

```bash
anchormap map \
  --anchor AUTH.SESSION.EXPIRY \
  --seed src/auth/session.ts \
  --owner identity-team \
  --rationale "Session expiry starts at session policy."

anchormap mapping annotate \
  --anchor AUTH.SESSION.EXPIRY \
  --owner identity-team \
  --confidence high
```

### Prudence

Je ne ferais pas CLI-SaaS 8 avant CLI-SaaS 2 à CLI-SaaS 7.

C’est plus risqué, car cela touche :

* config parser ;
* canonical YAML writer ;
* fixtures ;
* mutation policy ;
* backward compatibility ;
* docs ;
* migration.

### Migration

Ajouter une commande explicite :

```bash
anchormap migrate-config --to-version 2
```

Ne pas migrer implicitement.

---

## CLI-SaaS 9 — Ajouter une première base symbolique, sans basculer encore au symbol-level mapping

### But

Préparer des évolutions futures sans fragiliser le produit.

Ne pas passer directement à :

```yaml
seed_symbols:
  - src/auth/session.ts#validateSession
```

Commencer par observer les symboles.

### Commande ou output possible

Option 1 :

```bash
anchormap symbols --json
```

Option 2 : nouveau bloc dans `scan --json` schema v6 :

```json
"symbols": {
  "src/auth/session.ts": [
    {
      "kind": "function",
      "name": "validateSession",
      "exported": true
    },
    {
      "kind": "class",
      "name": "SessionPolicy",
      "exported": true
    }
  ]
}
```

### Pourquoi repousser

Le SaaS n’a pas besoin du symbol-level pour exister.

Le prochain palier commercial est plutôt :

```text
CI policy + PR diff + reports + history
```

Le symbol-level est utile plus tard, mais il augmente beaucoup la complexité :

* symbol resolution ;
* imports nommés ;
* re-exports ;
* default exports ;
* classes ;
* methods ;
* overloads ;
* type-only imports ;
* framework conventions.

---

# Ordre de livraison recommandé

## Version CLI SaaS-ready 1

Livrer :

```text
CLI-SaaS 1 — contract extension
CLI-SaaS 2 — check
CLI-SaaS 3 — diff
CLI-SaaS 4 — explain
CLI-SaaS 5 — report markdown
```

À ce stade, AnchorMap devient déjà utile en PR.

Pipeline cible :

```bash
anchormap scan --json > head.scan.json

anchormap check \
  --scan head.scan.json \
  --policy anchormap.policy.yaml \
  --json > head.check.json

anchormap diff \
  --base base.scan.json \
  --head head.scan.json \
  --json > pr.diff.json

anchormap report \
  --scan head.scan.json \
  --check head.check.json \
  --diff pr.diff.json \
  --format markdown > anchormap-pr.md
```

## Version CLI SaaS-ready 2

Livrer :

```text
CLI-SaaS 6 — bundle
CLI-SaaS 7 — scan schema v5 avec source locations
CLI-SaaS 5 extension — JUnit + SARIF
```

Pipeline cible :

```bash
anchormap bundle \
  --scan head.scan.json \
  --check head.check.json \
  --diff pr.diff.json \
  --metadata ci.metadata.json \
  --json > anchormap.bundle.json
```

À ce stade, le futur SaaS peut consommer un artefact stable.

## Version CLI governance

Livrer :

```text
CLI-SaaS 8 — anchormap.yaml v2 avec metadata humaine
CLI-SaaS 9 — symbol observation
```

Ce sont des évolutions plus structurantes, à faire après validation de l’usage CI/PR.

---

# Backlog détaillé par priorité

## P0 — Nécessaire avant SaaS

| Item                                    | Pourquoi                                     |
| --------------------------------------- | -------------------------------------------- |
| `check`                                 | transforme le scan en décision CI            |
| policy YAML                             | rend la décision configurable                |
| `diff` scan-vs-scan                     | rend les PR actionnables                     |
| `explain` anchor/file                   | rend les résultats compréhensibles           |
| Markdown report                         | permet PR comments sans SaaS                 |
| artifact mode pour toutes ces commandes | permet au SaaS de consommer sans code source |

## P1 — Fortement recommandé avant SaaS

| Item                                         | Pourquoi                         |
| -------------------------------------------- | -------------------------------- |
| `bundle`                                     | artefact unique uploadable       |
| JUnit report                                 | intégration CI générique         |
| SARIF report                                 | intégration GitHub code scanning |
| scan schema v5 avec line/column              | meilleurs diagnostics et UI      |
| support v4/v5 dans `diff`/`explain`/`report` | compatibilité artefacts          |

## P2 — Utile après premier SaaS

| Item                                              | Pourquoi                                    |
| ------------------------------------------------- | ------------------------------------------- |
| config v2 avec `owner`, `rationale`, `confidence` | workflows humains                           |
| `migrate-config`                                  | migration contrôlée                         |
| mapping annotation                                | future UI de revue                          |
| symbol observation                                | terrain pour symbol-level                   |
| framework profiles                                | plus tard, pas avant validation commerciale |

---

# Décisions de conception à prendre tôt

## 1. Nouveau code de sortie pour `check`

Je recommande :

```text
5 = policy failure
```

Cela évite de confondre :

```text
policy fail
```

avec :

```text
internal error
config error
repository error
usage error
```

## 2. `check --json` doit émettre du JSON même en policy fail

C’est inhabituel par rapport à `scan --json`, mais utile.

Règle proposée :

```text
check --json + policy fail:
  stdout = PolicyResult JSON
  stderr = empty
  exit = 5

check --json + technical fail:
  stdout = empty
  stderr = diagnostic
  exit = 1/2/3/4
```

## 3. Ne pas lire Git

Pour préparer le SaaS, il faut des métadonnées commit/branch/PR.

Mais elles doivent être fournies explicitement :

```bash
anchormap bundle --metadata ci.metadata.json
```

Pas détectées implicitement.

## 4. Ne pas ajouter `upload` maintenant

Un `anchormap upload` appartiendra au plan SaaS, pas au plan CLI.

Tant que le SaaS n’est pas défini, le CLI doit produire un bundle local.

## 5. Ne pas modifier `scan --json` trop tôt

Commencer avec les artefacts autour du schema v4.

Bumper vers schema v5 seulement quand les besoins de localisation sont clairs.

---

# Architecture interne proposée

Ajouter des modules purs :

```text
src/domain/policy.ts
src/domain/diff.ts
src/domain/explain.ts
src/domain/artifact-bundle.ts

src/infra/policy-io.ts
src/infra/scan-artifact-io.ts
src/infra/metadata-io.ts

src/render/render-policy-json.ts
src/render/render-diff-json.ts
src/render/render-explain-json.ts
src/render/render-report-markdown.ts
src/render/render-report-junit.ts
src/render/render-report-sarif.ts
```

Principe :

```text
domain = calcul pur
infra = lecture/validation fichier
render = sérialisation stable
cli = orchestration et exit codes
```

Cela reste aligné avec la structure existante : domain, infra, render, cli.

---

# Non-objectifs pour ce plan

À ne pas inclure dans ce cycle CLI :

```text
- SaaS upload
- dashboard
- GitHub App
- lecture automatique de Git
- lecture automatique des variables CI
- IA pour suggérer des mappings
- call graph
- symbol-level mappings
- framework adapters
- monorepo complet
- remplacement ALM
- preuve de conformité fonctionnelle
- deletion safety
```

Ces sujets pourront venir ensuite, mais ils ne sont pas nécessaires pour rendre le CLI SaaS-ready.

---

# État final attendu du CLI

À la fin de ce plan, un utilisateur doit pouvoir faire :

```bash
anchormap scan --json > head.scan.json

anchormap check \
  --scan head.scan.json \
  --policy anchormap.policy.yaml \
  --json > head.check.json

anchormap diff \
  --base base.scan.json \
  --head head.scan.json \
  --json > pr.diff.json

anchormap explain \
  --anchor AUTH.SESSION.EXPIRY \
  --scan head.scan.json \
  --json > explain.anchor.json

anchormap report \
  --scan head.scan.json \
  --check head.check.json \
  --diff pr.diff.json \
  --format markdown > anchormap-pr.md

anchormap bundle \
  --scan head.scan.json \
  --check head.check.json \
  --diff pr.diff.json \
  --metadata ci.metadata.json \
  --json > anchormap.bundle.json
```

Ce résultat prépare directement le SaaS :

```text
Le SaaS n’aura pas besoin de scanner le repo.
Le SaaS n’aura pas besoin de lire le code.
Le SaaS pourra stocker et comparer des artefacts.
Le SaaS pourra afficher explain, history, policy et PR impact.
```

C’est le bon terrain : le CLI reste le moteur de confiance, le SaaS devient une couche d’exploitation.
