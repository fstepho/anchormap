# AnchorMap CLI — contract.md

**Statut**: contrat normatif v7  
**Portée**: ce document définit le comportement observable garanti de la CLI v1.0.  
**Prévalence**: en cas de conflit avec `brief.md`, `design.md` ou `evals.md`, ce document prévaut pour le comportement runtime, le schéma de sortie, les règles de classification, et la sérialisation canonique.

## 1. Résumé

AnchorMap CLI est un outil local de **traçabilité structurelle déterministe** pour dépôts TypeScript mono-package à périmètre étroit.

Sa fonction est limitée à :

- détecter des **anchors formelles** dans des specs supportées ;
- stocker un mapping humain explicite entre ces anchors et des **seed files** ;
- appliquer, au niveau **fichier**, les règles supportées de dépendances statiques locales sur le code produit ;
- calculer, à partir des seuls mappings exploitables, quels fichiers sont structurellement couverts par quelles anchors ;
- exposer les écarts observables et les dégradations connues de l'analyse.

AnchorMap :

- ne décide pas quoi supprimer ;
- ne prouve pas qu'un fichier est inutile ;
- ne modélise pas l'intention produit au-delà de règles explicites ;
- ne réconcilie rien automatiquement.

### 1.1 Profils grammaticaux normatifs v1.0

Le contrat v1.0 fige les profils normatifs suivants :

- `MARKDOWN_PROFILE = CommonMark 0.30`
- `YAML_PROFILE = YAML 1.2.2`
- `TS_PROFILE = typescript@6.0.3 parser API`, avec `ScriptKind.TS`, objectif `module`, sans JSX

Règles :

- tout fichier `.md`, `.yml`, `.yaml` ou `.ts` consommé par AnchorMap est lu comme une suite d'octets et décodé strictement en UTF-8 ;
- un unique BOM UTF-8 initial (`U+FEFF`), s'il est présent, est ignoré avant parsing ;
- toute séquence d'octets non décodable en UTF-8 rend le fichier invalide pour le contrat ;
- un fichier Markdown est interprété selon `MARKDOWN_PROFILE` après ce décodage ;
- tout YAML validé par ce contrat est interprété selon `YAML_PROFILE` après ce décodage ;
- un `product_file` est **syntaxiquement parsable** si et seulement si, après ce décodage, sous `TS_PROFILE`, le parseur produit **zéro** diagnostic syntaxique.

Ces profils et cette règle de décodage sont normatifs pour v1.0.

## 2. Contrat en une phrase

Étant donné un dépôt supporté, un unique `anchormap.yaml` valide, une plateforme supportée, et une version donnée de la CLI, AnchorMap calcule de manière déterministe `supported_local_targets`, `reached_files`, `covering_anchor_ids`, `findings` et `analysis_health` en appliquant aux `seed_files` explicitement déclarés les règles de dépendances statiques locales supportées, puis expose ces résultats dans un JSON stable pour `scan --json`.

## 3. Garanties et hors contrat

### 3.1 Garanties de v1.0

AnchorMap v1.0 garantit :

- la détection déterministe des anchors dans les syntaxes supportées ;
- la lecture stricte d'un unique fichier `anchormap.yaml` valide en YAML ;
- l'application déterministe des règles de dépendances statiques locales supportées au niveau **fichier** ;
- le calcul déterministe de `supported_local_targets`, `reached_files` et `covering_anchor_ids` à partir des mappings exploitables ;
- l'émission de findings typés, dédupliqués et ordonnés de manière canonique ;
- un JSON stable et versionné pour `scan --json` en cas de succès ;
- l'absence de JSON sur `stdout` pour `scan --json` en cas d'échec ;
- la non-mutation de `./anchormap.yaml` sur tout échec de `init` ou `map` ;
- l'absence d'écriture sur disque par `scan`.

### 3.2 Hors contrat

AnchorMap v1.0 ne garantit pas :

- un call graph ;
- la reachability runtime ;
- la preuve de dead code ;
- la sûreté d'une suppression ;
- la vérité sémantique d'un mapping ;
- l'interprétation de prose libre ;
- la réconciliation automatique de renames, splits ou merges ;
- un bootstrap par candidats ;
- une commande `status` ;
- une commande `refresh` ;
- une commande `decide` ;
- une API séparée de navigation ou de reporting.

### 3.3 Sorties terminal humaines hors contrat

Pour `init`, `map`, et `scan` sans `--json`, seules les préconditions, les effets de fichier déclarés et le code de sortie sont contractuels.

Le texte humain éventuellement écrit sur `stdout` ou `stderr` par ces commandes est hors contrat et ne doit pas être parsé.

## 4. Principes non négociables

### 4.1 Déterminisme

À dépôt identique, config identique, plateforme supportée identique, version identique :

- `scan --json` produit le même JSON byte-for-byte ;
- `init` et `map` écrivent le même `anchormap.yaml` byte-for-byte ;
- aucun accès réseau n'intervient ;
- aucune donnée temporelle n'intervient ;
- aucune donnée Git n'intervient ;
- aucun cache persistant n'intervient ;
- aucune variable d'environnement n'intervient comme source de vérité ;
- aucun fallback implicite n'intervient.

### 4.2 Frontières de confiance

Chaque donnée exposée appartient à une seule catégorie :

- **Observed** : directement observée dans le dépôt ;
- **Human** : explicitement écrite ou validée par un développeur dans `anchormap.yaml` ;
- **Derived** : calcul déterministe à partir de `Observed + Human`.

Les findings sont toujours des **diagnostics Derived**.
Ils ne sont pas des faits bruts.

### 4.3 Human at validation, déterministe ensuite

Le CLI ne transforme jamais une observation en mapping trusted.
Un mapping n'entre dans le chemin de confiance que lorsqu'un humain l'écrit explicitement, via la CLI ou par édition manuelle du YAML.

### 4.4 Pas de fallback implicite

Si une résolution est ambiguë, partielle, hors support ou impossible :

- AnchorMap l'indique ;
- AnchorMap n'invente rien ;
- AnchorMap ne remappe rien ;
- AnchorMap ne complète rien silencieusement.

### 4.5 Scope étroit

v1.0 garde :

- un seul langage produit : TypeScript ;
- un seul format de config : `anchormap.yaml` ;
- une seule donnée persistée propre à AnchorMap : `anchormap.yaml` ;
- une seule granularité : le **fichier**.

### 4.6 Santé d'analyse, pas complétude produit

Le scan expose `analysis_health` :

- `clean` : aucune cause connue de dégradation technique n'a été détectée dans le périmètre supporté ;
- `degraded` : au moins une cause connue de dégradation technique a été détectée.

`analysis_health = clean` ne signifie pas :

- que toutes les anchors sont mappées ;
- que toute intention produit est capturée ;
- qu'aucun code non modélisé n'existe ;
- qu'un fichier non couvert est inutile.

### 4.7 Ordre canonique et comparaison

Sauf mention contraire, tous les tris et toutes les comparaisons lexicographiques utilisent l'ordre binaire des chaînes UTF-8, indépendant de la locale.

### 4.8 Aucun état normatif caché

Tout état **Human** ou **Derived** qui borne directement le scan ou gouverne directement la couverture observable est exposé explicitement dans le modèle de sortie, avec un emplacement stable, notamment :

- `config.version`
- `config.product_root`
- `config.spec_roots`
- `config.ignore_roots`
- `observed_anchors[*].mapping_state`
- `stored_mappings[*].state`
- `stored_mappings[*].seed_files`
- `stored_mappings[*].reached_files`
- `files[*].supported_local_targets`
- `files[*].covering_anchor_ids`
- `analysis_health`

Aucun autre état intermédiaire n'a de poids normatif en v1.0.

## 5. Dépôts supportés

### 5.1 Forme supportée

v1.0 supporte :

- un dépôt mono-package ;
- un unique `product_root` explicite ;
- des fichiers produit `.ts` décodables en UTF-8 selon la section 1.1 ;
- des specs `.md`, `.yml`, `.yaml` décodables en UTF-8 selon la section 1.1 ;
- des dépendances locales exprimées uniquement par imports / re-exports statiques **relatifs** avec specifier chaîne littérale ;
- des chemins canoniques sous la racine du dépôt ;
- des fichiers produit syntaxiquement parsables selon `TS_PROFILE`.

### 5.2 Forme hors support

v1.0 ne supporte pas comme contrat fort :

- monorepo ;
- symlinks dans les arbres analysés ;
- collisions de chemins qui ne diffèrent que par la casse ;
- chemins en scope non représentables comme `RepoPath` canonique ;
- `.tsx`, `.js`, `.d.ts` comme fichiers produit ;
- `require()` comme edge supporté ;
- `import()` dynamique comme edge supporté ;
- specifiers calculés ;
- loaders runtime ;
- réflexion ;
- registres runtime ;
- prose libre en `.txt` ;
- aliases locaux via `@/...`, `~/...`, `src/...` ou équivalent.

### 5.3 Imports non relatifs

Tous les specifiers non relatifs sont traités comme **externes pour les règles v1.0**.
Ils ne participent pas au calcul de couverture locale et ne produisent pas de finding.

Conséquence explicite : le dépôt supporté ne doit pas encoder des dépendances locales produit-vers-produit via imports non relatifs.
AnchorMap v1.0 ne prouve pas cette hypothèse.

### 5.4 Candidats hors racine du dépôt

Un candidat de résolution calculé à partir d'un import relatif n'est pris en compte que si son chemin normalisé reste sous la racine du dépôt.

Un candidat qui sortirait de la racine du dépôt est traité comme inexistant pour les règles de résolution v1.0.

## 6. Modèle de vérité

### 6.1 Anchor ID

Une anchor est un identifiant fonctionnel formel détectable sans interprétation sémantique.

Formats supportés :

- `SHORT_ID = ^[A-Z]+-[0-9]{3}$`
- `DOTTED_ID = ^[A-Z][A-Z0-9]*(\.[A-Z][A-Z0-9]*)+$`

Exemples valides :

- `US-001`
- `FR-014`
- `DOC.README.PRESENT`

Toute autre forme est hors support.

#### 6.1.1 Extension v1.1 planifiée : formats documentaires AnchorMap

Cette section planifie une extension v1.1. Elle ne modifie pas le contrat
runtime v1.0 tant que la tâche d'implémentation v1.1 correspondante n'a pas
activé explicitement ces règles.

Quand l'extension est active, les formats v1.0 restent supportés et les formats
additionnels suivants sont aussi des `AnchorId` valides :

- `TASK_ID = ^T(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)([a-z])?$`
- `MILESTONE_ID = ^M(0|[1-9][0-9]*)$`
- `SPIKE_ID = ^S(0|[1-9][0-9]*)$`
- `ADR_ID = ^ADR-[0-9]{4}$`

Exemples additionnels valides :

- `T10.6`
- `T0.0a`
- `M10`
- `S5`
- `ADR-0012`

Exemples explicitement invalides :

- `t10.6`
- `T10`
- `T10.`
- `T10.6A`
- `M10.1`
- `S05`
- `ADR-12`
- `ADR0012`

Les surfaces d'observation restent inchangées : une anchor est détectée
seulement en préfixe de heading ATX Markdown supporté ou dans une valeur scalaire
`id` à la racine d'une spec YAML supportée. Les références dans le prose, les
numéros de section, les filenames et les liens ne produisent jamais d'anchor.

Les règles de doublon, de validation des clés `mappings`, de validation
`map --anchor`, de tri canonique et de sérialisation JSON/YAML restent celles du
contrat existant, appliquées à l'ensemble étendu des `AnchorId`.

#### 6.1.2 Extension v1.1 planifiée : segments dotted `SCREAMING_SNAKE`

Cette section planifie une extension v1.1. Elle ne modifie pas le contrat
runtime tant que la tâche d'implémentation v1.1 correspondante n'a pas activé
explicitement ces règles.

Quand l'extension est active, le format `DOTTED_ID` devient :

- `DOTTED_ID = ^[A-Z]([A-Z0-9_]*[A-Z0-9])?(\.[A-Z]([A-Z0-9_]*[A-Z0-9])?)+$`

Exemples additionnels valides :

- `DOC.README.SECTIONS_MIN`
- `OWN.CODEOWNERS.FILE_SIZE_UNDER_3MB`
- `REL.PR_TITLE.CONVENTIONAL_COMMITS`

Exemples explicitement invalides :

- `_DOC.README`
- `DOC._README`
- `DOC.README_`
- `doc.README.SECTIONS_MIN`
- `DOC.README.SECTIONS-MIN`

Les surfaces d'observation, les règles de doublon, de validation des clés
`mappings`, de validation `map --anchor`, de tri canonique et de sérialisation
JSON/YAML restent inchangées.

### 6.2 Anchor occurrence

Une occurrence d'anchor est une observation de scan d'une anchor dans une spec supportée.

C'est une donnée **Observed**.
Elle n'est jamais persistée dans `anchormap.yaml`.

### 6.3 Mapping

Un mapping associe :

- une anchor ;
- une liste non vide de `seed_files`.

Le mapping persistant est une donnée **Human**.

AnchorMap ne sait pas si le mapping est vrai au sens produit.
Il sait seulement s'il est structurellement admissible ou non au moment du scan.

### 6.4 Seed file

Un `seed_file` est un fichier produit explicitement choisi par un humain comme point de départ d'une traversée déterministe des dépendances statiques locales supportées.

Ce n'est ni un leaf, ni un owner, ni une preuve métier.
C'est un point de départ.

### 6.5 Product file

Un `product_file` est un fichier `.ts` sous `product_root`, hors `ignore_roots`, hors `.d.ts`.

### 6.6 Mapping exploitable

Un mapping est **exploitable** si :

- l'anchor existe dans les specs courantes ;
- tous ses `seed_files` existent ;
- tous ses `seed_files` sont des `product_files` valides.

Un mapping non exploitable reste visible dans le résultat, mais ne contribue ni à `reached_files` ni à `covering_anchor_ids`.

### 6.7 `reached_files`

Pour un mapping stocké donné, `reached_files` est l'ensemble trié des `product_files` atteints en partant de ses `seed_files` et en suivant les `supported_local_targets` selon les sections 9.3.5 et 10.

Cette donnée est **Derived** :

- calculée à chaque scan ;
- jamais stockée dans `anchormap.yaml` ;
- vide si et seulement si le mapping n'est pas exploitable.

### 6.8 `covering_anchor_ids`

Pour un `product_file` donné, `covering_anchor_ids` est l'ensemble trié des anchors dont le `reached_files` contient ce fichier.

Cette donnée est **Derived** :

- calculée à chaque scan ;
- jamais stockée dans `anchormap.yaml` ;
- sans sémantique supplémentaire.

### 6.9 `supported_local_targets`

Pour un `product_file` importeur donné, `supported_local_targets` est l'ensemble trié des `target_path` retenus par la règle 1 de la section 10.2 pour ses occurrences syntaxiques supportées.

Cette donnée est **Derived** :

- calculée à chaque scan ;
- jamais stockée dans `anchormap.yaml` ;
- dédupliquée par `target_path` au niveau de l'importeur ;
- sans représentation de la multiplicité des occurrences.

### 6.10 `analysis_health`

Le résultat d'un scan expose :

- `clean`
- `degraded`

`analysis_health` passe à `degraded` si au moins un des findings suivants est présent :

- `stale_mapping_anchor`
- `broken_seed_path`
- `unresolved_static_edge`
- `unsupported_static_edge`
- `out_of_scope_static_edge`
- `unsupported_local_target`

Les findings `unmapped_anchor` et `untraced_product_file` ne dégradent pas l'analyse.

### 6.11 États des mappings

L'état d'un mapping stocké est déterminé dans l'ordre strict suivant :

1. si l'anchor du mapping n'existe pas dans les specs courantes, l'état est `stale` ;
2. sinon, si au moins un `seed_file` est absent ou non admissible comme `product_file`, l'état est `invalid` ;
3. sinon, l'état est `usable`.

Conséquences normatives :

- un mapping `stale` émet exactement un finding `stale_mapping_anchor` ;
- un mapping `stale` n'émet aucun `broken_seed_path`, même si certains `seed_files` sont aussi invalides ;
- un mapping `invalid` émet un finding `broken_seed_path` pour chaque `seed_file` invalide ;
- un mapping `usable` n'émet ni `stale_mapping_anchor` ni `broken_seed_path` ;
- un mapping n'est exploitable que si son état est `usable`.

L'état `mapping_state` d'une anchor observée est déterminé ainsi :

1. s'il n'existe aucun mapping stocké pour cette anchor, `mapping_state = absent` ;
2. sinon, si l'état du mapping stocké est `usable`, `mapping_state = usable` ;
3. sinon, `mapping_state = invalid`.

## 7. `anchormap.yaml`

### 7.1 Rôle

`anchormap.yaml` est l'unique donnée persistée propre à AnchorMap.

Il contient uniquement :

- la configuration stable ;
- les mappings explicites validés par un humain.

Il ne contient pas :

- de données dérivées ;
- d'historique ;
- de cache ;
- de candidats ;
- de classification ;
- de métriques volatiles.

### 7.2 Schéma minimal

```yaml
version: 1
product_root: 'src'
spec_roots:
  - '.specify/specs'
ignore_roots:
  - 'src/generated'
  - 'src/vendor'
mappings:
  'DOC.README.PRESENT':
    seed_files:
      - 'src/core/rules/docs/rules/doc-readme-present.ts'
  'FR-014':
    seed_files:
      - 'src/changelog/validate-format.ts'
```

### 7.3 Invariants de schéma

Le schéma impose :

- `anchormap.yaml` valide selon `YAML_PROFILE` ;
- exactement un document YAML ;
- un document racine de type mapping ;
- `version` obligatoire, valeur entière `1` ;
- `product_root` obligatoire, de type chaîne scalaire YAML ;
- `spec_roots` obligatoire, de type séquence YAML non vide de chaînes scalaires ;
- `ignore_roots` optionnel, de type séquence YAML de chaînes scalaires ;
- `mappings` optionnel, de type mapping YAML ;
- chaque valeur de `mappings[anchor]`, si `mappings` est présent, doit être un mapping contenant exactement la clé `seed_files` ;
- chaque `seed_files` doit être une séquence YAML non vide de chaînes scalaires ;
- aucun champ inconnu ;
- clés YAML dupliquées interdites ;
- tous les chemins stockés doivent déjà être des `RepoPath` canoniques selon la section 12.2 ;
- `seed_files` non vides et uniques ;
- toute clé de `mappings` conforme à un format d'anchor supporté.

### 7.4 Invariants de chemins

- `product_root` doit désigner un répertoire existant ;
- chaque `spec_root` doit désigner un répertoire existant ;
- chaque `ignore_root`, s'il existe dans le dépôt, doit être sous `product_root` ;
- aucun chemin absolu n'est accepté ;
- aucune entrée de `spec_roots` ne peut être égale à, ancêtre de, ou descendante d'une autre entrée de `spec_roots` ;
- aucune entrée de `ignore_roots` ne peut être égale à, ancêtre de, ou descendante d'une autre entrée de `ignore_roots` ;
- `spec_roots` doit être strictement dédupliqué par égalité exacte de `RepoPath` ;
- `ignore_roots` doit être strictement dédupliqué par égalité exacte de `RepoPath`.

### 7.5 Écriture canonique exacte

Quand la CLI écrit ou réécrit `anchormap.yaml`, elle rend exactement :

- un unique document YAML ;
- encodage UTF-8 sans BOM, avec fin de ligne `\n` ;
- aucune ligne vide supplémentaire en tête ou en fin ;
- aucune tabulation d'indentation ;
- aucun espace de fin de ligne ;
- aucune marque `---` ou `...` ;
- indentation exacte de 2 espaces par niveau ;
- ordre des clés top-level : `version`, `product_root`, `spec_roots`, `ignore_roots` si non vide, puis `mappings` ;
- `spec_roots` trié lexicographiquement ;
- `ignore_roots` trié lexicographiquement lorsqu'il est présent ;
- `ignore_roots` est omis entièrement s'il est absent ou vide ;
- les anchors de `mappings` triées lexicographiquement ;
- pour chaque mapping, ordre des clés : `seed_files` ;
- pour chaque mapping, `seed_files` trié lexicographiquement ;
- `mappings` toujours présent ; si aucun mapping n'existe, sa valeur est exactement `{}` ;
- le formatage original n'est pas préservé ;
- les commentaires ne sont pas garantis.

Règles exactes de rendu :

- `version` est rendu exactement sous la forme `version: 1` ;
- `product_root` est rendu sous la forme `product_root: '<value>'` ;
- chaque élément de `spec_roots`, `ignore_roots` et `seed_files` est rendu sous la forme `- '<value>'` ;
- chaque clé d'anchor dans `mappings` est rendue sous la forme `'ANCHOR':` ;
- un mapping non vide est rendu exactement ainsi :

```yaml
mappings:
  'ANCHOR':
    seed_files:
      - 'path/a.ts'
      - 'path/b.ts'
```

Règle d'échappement pour toute chaîne rendue entre quotes simples :

1. entourer la chaîne de `'` ;
2. remplacer chaque caractère `'` interne par `''` ;
3. n'appliquer aucun autre échappement.

### 7.6 Édition manuelle

L'édition manuelle du YAML est un chemin normal pour :

- supprimer un mapping ;
- corriger un seed path ;
- nettoyer une config.

La CLI n'essaie pas de préserver la forme éditoriale du fichier.

## 8. Détection des anchors

### 8.1 Markdown

Les fichiers `.md` sont découverts récursivement sous `spec_roots`, décodés selon la section 1.1, puis analysés selon `MARKDOWN_PROFILE`.

Si un fichier Markdown requis par le scan ne peut pas être lu ou décodé selon la section 1.1, la commande échoue avec le code de sortie `3`.

Une occurrence d'anchor est détectée uniquement dans un **heading ATX** de niveau 1 à 6.

Le texte du heading utilisé pour la détection est obtenu ainsi :

1. parser le document sous `MARKDOWN_PROFILE` ;
2. sélectionner uniquement les headings ATX ;
3. pour le contenu inline de chaque heading, construire une chaîne texte en concaténant, dans l'ordre du document :
   - le texte littéral des nœuds texte ;
   - le texte littéral des code spans ;
   - un espace ASCII `0x20` pour chaque softbreak ou hardbreak ;
   - pour tout nœud inline conteneur, la concaténation de ses enfants uniquement ;
   - une chaîne vide pour le HTML inline ;
4. supprimer les espaces ASCII de début et de fin ;
5. remplacer chaque suite non vide de caractères ASCII `0x09`, `0x0A`, `0x0D` ou `0x20` par un seul caractère espace `0x20`.

Une occurrence est détectée si ce texte commence par une anchor supportée immédiatement suivie de :

- la fin de chaîne ;
- un espace `0x20` ;
- `:`
- `-`

Exemples supportés :

```md
## FR-014 Validate changelog format
## FR-014: Validate changelog format
## DOC.README.PRESENT - README present
```

Exemple hors support :

```md
## Validate changelog format FR-014
```

Les Setext headings ne sont pas supportés.
Aucune autre structure Markdown n'est interprétée comme anchor.

### 8.2 YAML

Tout fichier `.yml` ou `.yaml` découvert récursivement sous `spec_roots` doit être :

- lisible et décodable selon la section 1.1 ;
- un YAML valide selon `YAML_PROFILE` ;
- single-document ;
- sans clés dupliquées.

Si le document racine est un mapping et porte une clé racine exacte `id`
dont la valeur est une chaîne scalaire correspondant à un format d'anchor supporté,
le fichier produit une occurrence d'anchor.

Sinon, le fichier est ignoré.

Exemple supporté :

```yaml
id: FR-014
title: Validate changelog format
```

Un `id` imbriqué ne compte pas comme anchor.
Un YAML illisible, non décodable selon la section 1.1, invalide, multi-document, ou à clés dupliquées fait échouer le scan.

### 8.3 Doublons

Une anchor ne peut apparaître qu'une seule fois dans l'ensemble des specs analysées.

Si la même anchor apparaît plusieurs fois, le dépôt est hors support et la commande échoue.

## 9. Commandes

v1.0 expose exactement trois commandes :

- `init`
- `map`
- `scan`

Aucune autre commande n'est dans le périmètre.

Toute commande inconnue, toute option inconnue, ou toute combinaison d'options non supportée échoue avec le code de sortie `4`.

L'ordre des options n'a pas d'effet sur le résultat.

Toute valeur de chemin fournie en argument CLI est interprétée comme `UserPathArg` et normalisée selon la section 12.2 avant toute validation, déduplication, comparaison, contrôle d'existence, ou écriture.

Règle commune aux commandes d'écriture (`init`, `map`) :

- ce sont les seules commandes autorisées à écrire `./anchormap.yaml` ;
- sur tout code de sortie non nul, `./anchormap.yaml` conserve exactement son état initial : absent avant commande implique absent après commande ; présent avant commande implique contenu byte-identique après commande ;
- aucun fichier temporaire ou auxiliaire propre à AnchorMap ne peut subsister dans le répertoire courant après un code non nul ;
- `scan` n'écrit jamais sur disque et ne modifie aucun fichier du dépôt.

### 9.1 `anchormap init`

#### 9.1.1 But

Créer `anchormap.yaml` une seule fois, avec une configuration minimale et des mappings vides.

#### 9.1.2 Forme supportée

```bash
anchormap init --root <path> --spec-root <path> [--spec-root <path> ...] [--ignore-root <path> ...]
```

#### 9.1.3 Règles

- `--root` est obligatoire et doit apparaître exactement une fois ;
- `--spec-root` est obligatoire et doit apparaître au moins une fois ;
- `--ignore-root` est optionnel et peut apparaître zéro ou plusieurs fois ;
- après normalisation `UserPathArg -> RepoPath`, les valeurs répétées de `--spec-root` ou `--ignore-root` sont interdites ;
- `init` est **create-only** ;
- si `./anchormap.yaml` existe déjà, la commande échoue ;
- `product_root` et tous les `spec_roots` doivent exister au moment de la commande et être vérifiables comme répertoires ;
- chaque `ignore_root`, s'il existe, doit être sous `product_root` ;
- si l'existence, le type ou l'appartenance sous `product_root` d'un chemin fourni à `init` ne peut pas être déterminé, la précondition est considérée comme non satisfaite.

#### 9.1.4 Effet observable

En cas de succès, `init` :

1. écrit `./anchormap.yaml` en forme canonique selon la section 7.5 ;
2. n'exécute aucun scan ;
3. n'écrit aucune donnée dérivée.

L'écriture est atomique.
En cas d'échec, la règle commune des commandes d'écriture définie en section 9 s'applique.

#### 9.1.5 Sortie

La sortie terminal humaine de `init` est hors contrat.
Le code de sortie et l'effet de fichier sont contractuels.

### 9.2 `anchormap map`

#### 9.2.1 But

Créer explicitement un mapping humain, ou remplacer explicitement un mapping existant.

#### 9.2.2 Forme supportée

```bash
anchormap map --anchor <anchor_id> --seed <path> [--seed <path> ...] [--replace]
```

#### 9.2.3 Règles

- `--anchor` est obligatoire, doit apparaître exactement une fois, et doit correspondre à un format d'anchor supporté ;
- au moins un `--seed` est obligatoire ;
- après normalisation `UserPathArg -> RepoPath`, les `--seed` doivent être uniques ;
- `--replace` est optionnel et ne prend pas d'argument ;
- `map` charge et valide `./anchormap.yaml` selon la section 7 ;
- `map` indexe les specs courantes selon la section 8 ;
- l'anchor fournie doit exister dans les specs courantes ;
- chaque `--seed` doit exister, être un `product_file`, et être hors `ignore_roots` ;
- toute impossibilité de lire `./anchormap.yaml` relève du code `2` ;
- toute impossibilité d'indexer les specs courantes, de découvrir les `product_files`, de lire un `product_file`, ou d'effectuer un test d'existence requis par les sections 10 et 12.3 relève du code `3`.
- si aucun mapping n'existe pour l'anchor, la commande crée le mapping ;
- si un mapping existe déjà, la commande échoue sauf si `--replace` est fourni ;
- si `--replace` est fourni et qu'aucun mapping n'existe encore, la commande crée le mapping ;
- le YAML est réécrit en forme canonique ;
- l'écriture est atomique.

#### 9.2.4 Effet observable

En cas de succès, `map` remplace exactement le contenu de `mappings[anchor]` par la liste canonique des `seed_files` fournis.

Aucun autre mapping n'est modifié, hors réordonnancement canonique du fichier.
En cas d'échec, la règle commune des commandes d'écriture définie en section 9 s'applique.

#### 9.2.5 Sortie

La sortie terminal humaine de `map` est hors contrat.
Le code de sortie et l'effet de fichier sont contractuels.

### 9.3 `anchormap scan`

#### 9.3.1 But

Produire le rapport de traçabilité structurelle déterministe.

#### 9.3.2 Formes supportées

```bash
anchormap scan
anchormap scan --json
```

Seul `scan --json` a un schéma de sortie garanti.

#### 9.3.3 Ce que le scan calcule

1. chargement et validation stricte de `anchormap.yaml` ;
2. index des anchors présentes dans les specs ;
3. miroir canonique de la configuration de scan dans `config` ;
4. index des `product_files` ;
5. construction des `supported_local_targets` et des findings issus des syntaxes locales reconnues de la section 10 ;
6. validation structurelle des mappings stockés ;
7. calcul de `reached_files` puis de `covering_anchor_ids` pour chaque `product_file` à partir des mappings exploitables ;
8. findings ;
9. `analysis_health`.

#### 9.3.4 Règle de contribution d'un mapping

Un mapping contribue au calcul de `reached_files` et de `covering_anchor_ids` uniquement s'il est exploitable.

Sinon :

- il reste visible dans `stored_mappings` ;
- `reached_files` vaut `[]` ;
- des findings explicites sont émis selon la section 6.11 ;
- il ne contribue pas à la couverture.

#### 9.3.5 Calcul de `reached_files` et de `covering_anchor_ids`

Pour chaque mapping exploitable :

1. partir de ses `seed_files` ;
2. suivre, selon la section 10, les dépendances statiques locales supportées ;
3. rester strictement dans `product_root`, hors `ignore_roots` ;
4. atteindre l'ensemble des `product_files` accessibles ;
5. enregistrer cet ensemble dans `stored_mappings[anchor].reached_files` ;
6. ajouter l'anchor à `covering_anchor_ids` de chaque fichier atteint.

#### 9.3.6 Règle sur `untraced_product_file`

`untraced_product_file` n'est émis que si :

- `analysis_health = clean` ;
- au moins un mapping exploitable existe ;
- toutes les anchors observées ont un mapping exploitable ;
- le `product_file` n'est atteint par aucun mapping exploitable.

Si l'analyse est dégradée, `untraced_product_file` n'est pas émis.

#### 9.3.7 Sortie

Pour `scan` sans `--json`, la sortie terminal humaine est hors contrat.

Pour `scan --json`, `stdout`, `stderr`, le schéma JSON et les codes de sortie sont définis exclusivement par la section 13.

#### 9.3.8 Notes d'interprétation

- `covering_anchor_ids` n'est pas une preuve d'ownership métier ;
- `untraced_product_file` ne veut pas dire dead code ;
- `untraced_product_file` ne veut pas dire safe to delete ;
- `analysis_health = clean` ne veut pas dire tout est mappé.

## 10. Dépendances statiques locales supportées

### 10.1 Formes syntaxiques supportées

Sous `TS_PROFILE`, AnchorMap supporte les déclarations TypeScript suivantes lorsqu'elles portent un specifier chaîne littérale **relative** :

- `ImportDeclaration`
- `ExportDeclaration`

Un specifier est **relatif** pour v1.0 si et seulement si sa valeur décodée :

- commence par `./` ou `../` ;
- n'est pas vide ;
- ne contient pas `\` comme séparateur ;
- est une chaîne littérale, pas une expression calculée.

Cela couvre notamment :

- `import ... from "./x"`
- `import type ... from "./x"`
- `import "./x"`
- `export * from "./x"`
- `export { ... } from "./x"`
- `export type { ... } from "./x"`

Quand un finding contient un champ `specifier`, sa valeur est la valeur décodée de la chaîne littérale TypeScript, sans guillemets.

### 10.2 Candidats de résolution et ordre de classification des occurrences supportées

Cette section s'applique **uniquement** aux occurrences syntaxiques supportées par la section 10.1.

Pour chaque occurrence syntaxique supportée portant un specifier local relatif en chaîne littérale, AnchorMap construit une liste ordonnée de candidats relative au répertoire du fichier importeur.

Chaque occurrence syntaxique supportée par la section 10.1 produit exactement l'un des résultats suivants :

- une cible supportée retenue pour le calcul de couverture ;
- un finding `out_of_scope_static_edge` ;
- un finding `unsupported_local_target` ;
- un finding `unresolved_static_edge`.

La normalisation d'un candidat se fait selon la section 12.2, par résolution lexicale POSIX relative au répertoire de l'importeur, avant tout test d'existence.
Un candidat n'est pris en compte que si son chemin normalisé reste sous la racine du dépôt.
Un candidat qui sortirait de la racine du dépôt est traité comme inexistant.

Cas 1 — specifier se terminant par `.ts` **et non par** `.d.ts` :

1. candidat supporté : la cible exacte.

Cas 2 — specifier se terminant par `.tsx`, `.js` ou `.d.ts` :

1. candidat de diagnostic uniquement : la cible exacte.

Cas 3 — specifier sans extension explicite, c'est-à-dire dont le dernier segment ne contient aucun `.` :

1. candidat supporté : `<path>.ts`
2. candidat supporté : `<path>/index.ts`
3. candidat de diagnostic uniquement : `<path>.tsx`
4. candidat de diagnostic uniquement : `<path>.js`
5. candidat de diagnostic uniquement : `<path>.d.ts`
6. candidat de diagnostic uniquement : `<path>/index.tsx`
7. candidat de diagnostic uniquement : `<path>/index.js`
8. candidat de diagnostic uniquement : `<path>/index.d.ts`

Cas 4 — specifier avec extension explicite autre que `.ts`, `.tsx`, `.js` ou `.d.ts`, ou se terminant par `/` :

1. aucun candidat n'est construit ;
2. l'occurrence supportée produit `unresolved_static_edge`.

La classification se fait dans l'ordre strict suivant pour les cas 1 à 3 :

1. choisir le **premier** candidat de la liste qui existe, est supporté, est sous `product_root` et n'est pas sous `ignore_roots` ; ce candidat est la cible supportée retenue pour le calcul de couverture ;
2. sinon, choisir le **premier** candidat de la liste qui existe et qui est soit hors `product_root`, soit sous `ignore_roots` ; ce candidat produit un finding `out_of_scope_static_edge` avec son `target_path` exact ;
3. sinon, choisir le **premier** candidat de la liste qui existe, est sous `product_root`, n'est pas sous `ignore_roots`, et appartient à un type non supporté ; ce candidat produit un finding `unsupported_local_target` avec son `target_path` exact ;
4. sinon, produire un finding `unresolved_static_edge`.

Conséquences explicites :

- si `<path>.ts` et `<path>/index.ts` existent tous les deux dans le périmètre supporté, `<path>.ts` gagne ;
- si plusieurs candidats de diagnostic existent, le premier dans la liste ordonnée gagne ;
- `target_path` vaut toujours le chemin normalisé du candidat effectivement retenu par la règle 2 ou la règle 3 ;
- le cas 4 ne produit jamais `target_path` ;
- pour un importeur donné, l'ensemble dédupliqué des cibles retenues par la règle 1 est exposé dans `files[importer].supported_local_targets`.

#### 10.2.1 Extension v1.1 planifiée : specifiers `.js` vers sources `.ts`

Cette section planifie une extension v1.1. Elle ne modifie pas le contrat
runtime v1.0 tant que la tâche d'implémentation v1.1 correspondante n'a pas
activé explicitement ces règles.

Quand l'extension est active, le cas 2 de la section 10.2 est remplacé pour les
specifiers terminés par `.js` uniquement.

Cas 2a — specifier se terminant par `.tsx` ou `.d.ts` :

1. candidat de diagnostic uniquement : la cible exacte.

Cas 2b — specifier se terminant par `.js` :

1. candidat supporté : la cible source obtenue en remplaçant le suffixe
   terminal `.js` par `.ts`, sauf si cette cible se termine par `.d.ts` ;
2. candidat de diagnostic uniquement : la cible exacte `.js`.

Si le candidat source `.ts` du cas 2b se terminerait par `.d.ts`, il n'est pas
un candidat supporté et il est traité comme candidat de diagnostic uniquement.

La classification ordonnée reste celle de la section 10.2.

Conséquences explicites de l'extension :

- `import "./dep.js"` peut retenir `dep.ts` comme cible supportée ;
- `export * from "./dep.js"` et les autres `ExportDeclaration` supportées
  utilisent la même résolution ;
- `import "./dir/index.js"` peut retenir `dir/index.ts` comme cible supportée ;
- `import "./dir.js"` ne construit pas de candidat `dir/index.ts` ;
- si `dep.ts` et `dep.js` existent tous les deux sous `product_root` et hors
  `ignore_roots`, `dep.ts` gagne et aucun finding lié à `dep.js` n'est émis ;
- si `dep.ts` n'existe pas mais `dep.js` existe sous `product_root` et hors
  `ignore_roots`, l'occurrence produit `unsupported_local_target` avec
  `target_path = "dep.js"` ;
- si aucun candidat du cas 2b n'est retenu par les règles de classification,
  l'occurrence produit `unresolved_static_edge` avec le specifier original,
  par exemple `"./dep.js"`.

Cette extension ne promet pas :

- la prise en charge de `.js` comme `product_file` ;
- la lecture de `tsconfig.json`, `package.json`, `baseUrl`, `paths`, `exports`
  ou conditions Node ;
- la résolution des imports non relatifs ;
- la résolution de répertoires pour un specifier explicite `.js` autre que le
  chemin écrit dans le specifier.

### 10.3 Ce qui ne produit pas de dépendance locale supportée

Ne produisent pas de dépendance locale supportée :

- imports de packages ;
- specifiers non relatifs ;
- cibles locales hors `product_root` ;
- cibles locales sous `ignore_roots` ;
- cibles locales d'extension non supportée ;
- formes reconnues mais hors support selon la section 10.4.

Conséquences explicites :

- les imports de packages et, plus généralement, les specifiers non relatifs n'émettent aucun finding ;
- les occurrences supportées de la section 10.1 dont la classification aboutit à une cible hors `product_root`, sous `ignore_roots`, d'extension non supportée, ou non résolue, émettent respectivement `out_of_scope_static_edge`, `unsupported_local_target` ou `unresolved_static_edge` selon la section 10.2 ;
- les formes reconnues mais hors support de la section 10.4 émettent `unsupported_static_edge`.

Si plusieurs occurrences syntaxiques distinctes d'un même `importer` retiennent la même `target_path` supportée, cette multiplicité n'a aucun effet observable supplémentaire : `supported_local_targets` contient la cible une seule fois, et le graphe de couverture contient au plus un edge supporté par couple `(importer, target_path)`.

### 10.4 Formes reconnues mais hors support

v1.0 reconnaît explicitement les syntaxes suivantes lorsqu'elles portent un specifier local relatif en chaîne littérale :

- `require("./x")`
- `import("./x")`

Ces formes ne sont **pas** des occurrences supportées par la section 10.1.

Chaque occurrence reconnue par la présente section produit exactement un finding `unsupported_static_edge`.
Elle ne passe pas par la résolution de la section 10.2 et ne participe jamais au calcul de couverture.

Valeurs autorisées pour `syntax_kind` :

- `require_call`
- `dynamic_import`

Aucune autre promesse d'exhaustivité n'est faite pour les formes dynamiques ou indirectes.

### 10.5 Parse failures

Tous les `product_files` du périmètre doivent être lisibles, décodables selon la section 1.1, et syntaxiquement parsables selon `TS_PROFILE`.

Si un `product_file` ne peut pas être lu, décodé selon la section 1.1, ou parsé, l'analyse échoue avec le code de sortie `3`.
Ce n'est pas une dégradation ; c'est une impossibilité de construire le modèle.

## 11. Findings

### 11.1 Types normatifs

| Kind                       | Champs normatifs                       | Signification                                                                          |
| -------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| `unmapped_anchor`          | `anchor_id`                            | anchor présente dans les specs, sans mapping stocké                                    |
| `stale_mapping_anchor`     | `anchor_id`                            | mapping stocké pour une anchor absente des specs courantes                             |
| `broken_seed_path`         | `anchor_id`, `seed_path`               | seed référencé mais absent ou non admissible comme `product_file`                      |
| `unresolved_static_edge`   | `importer`, `specifier`                | edge syntaxiquement supporté mais non résolu par les règles v1.0                       |
| `unsupported_static_edge`  | `importer`, `syntax_kind`, `specifier` | syntaxe locale explicitement reconnue mais hors support v1.0                           |
| `out_of_scope_static_edge` | `importer`, `target_path`              | edge résolu vers une cible locale existante hors `product_root` ou sous `ignore_roots` |
| `unsupported_local_target` | `importer`, `target_path`              | edge résolu vers une cible locale existante de type non supporté                       |
| `untraced_product_file`    | `path`                                 | `product_file` sans couverture lorsque la règle de la section 9.3.6 l'autorise         |

### 11.2 Types et normalisation des champs

- `anchor_id` est toujours une anchor supportée ;
- `seed_path`, `importer`, `target_path` et `path` sont toujours des `RepoPath` canoniques, relatifs à la racine du dépôt ;
- `specifier` est toujours la valeur décodée de la chaîne littérale TypeScript, sans guillemets ;
- `syntax_kind` vaut toujours `require_call` ou `dynamic_import`.

### 11.3 Unicité

Les findings sont dédupliqués par le tuple exact :

- `kind`
- puis leurs champs normatifs, dans l'ordre du tableau de la section 11.1

Deux occurrences qui produisent le même tuple n'apparaissent qu'une seule fois dans le JSON final.

### 11.4 Règles d'émission

Sous réserve de la déduplication définie en section 11.3 :

- `unmapped_anchor` est émis pour chaque anchor observée telle que `mapping_state = absent` ;
- `stale_mapping_anchor` est émis pour chaque mapping stocké tel que `state = stale` ;
- `broken_seed_path` est émis pour chaque `seed_file` invalide d'un mapping tel que `state = invalid` ;
- `untraced_product_file` est émis pour chaque `product_file` dont `covering_anchor_ids` est vide lorsque la règle de la section 9.3.6 autorise cette classe de finding.

Pour les findings issus des syntaxes locales reconnues de la section 10, chaque occurrence applique les règles normatives de sa sous-section applicable (`10.2` ou `10.4`) ; le résultat final est ensuite dédupliqué selon la section 11.3.

### 11.5 Effet sur `analysis_health`

Dégradent l'analyse :

- `stale_mapping_anchor`
- `broken_seed_path`
- `unresolved_static_edge`
- `unsupported_static_edge`
- `out_of_scope_static_edge`
- `unsupported_local_target`

Ne dégradent pas l'analyse à eux seuls :

- `unmapped_anchor`
- `untraced_product_file`

### 11.6 Tri canonique

Les findings sont triés lexicographiquement par :

1. `kind`
2. puis leurs champs normatifs, dans l'ordre du tableau de la section 11.1

Les clés JSON d'un finding sont rendues dans l'ordre :

1. `kind`
2. puis les champs normatifs de ce `kind`, dans l'ordre du tableau de la section 11.1

Aucune clé supplémentaire n'est autorisée en v1.0.

## 12. Déterminisme, chemins, plateformes et stabilité

### 12.1 Racine du dépôt et config

Pour toutes les commandes, la racine du dépôt est exactement le répertoire courant au démarrage du process.

Règles :

- `scan` et `map` lisent exactement `./anchormap.yaml` dans ce répertoire ;
- l'absence de `./anchormap.yaml` pour `scan` ou `map` produit le code `2` ;
- `init` écrit exactement `./anchormap.yaml` dans ce répertoire ;
- aucune recherche implicite dans les répertoires parents n'est autorisée.

### 12.2 Modèle canonique des chemins

#### 12.2.1 `RepoPath`

Un `RepoPath` est un chemin normalisé relatif à la racine du dépôt.

Il est représenté comme une chaîne UTF-8 qui vérifie toutes les conditions suivantes :

- séparateurs POSIX `/` uniquement ;
- ne commence pas par `/` ;
- ne se termine pas par `/` ;
- ne contient aucun segment vide ;
- ne contient aucun segment égal à `.` ou `..` ;
- ne contient aucun caractère de contrôle Unicode `U+0000..U+001F` ni `U+007F`.

Les comparaisons, tests d'égalité et tris sur `RepoPath` utilisent l'ordre binaire des octets UTF-8.

#### 12.2.2 Normalisation des arguments de chemin CLI

Les arguments de chemin fournis à `--root`, `--spec-root`, `--ignore-root` et `--seed` sont des `UserPathArg`.

La normalisation `UserPathArg -> RepoPath` est **exactement** la suivante :

1. partir de la chaîne UTF-8 reçue par la CLI après parsing des arguments ;
2. rejeter la valeur si elle est vide ;
3. rejeter la valeur si elle contient `\` ;
4. rejeter la valeur si elle contient un caractère de contrôle Unicode `U+0000..U+001F` ou `U+007F` ;
5. remplacer chaque suite non vide de `/` par un seul `/` ;
6. retirer chaque préfixe répété `./` en tête de chaîne ;
7. retirer chaque suffixe répété `/` en fin de chaîne ;
8. rejeter la valeur si le résultat est vide ;
9. rejeter la valeur si le résultat commence par `/` ;
10. scinder le résultat sur `/` et rejeter la valeur si un segment est vide, `.` ou `..` ;
11. le résultat final est le `RepoPath` canonique.

Aucune autre transformation n'est appliquée.

#### 12.2.3 Normalisation des candidats d'import relatif

Pour résoudre un specifier relatif depuis un `importer`, AnchorMap utilise une normalisation lexicale pure, sans consulter le système de fichiers :

1. prendre le répertoire de `importer` ;
2. concaténer ce répertoire, le specifier décodé, puis le suffixe de candidat éventuel, avec `/` comme séparateur ;
3. remplacer chaque suite non vide de `/` par un seul `/` ;
4. scinder sur `/` ;
5. supprimer chaque segment vide ou `.` ;
6. résoudre chaque segment `..` en supprimant le segment précédent ; si aucun segment précédent n'existe, le candidat sort de la racine du dépôt ;
7. si le candidat sort de la racine du dépôt, il est traité comme inexistant ;
8. sinon, la concaténation restante, jointe par `/`, est le `RepoPath` canonique du candidat.

Cette normalisation est la seule utilisée pour produire `target_path`, `supported_local_targets`, `reached_files` et `covering_anchor_ids`.

### 12.3 Portée de découverte, lisibilité et garde-fous

La découverte récursive de fichiers est limitée à :

- `product_root`, hors `ignore_roots`, pour les `product_files` ;
- chaque entrée de `spec_roots` pour les spec files.

En plus de cette découverte récursive, AnchorMap effectue uniquement des tests d'existence ponctuels sur l'ensemble fini des candidats de résolution défini en section 10.2, y compris quand un candidat est hors `product_root`.

Aucune exploration récursive hors `product_root` et hors `spec_roots` n'est autorisée.

Pour `scan` et `map`, les opérations suivantes sont des lectures requises du dépôt :

- l'ouverture, la lecture et le décodage de `./anchormap.yaml` ;
- l'énumération récursive de `product_root` et de chaque `spec_root` ;
- l'ouverture, la lecture et le décodage des spec files et des `product_files` découverts ;
- les tests d'existence ponctuels requis par la résolution de la section 10.2.

Règle de classification des échecs de lecture :

- si l'échec concerne `./anchormap.yaml`, y compris absence, illisibilité, non-décodabilité UTF-8 selon la section 1.1, YAML invalide, multi-document, racine non mapping, clés dupliquées, schéma invalide ou invariant violé, le code de sortie est `2` ;
- si l'échec concerne toute autre lecture requise du dépôt pour `scan` ou `map`, y compris impossibilité d'énumérer un sous-arbre requis, d'ouvrir ou lire une spec, d'ouvrir ou lire un `product_file`, de décoder un tel fichier selon la section 1.1, ou d'effectuer un test d'existence ponctuel requis par la section 10.2, le code de sortie est `3`.

Le dépôt est hors support si l'un des cas suivants est détecté dans les sous-arbres effectivement inspectés :

- symlink ;
- collision de chemins différant uniquement par la casse ;
- chemin en scope non représentable comme `RepoPath` canonique ;
- duplicate anchor dans les specs ;
- `product_file` illisible, non décodable selon la section 1.1, ou non parsable ;
- fichier Markdown de spec illisible ou non décodable selon la section 1.1 ;
- fichier YAML de spec illisible, non décodable selon la section 1.1, invalide, multi-document, ou à clés dupliquées.

L'impossibilité de charger ou valider `anchormap.yaml`, y compris YAML invalide, multi-document, racine non mapping ou clés dupliquées, relève de la configuration et produit le code de sortie `2`, pas le code `3`.
### 12.4 Plateformes supportées

La garantie de déterminisme de v1.0 s'applique exactement à la matrice suivante :

- Linux x86_64
- macOS arm64

Toute autre plateforme est hors contrat pour v1.0.

### 12.5 Sorties stables

Pour `scan --json`, AnchorMap garantit :

- `schema_version` explicite ;
- encodage UTF-8 sans BOM ;
- fin de ligne unique `\n` ;
- ordre canonique des clés ;
- ordre canonique des collections ;
- chemins canoniques ;
- findings dédupliqués et triés de manière canonique ;
- sérialisation JSON exacte selon la section 13.7.

Pour `init` et `map`, AnchorMap garantit l'écriture YAML canonique exacte selon la section 7.5.

### 12.6 Aucune donnée implicite

Le chemin quotidien n'utilise :

- ni cache persistant ;
- ni métadonnées Git ;
- ni horloge ;
- ni réseau ;
- ni variable d'environnement comme source de vérité.

## 13. JSON garanti et codes de sortie

### 13.1 Périmètre du contrat machine

Le contrat machine s'applique uniquement à `scan --json`.

Pour `scan --json` :

- si le code de sortie est `0`, `stdout` contient exactement un objet JSON conforme aux sections 13.2 à 13.7, encodé en UTF-8 sans BOM et terminé par un unique `\n` ; `stderr` est vide ;
- si le code de sortie est `1`, `2`, `3` ou `4`, `stdout` est vide et aucun JSON n'est émis ; `stderr` peut être vide ou contenir une ligne UTF-8 terminée par `\n`, dont le contenu est hors contrat.

### 13.2 Schéma de succès exact

L'objet JSON de succès contient exactement les clés racine suivantes :

- `schema_version`
- `config`
- `analysis_health`
- `observed_anchors`
- `stored_mappings`
- `files`
- `findings`

Contraintes normatives :

- `schema_version` vaut toujours l'entier `1` ;
- `config` est toujours présent ;
- `analysis_health` vaut `clean` ou `degraded` ;
- `observed_anchors`, `stored_mappings` et `files` sont toujours présents, y compris s'ils sont vides ;
- `findings` est toujours présent, y compris s'il est vide ;
- aucune clé racine supplémentaire n'est autorisée.

Le champ `config` est un objet fermé contenant exactement :

1. `version`
2. `product_root`
3. `spec_roots`
4. `ignore_roots`

Règles complémentaires :

- `config.version` vaut toujours l'entier `1` ;
- `config.product_root` vaut exactement le `product_root` lu dans `anchormap.yaml`, sous forme de `RepoPath` canonique ;
- `config.spec_roots` vaut exactement la liste canonique et triée des `spec_roots` lus dans `anchormap.yaml` ;
- `config.ignore_roots` est toujours présent ; sa valeur est `[]` si `ignore_roots` est absent ou vide dans `anchormap.yaml`, sinon la liste canonique et triée des `ignore_roots` lus dans `anchormap.yaml` ;
- aucune clé supplémentaire n'est autorisée dans `config`.

### 13.3 `observed_anchors`

`observed_anchors` contient exactement les anchors détectées dans les specs courantes.

Chaque entrée a pour clé l'`anchor_id` observée et pour valeur un objet fermé contenant exactement :

1. `spec_path`
2. `mapping_state`

Valeurs possibles de `mapping_state` :

- `absent` : aucun mapping stocké pour cette anchor ;
- `usable` : mapping stocké et exploitable ;
- `invalid` : mapping stocké et non exploitable.

Règles complémentaires :

- `spec_path` est toujours un `RepoPath` canonique ;
- aucune clé supplémentaire n'est autorisée dans une entrée de `observed_anchors`.

### 13.4 `stored_mappings`

`stored_mappings` contient exactement les mappings présents dans `anchormap.yaml`, y compris ceux qui ne correspondent plus à une anchor observée.

Chaque entrée a pour clé l'`anchor_id` stockée et pour valeur un objet fermé contenant exactement :

1. `state`
2. `seed_files`
3. `reached_files`

Valeurs possibles de `state` :

- `usable` : mapping présent et exploitable ;
- `invalid` : mapping présent pour une anchor observée, mais non exploitable ;
- `stale` : mapping présent pour une anchor absente des specs courantes.

Règles complémentaires :

- `seed_files` contient exactement les chemins stockés dans le mapping, rendus sous forme canonique et triée ;
- `reached_files` est toujours présent ;
- `reached_files` est trié lexicographiquement ;
- `reached_files` vaut `[]` si `state != usable` ;
- si `state = usable`, `reached_files` contient exactement l'ensemble atteint par la section 9.3.5, y compris tous les `seed_files` ;
- aucune clé supplémentaire n'est autorisée dans une entrée de `stored_mappings`.

### 13.5 `files`

`files` contient exactement tous les `product_files` découverts sous `product_root`, hors `ignore_roots`.

Chaque entrée a pour clé le chemin du `product_file` et pour valeur un objet fermé contenant exactement :

1. `covering_anchor_ids`
2. `supported_local_targets`

Règles complémentaires :

- `covering_anchor_ids` est toujours présent ;
- `covering_anchor_ids` est trié lexicographiquement ;
- `covering_anchor_ids` peut être vide ;
- `supported_local_targets` est toujours présent ;
- `supported_local_targets` est trié lexicographiquement ;
- `supported_local_targets` peut être vide ;
- `supported_local_targets` contient exactement l'ensemble dédupliqué des cibles retenues par la règle 1 de la section 10.2 pour ce fichier importeur ;
- aucune clé supplémentaire n'est autorisée dans une entrée de `files`.

### 13.6 `findings`

`findings` est un tableau de findings dédupliqués.

Chaque élément est un objet fermé.
Les seuls `kind` autorisés sont ceux de la section 11.1.

Formes exactes autorisées :

- `{"kind":"unmapped_anchor","anchor_id":<anchor_id>}`
- `{"kind":"stale_mapping_anchor","anchor_id":<anchor_id>}`
- `{"kind":"broken_seed_path","anchor_id":<anchor_id>,"seed_path":<path>}`
- `{"kind":"unresolved_static_edge","importer":<path>,"specifier":<specifier>}`
- `{"kind":"unsupported_static_edge","importer":<path>,"syntax_kind":<syntax_kind>,"specifier":<specifier>}`
- `{"kind":"out_of_scope_static_edge","importer":<path>,"target_path":<path>}`
- `{"kind":"unsupported_local_target","importer":<path>,"target_path":<path>}`
- `{"kind":"untraced_product_file","path":<path>}`

Aucune autre forme et aucune clé supplémentaire ne sont autorisées.

### 13.7 Sérialisation JSON canonique exacte

Pour `scan --json`, les bytes du succès sont rendus exactement selon les règles suivantes :

- un seul objet JSON sur une seule ligne, suivi d'un unique `\n` final ;
- aucun espace, aucune tabulation et aucun saut de ligne hors des chaînes JSON et du `\n` final ;
- ordre des clés racine :
  1. `schema_version`
  2. `config`
  3. `analysis_health`
  4. `observed_anchors`
  5. `stored_mappings`
  6. `files`
  7. `findings`
- dans `config`, l'ordre des clés est `version`, puis `product_root`, puis `spec_roots`, puis `ignore_roots` ;
- les clés de `observed_anchors`, `stored_mappings` et `files` sont triées lexicographiquement ;
- dans chaque entrée de `observed_anchors`, l'ordre des clés est `spec_path`, puis `mapping_state` ;
- dans chaque entrée de `stored_mappings`, l'ordre des clés est `state`, puis `seed_files`, puis `reached_files` ;
- dans chaque entrée de `files`, l'ordre des clés est `covering_anchor_ids`, puis `supported_local_targets` ;
- les tableaux `config.spec_roots`, `config.ignore_roots`, `seed_files`, `reached_files`, `covering_anchor_ids` et `supported_local_targets` sont triés lexicographiquement ;
- `findings` est trié selon la section 11.6 ;
- toute chaîne JSON est rendue entre guillemets doubles `"` ;
- dans les chaînes JSON, `"` est échappé en `\"`, `\` en `\\` ;
- tout caractère de contrôle `U+0000..U+001F` est échappé en `\u00xx` hexadécimal minuscule ;
- tout surrogate isolé `U+D800..U+DFFF`, s'il apparaît dans une chaîne JSON, est échappé en `\u` suivi de 4 chiffres hexadécimaux minuscules ;
- aucun autre caractère n'est échappé avec `\u` ; les autres caractères sont rendus directement en UTF-8 ;
- `/` n'est jamais échappé ;
- l'entier `schema_version` est rendu exactement sous la forme `1`.

### 13.8 Codes de sortie

- `0` : exécution réussie ;
- `1` : erreur interne ;
- `2` : config absente, illisible, non décodable selon la section 1.1, ou invalide ;
- `3` : dépôt hors support, lecture requise du dépôt impossible, ou analyse impossible ;
- `4` : arguments invalides ou précondition non satisfaite.

Les findings ne changent pas le code de sortie.

### 13.9 Priorité des codes de sortie

Quand plusieurs conditions d'échec sont simultanément présentes, la priorité est :

1. `4` : arguments invalides ou précondition non satisfaite ;
2. `2` : config absente ou invalide ;
3. `3` : dépôt hors support ou analyse impossible ;
4. `1` : erreur interne.

Une exécution réussie retourne `0`.
