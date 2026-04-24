# AnchorMap CLI — design.md

**Statut**: design de référence v5  
**Portée**: ce document décrit une implémentation cible compatible avec `contract.md`.  
**Prévalence**: si une section de ce document entre en conflit avec `contract.md`, le contrat prévaut.

## 1. Objectif du design

Le design v1.0 vise cinq propriétés :

- implémentation courte et auditable ;
- comportement strictement déterministe sur le périmètre supporté ;
- séparation nette entre lecture du dépôt, calcul Derived et rendu ;
- effets de bord localisés et explicitement bornés ;
- absence de chemin non nul après une mutation visible de `anchormap.yaml`.

Le design optimise la stabilité et l’auditabilité avant la couverture maximale du langage.

## 2. Contraintes de conception

Le design doit respecter :

- un seul fichier persistant : `./anchormap.yaml` ;
- aucun réseau ;
- aucun cache persistant ;
- aucune dépendance à Git ;
- aucune dépendance à l’horloge ;
- aucune dépendance à des variables d’environnement comme source de vérité ;
- aucune plage semver flottante dans le build publié ;
- aucun chemin d’échec post-commit pour `init` et `map`.

## 2.1 Stack and ADRs

Ce document décrit l’architecture cible et les frontières internes.

Les décisions de stack, de dépendances structurantes et de stratégie d’outillage sont journalisées dans `docs/adr/`.

ADRs courantes :

- `ADR-0001` — Runtime and package manager (`Accepted`)
- `ADR-0002` — CLI interface strategy (`Accepted`)
- `ADR-0003` — Test runner and fixture harness (`Accepted`)
- `ADR-0004` — Markdown parser profile (`Accepted`)
- `ADR-0005` — YAML parser and config input profile (`Accepted`)
- `ADR-0006` — TypeScript parser and graph subset (`Accepted`)
- `ADR-0007` — Canonical JSON and YAML rendering (`Accepted`)
- `ADR-0010` — Source formatting and linting tool (`Accepted`)

## 3. Sources de vérité et frontières

Le design repose sur trois catégories de données, sans recouvrement implicite :

- **Observed** : contenu du dépôt courant sous la racine analysée, y compris `product_files`, spec files et occurrences d’anchors ;
- **Human** : contenu validé de `./anchormap.yaml`, et uniquement lui ;
- **Derived** : graphe local, états de mapping, `supported_local_targets`, `reached_files`, `covering_anchor_ids`, findings, `analysis_health` et JSON de sortie.

Règles de frontière :

- `./anchormap.yaml` est l’unique source de vérité persistée propre à AnchorMap ;
- aucune donnée Derived n’est stockée sur disque ;
- aucune donnée Observed n’est promue implicitement en donnée Human ;
- tout fichier `.md`, `.yml`, `.yaml` ou `.ts` consommé est converti en texte uniquement par la frontière de décodage UTF-8 stricte de `repo_fs` ;
- le rendu ne recalcule rien : il sérialise uniquement des données déjà dérivées et triées ;
- les écritures de `anchormap.yaml` passent par une frontière explicite **préparation / pre_commit / commit** ;
- aucun module autre que `config_io` ne possède la sémantique du commit de `anchormap.yaml`.

## 4. Vue d’ensemble du système

### 4.1 Pipeline logique de `scan`

```text
current working directory
  -> repo_fs
  -> config_io.loadConfig
  -> spec_index
  -> ts_graph
  -> scan_engine
  -> render
  -> commands (stdout/stderr)
```

### 4.2 Pipeline logique de `map`

```text
args
  -> commands
  -> repo_fs
  -> config_io.loadConfig
  -> commands.validateMapPreconditionsFromConfigAndSeeds
  -> spec_index
  -> commands.validateMapAnchor
  -> ts_graph.discoverProductFiles
  -> commands.validateMapSeedsInProductFiles
  -> ts_graph.buildProductGraph (validation dépôt requise, résultat ignoré)
  -> config_io.writeConfigAtomic
  -> commands (optional human output)
```

`map` construit le graphe avant écriture uniquement pour forcer les lectures requises des `product_files`, leur décodage strict, leur parsing TypeScript et les tests d’existence requis par la résolution. Les edges et findings produits pendant cette validation sont ignorés par `map`, ne sont pas persistés, ne sont pas rendus et ne modifient pas le YAML produit.

### 4.3 Pipeline logique de `init`

```text
args
  -> commands
  -> repo_fs
  -> config_io.writeConfigAtomic
  -> commands (optional human output)
```

## 5. Découpage en modules

### 5.1 `repo_fs`

Responsabilités :

- canonicaliser le répertoire courant en `RepoRoot` ;
- représenter les chemins internes comme `RepoPath` ;
- normaliser les séparateurs en POSIX ;
- refuser les chemins absolus, les segments `.` / `..`, et les chemins hors racine ;
- détecter les symlinks dans les sous-arbres inspectés ;
- détecter les collisions de casse dans les sous-arbres inspectés ;
- fournir une découverte récursive stable des fichiers et répertoires ;
- ouvrir les fichiers requis comme suites d’octets ;
- décoder les fichiers texte consommés par AnchorMap en UTF-8 strict ;
- ignorer exactement un BOM UTF-8 initial avant parsing, s’il est présent.

API cible :

- `RepoRoot fromCwd()`
- `RepoPath parseUserPath(input: string)`
- `RepoPath join(base: RepoPath, relative: string)`
- `bool exists(path: RepoPath)`
- `bool isFile(path: RepoPath)`
- `bool isDir(path: RepoPath)`
- `RepoEntry[] walk(root: RepoPath)`
- `string readUtf8StrictNoBom(path: RepoPath)`

Décisions clés :

- `walk` retourne des entrées déjà triées par `RepoPath` normalisé ;
- aucune couche supérieure ne dépend directement de l’ordre renvoyé par le système de fichiers ;
- toute logique de normalisation et de comparaison de chemins est centralisée ici ;
- `readUtf8StrictNoBom` lit d’abord les octets, applique un décodage UTF-8 strict, retire exactement un BOM initial `U+FEFF` s’il est présent, puis retourne le texte décodé ;
- `readUtf8StrictNoBom` n’applique aucune normalisation de newline, d’Unicode ou d’encodage autre que ce retrait de BOM initial ;
- aucun parser Markdown, YAML ou TypeScript n’est autorisé à relire un fichier ni à appliquer son propre décodage implicite ;
- `repo_fs` ne choisit pas le code de sortie : le module appelant classe l’échec selon la source lue.

### 5.2 `config_io`

Responsabilités :

- charger exactement `./anchormap.yaml` via `repo_fs.readUtf8StrictNoBom` ;
- classer toute absence, illisibilité, non-décodabilité, YAML invalide, multi-document, racine non mapping, clé dupliquée, schéma invalide ou invariant violé de `anchormap.yaml` comme `ConfigError` ;
- détecter YAML invalide, multi-document là où interdit, ou à clés dupliquées ;
- parser les entrées YAML avec `yaml@2.8.3` et les contraintes de wrapper de
  `ADR-0005` ;
- valider le schéma, les invariants de chemins et l’existence des racines requises ;
- normaliser toutes les valeurs de chemins ;
- matérialiser un modèle `Config` interne ;
- écrire un YAML canonique ;
- exécuter l’unique chemin d’écriture atomique de `anchormap.yaml` ;
- posséder la frontière `pre_commit -> commit` et le cleanup du fichier temporaire.

API cible :

- `Config loadConfig(root: RepoRoot, fs: RepoFs)`
- `Config validateConfig(raw: unknown, root: RepoRoot, fs: RepoFs)`
- `void writeConfigAtomic(root: RepoRoot, fs: RepoFs, config: Config)`

Décisions clés :

- `config_io.writeConfigAtomic` est **l’unique** fonction autorisée à modifier `anchormap.yaml` ;
- le tri des `seed_files` est un effet d’écriture canonique, pas une règle métier distincte ;
- les commentaires et le formatage source ne sont pas conservés ;
- le writer est un rendu YAML custom de forme fermée selon `ADR-0007`, pas un emitter YAML générique ;
- le writer émet toujours le même ordre de clés et écrit toujours `mappings`, y compris `mappings: {}` ;
- `config_io` possède seul le fichier temporaire dédié à un write attempt ;
- `config_io.writeConfigAtomic` ne peut retourner `WriteError` qu’avant commit, et seulement après cleanup synchrone du fichier temporaire éventuel ;
- aucune étape faillible n’est autorisée après un `rename` réussi dans le chemin contractuel v1.0.

### 5.3 `spec_index`

Responsabilités :

- découvrir récursivement les fichiers sous `spec_roots` ;
- filtrer par extension `.md`, `.yml`, `.yaml` ;
- lire chaque spec via `repo_fs.readUtf8StrictNoBom` ;
- parser Markdown et YAML avec les règles figées de la release sur le texte déjà décodé ;
- appliquer les profils parser de `ADR-0004` et `ADR-0005` ;
- extraire les anchors supportées ;
- détecter les doublons d’anchors ;
- produire l’index des anchors observées.

API cible :

- `SpecIndex buildSpecIndex(config: Config, fs: RepoFs)`

Structure cible :

```text
SpecIndex {
  observedAnchors: Map<AnchorId, SpecOccurrence>
}

SpecOccurrence {
  anchorId: AnchorId
  specPath: RepoPath
  sourceKind: "markdown" | "yaml"
}
```

Décisions clés :

- tous les YAML découverts sous `spec_roots` doivent être valides, même s’ils n’exposent pas d’anchor ;
- toute spec illisible, non décodable en UTF-8 strict, invalide selon son profil, ou portant une anchor dupliquée provoque `UnsupportedRepoError` ;
- aucune donnée issue des specs n’est persistée.

### 5.4 `ts_graph`

Responsabilités :

- découvrir les `product_files` sous `product_root`, hors `ignore_roots` ;
- lire chaque `product_file` via `repo_fs.readUtf8StrictNoBom` ;
- parser TypeScript avec le parseur figé de la release sur le texte déjà décodé ;
- appliquer le profil parser et le sous-ensemble graphe de `ADR-0006` ;
- extraire les syntaxes supportées et reconnues-hors-support ;
- résoudre les edges selon les règles du contrat ;
- produire le graphe local ;
- produire les diagnostics issus du graphe.

API cible :

- `SortedSet<RepoPath> discoverProductFiles(config: Config, fs: RepoFs)`
- `ProductGraph buildProductGraph(config: Config, fs: RepoFs, productFiles: SortedSet<RepoPath>)`

Structure cible :

```text
ProductGraph {
  productFiles: SortedSet<RepoPath>
  edgesByImporter: Map<RepoPath, SortedSet<RepoPath>>
  graphFindings: Finding[]
}
```

Décisions clés :

- `discoverProductFiles` et `buildProductGraph` utilisent exactement les mêmes règles de périmètre ;
- `discoverProductFiles` ne lit pas le contenu des `product_files` ; la lecture, le décodage strict et le parsing appartiennent à `buildProductGraph` ;
- `buildProductGraph` ouvre, lit, décode strictement et parse tous les `product_files` fournis avant de retourner ;
- les tests d’existence ponctuels requis par la résolution relèvent de `ts_graph` ; tout échec de test produit `UnsupportedRepoError` ;
- le graphe ne contient que des edges supportés ;
- `require("./x")` et `import("./x")` locaux produisent `unsupported_static_edge` et ne produisent jamais d’edge ;
- les imports non relatifs sont ignorés par le graphe et ne produisent pas de finding ;
- un `product_file` illisible, non décodable en UTF-8 strict ou non parsable provoque `UnsupportedRepoError` ;
- `graphFindings` est normalisé, dédupliqué et trié avant retour.

### 5.5 `scan_engine`

Responsabilités :

- combiner config, specs et graphe ;
- calculer l’état de chaque mapping stocké ;
- séparer explicitement vue `observed_anchors` et vue `stored_mappings` ;
- déterminer les mappings exploitables ;
- calculer les fermetures transitives ;
- construire `covering_anchor_ids` ;
- produire les findings métier ;
- fusionner, dédupliquer et trier tous les findings ;
- dériver `analysis_health` ;
- produire le modèle `ScanResult`.

API cible :

- `ScanResult scan(config: Config, specs: SpecIndex, graph: ProductGraph)`

Décisions clés :

- `scan_engine` est pur : aucune I/O, aucune mutation de `anchormap.yaml` ;
- la fermeture est calculée mapping par mapping ;
- `untraced_product_file` n’est produit qu’en analyse `clean`, s’il existe au moins un mapping exploitable, et si toutes les anchors observées ont un mapping exploitable ;
- le tri final des findings est décidé ici, jamais laissé à l’ordre de découverte.

### 5.6 `commands`

Responsabilités :

- parser la CLI ;
- vérifier les préconditions utilisateur propres à chaque commande dès que leurs données d’entrée sont disponibles ;
- orchestrer les modules ;
- choisir le rendu humain ou JSON ;
- posséder l’écriture effective sur `stdout` / `stderr` ;
- garantir le contrat `stdout` / `stderr` de `scan --json` ;
- classer l’issue de la commande en un unique code de sortie.

Décisions clés :

- `commands` est l’unique owner de la conversion `AppError -> exit code` ;
- aucun module sous `commands` ne connaît les codes de sortie ;
- `commands` applique la priorité contractuelle **`4` puis `2` puis `3` puis `1`**, une seule fois, à la frontière du process ;
- dans `map`, toute précondition utilisateur détectable à partir des arguments ou de la config validée est contrôlée avant les opérations dépôt susceptibles de produire le code `3` ;
- `commands` n’écrit jamais `anchormap.yaml` directement : il appelle uniquement `config_io.writeConfigAtomic` ;
- pour `init` et `map`, un retour réussi de `config_io.writeConfigAtomic` vaut commit réussi ; `commands` n’a ensuite aucun chemin non nul autorisé ;
- tout texte humain de succès pour `init` ou `map` est optionnel, best-effort, et ne peut pas rétrograder une commande déjà commitée en échec.

### 5.7 `render`

Responsabilités :

- construire les bytes du JSON canonique pour `scan --json` ;
- construire un texte humain non contractuel pour `init`, `map` et `scan` sans `--json` ;
- ne faire aucun calcul métier ;
- ne jamais effectuer d’I/O directe.

Décisions clés :

- `render` ne trie rien, ne déduplique rien et ne normalise aucun chemin ;
- le JSON est généré à partir d’un modèle déjà trié et normalisé ;
- le JSON canonique est rendu par un encoder custom selon `ADR-0007`, pas par `JSON.stringify` ;
- `render` retourne des bytes ou des strings en mémoire ; `commands` reste seul owner de `stdout` / `stderr` ;
- tout échec de sérialisation d’un `ScanResult` valide remonte comme `InternalError`.

## 6. Modèle de données interne

### 6.1 Types minimum

Types minimum à exposer en interne :

- `AnchorId`
- `RepoPath`
- `Config`
- `Mapping`
- `SpecIndex`
- `ProductGraph`
- `Finding`
- `ScanResult`
- `AppError`

### 6.2 `AnchorId`

- string opaque validée à la frontière d’entrée ;
- aucune logique métier ne manipule une anchor non validée.

### 6.3 `RepoPath`

- chemin relatif à la racine du dépôt ;
- séparateurs POSIX uniquement ;
- jamais de chemin absolu en interne ;
- comparaison binaire, indépendante de la locale ;
- aucune forme alternative équivalente ne doit subsister après normalisation.

### 6.4 `Mapping`

```text
Mapping {
  anchorId: AnchorId
  seedFiles: RepoPath[]
}
```

### 6.5 Vues de sortie dérivées

Le design sépare explicitement les vues imposées par le contrat :

```text
ObservedAnchorView {
  specPath: RepoPath
  mappingState: "absent" | "usable" | "invalid"
}

StoredMappingView {
  state: "usable" | "invalid" | "stale"
  seedFiles: RepoPath[]
  reachedFiles: RepoPath[]
}

FileView {
  coveringAnchorIds: AnchorId[]
  supportedLocalTargets: RepoPath[]
}
```

Cette séparation évite d’écraser l’information des mappings `stale` et interdit toute sémantique cachée entre observation et persistance.
`StoredMappingView.reachedFiles` est écrit directement depuis la fermeture calculée en section 7.6.
`FileView.supportedLocalTargets` est la projection triée, sans autre transformation, des voisins supportés du graphe pour chaque fichier importeur.

### 6.6 `Finding`

```text
Finding {
  kind: FindingKind
  ...normative fields
}
```

Règles :

- aucun champ hors contrat n’est ajouté ;
- le tuple de déduplication est celui du contrat ;
- le tri final suit strictement l’ordre canonique du contrat.

### 6.7 `AppError`

```text
AppError =
  | UsageError
  | ConfigError
  | UnsupportedRepoError
  | WriteError
  | InternalError
```

Règles :

- chaque erreur a exactement un `kind` top-level ;
- les causes internes peuvent être conservées pour le debug, mais ne changent pas le `kind` une fois fixé ;
- une erreur de lecture, d’ouverture, de décodage ou de parsing de `anchormap.yaml` est un `ConfigError` ;
- une erreur de lecture, d’ouverture, de décodage, de parsing ou de test d’existence concernant les specs ou les `product_files` est un `UnsupportedRepoError` ;
- `WriteError` désigne uniquement un échec du chemin d’écriture **avant commit**, après cleanup synchrone du fichier temporaire éventuel ;
- il n’existe pas d’état `WriteError` post-commit dans v1.0.

## 7. Algorithmes cibles

### 7.0 Lecture et décodage normatifs

Toute lecture de contenu consommé suit la même frontière :

1. `repo_fs` ouvre le fichier en octets ;
2. `repo_fs.readUtf8StrictNoBom` décode strictement en UTF-8 ;
3. si le premier caractère décodé est `U+FEFF`, il est retiré ;
4. le module appelant remet uniquement le texte décodé au parseur de profil figé ;
5. le module appelant classe l’échec selon la source : `ConfigError` pour `anchormap.yaml`, `UnsupportedRepoError` pour specs et `product_files`.

Contraintes :

- aucun parseur Markdown, YAML ou TypeScript ne lit directement depuis le système de fichiers ;
- aucun module ne peut appliquer un décodage implicite ou dépendant de la plateforme ;
- le retrait de BOM n’est pas une normalisation générale du contenu : seul un BOM initial unique est ignoré.

### 7.1 Découverte de fichiers

Règle générale :

1. obtenir `RepoRoot` depuis le répertoire courant ;
2. parser et normaliser toutes les racines d’entrée ;
3. parcourir récursivement uniquement :
   - `product_root`, hors `ignore_roots`, pour les `product_files` ;
   - chaque `spec_root` pour les specs ;
4. rejeter immédiatement tout symlink rencontré dans ces sous-arbres ;
5. construire un index des `RepoPath` normalisés ;
6. détecter les collisions de casse sur une projection lowercase stable ;
7. n’utiliser ensuite que des collections triées.

Conséquences :

- aucune exploration récursive hors `product_root` et hors `spec_roots` ;
- les tests ponctuels requis par les préconditions `map --seed` ne découvrent pas de fichiers et restent bornés aux seeds fournis ;
- seuls les tests d’existence ponctuels nécessaires à la résolution des imports peuvent viser des candidats hors `product_root`.

### 7.2 Indexation des specs

Pour chaque spec file trié par chemin :

- lire le fichier via `repo_fs.readUtf8StrictNoBom` ;
- si extension `.md` :
  - parser Markdown sur le texte décodé ;
  - ne considérer que les headings ATX ;
  - extraire le texte normalisé du heading ;
  - détecter une anchor en position initiale ;
- si extension `.yml` ou `.yaml` :
  - parser YAML sur le texte décodé ;
  - exiger single-document et absence de clés dupliquées ;
  - si la racine est un mapping portant une clé `id` exacte avec une valeur valide, créer une occurrence.

Ensuite :

- insérer dans `observedAnchors` ;
- échouer immédiatement si l’anchor est déjà présente.

### 7.3 Découverte des `product_files`

`ts_graph.discoverProductFiles` :

1. parcourt récursivement `product_root`, hors `ignore_roots` ;
2. retient uniquement les fichiers `.ts` admissibles comme `product_file` ;
3. exclut `.d.ts`, `.tsx` et `.js` ;
4. retourne un ensemble trié de `RepoPath`.

`discoverProductFiles` ne lit pas le contenu des fichiers retenus. Toute validation de lisibilité, de décodage strict et de syntaxe TypeScript est faite par `buildProductGraph`.

Cette fonction est la source de vérité partagée pour :

- la validation des `seed_files` de `map` ;
- la construction du graphe ;
- l’index `files` du résultat de scan.

### 7.4 Construction du graphe TypeScript

Pour chaque `product_file` trié :

1. lire le fichier via `repo_fs.readUtf8StrictNoBom` ;
2. parser le texte décodé via le parseur TypeScript figé ;
3. extraire :
   - `ImportDeclaration`
   - `ExportDeclaration`
   - reconnaissance explicite de `require("./x")`
   - reconnaissance explicite de `import("./x")`
4. pour chaque specifier local relatif en chaîne littérale supporté :
   - construire la liste ordonnée de candidats prévue par le contrat ;
   - appliquer la classification ordonnée du contrat ;
5. pour chaque `require("./x")` ou `import("./x")` local reconnu :
   - produire `unsupported_static_edge` ;
   - ne pas passer par la résolution de candidats ;
6. insérer uniquement les edges supportés ;
7. accumuler les findings du graphe ;
8. dédupliquer et trier les edges et findings avant retour.

Choix de design :

- granularité fichier uniquement ;
- aucun symbole, aucune fonction, aucun call graph ;
- aucun cache persistant.

### 7.5 Validation des mappings

Pour chaque mapping stocké trié par `anchor_id` :

1. si l’anchor n’est pas dans `observedAnchors` :
   - état `stale` ;
   - émettre exactement un `stale_mapping_anchor` ;
   - ne pas évaluer les `seed_files` pour des `broken_seed_path` ;
2. sinon, évaluer chaque `seed_file` :
   - vérifier qu’il existe ;
   - vérifier qu’il appartient à `productFiles` ;
   - sinon émettre `broken_seed_path` ;
3. si au moins un `broken_seed_path` a été émis :
   - état `invalid` ;
4. sinon :
   - état `usable`.

En parallèle, pour chaque anchor observée :

- pas de mapping stocké -> `mappingState = absent`
- mapping stocké `usable` -> `mappingState = usable`
- mapping stocké `invalid` ou `stale` -> `mappingState = invalid` uniquement si l’anchor est observée ; un mapping `stale` reste visible uniquement dans `stored_mappings`

### 7.6 Calcul des fermetures

Pour chaque mapping `usable` :

1. initialiser une file FIFO avec ses `seed_files` triés ;
2. exécuter un parcours **BFS déterministe** ;
3. considérer les voisins dans l’ordre trié ;
4. marquer les fichiers atteints une seule fois ;
5. à la fin du parcours, enregistrer l’ensemble atteint dans `StoredMappingView.reachedFiles` ;
6. ajouter `anchor_id` à la couverture de chaque fichier atteint.

Décisions clés :

- le design choisit BFS, pas “BFS ou DFS” ;
- l’ordre de visite ne fuit pas dans le rendu final ;
- `reachedFiles` est figé avant toute projection vers la couverture ;
- `covering_anchor_ids` est trié après accumulation.

### 7.7 Calcul des findings métier

Après calcul des fermetures :

- produire `unmapped_anchor` pour chaque anchor observée à `mappingState = absent` ;
- produire `untraced_product_file` seulement si :
  - l’ensemble final de findings ne contient aucun finding dégradant ;
  - il existe au moins un mapping `usable` ;
  - toutes les anchors observées ont `mappingState = usable` ;
  - le fichier n’est couvert par aucune anchor.

### 7.8 Calcul de `analysis_health`

`analysis_health` est calculé en toute fin, à partir de l’ensemble final et dédupliqué des findings :

- `clean` si aucun finding dégradant n’est présent ;
- `degraded` sinon.

Aucun autre signal n’influence `analysis_health`.

## 8. Chemin d’écriture unique, borné et atomique

Toute écriture de `anchormap.yaml` doit passer exclusivement par `config_io.writeConfigAtomic`.

### 8.1 Cas concernés

Ce chemin unique est utilisé par :

- `anchormap init`
- `anchormap map`

`scan` n’écrit jamais sur disque.

### 8.2 Modèle de phases

`config_io.writeConfigAtomic` sépare explicitement quatre zones :

1. **préparation pure** : construction du modèle canonique et sérialisation en mémoire ;
2. **pre_commit** : création et remplissage du fichier temporaire dédié ; cette zone peut encore échouer avec un code non nul ;
3. **commit** : `rename` atomique du fichier temporaire vers `anchormap.yaml` ;
4. **post_commit réussi** : retour succès immédiat vers `commands`.

Règle structurante :

- avant commit, un code non nul est autorisé si l’état initial a été rétabli ;
- le `rename` réussi est l’unique mutation visible de `anchormap.yaml` ;
- après commit, aucun chemin non nul n’est autorisé pour `init` ou `map`.

### 8.3 Séquence obligatoire de `pre_commit`

`config_io.writeConfigAtomic` exécute exactement la séquence suivante avant commit :

1. construire en mémoire le modèle canonique complet ;
2. sérialiser en UTF-8 sans BOM avec un unique `\n` final ;
3. réserver un chemin temporaire dédié dans le même répertoire que `anchormap.yaml` ;
4. créer ce fichier temporaire en mode exclusif ;
5. écrire tous les octets sérialisés ;
6. vider les buffers du runtime ;
7. `fsync` le fichier temporaire sur les plateformes supportées ;
8. fermer le descripteur du fichier temporaire ;
9. si une étape 3 à 8 échoue, basculer dans le cleanup de la section 8.4 ;
10. exécuter `rename(temp, anchormap.yaml)` comme unique opération de commit.

Contraintes :

- le fichier temporaire est le seul artefact auxiliaire autorisé pour une tentative d’écriture ;
- aucun append, patch partiel, ni réécriture best-effort n’est autorisé ;
- aucun second fichier Derived n’est créé.

### 8.4 Cleanup obligatoire sur échec `pre_commit`

Sur tout échec avant un `rename` réussi, `config_io.writeConfigAtomic` doit :

1. fermer le descripteur temporaire s’il est encore ouvert ;
2. supprimer le fichier temporaire s’il a été créé ;
3. re-vérifier que le chemin temporaire n’existe plus ;
4. seulement ensuite propager `WriteError`.

Règles :

- la fonction n’est pas autorisée à retourner un code non nul tant que l’absence du fichier temporaire dédié n’a pas été rétablie ;
- si le fichier temporaire n’a jamais été créé, aucune étape de cleanup ne touche `anchormap.yaml` ;
- le cleanup appartient entièrement à `config_io` ; aucun autre module n’en est owner.

### 8.5 Frontière de commit

Le commit est défini exactement ainsi :

- le `rename` même-répertoire réussit ;
- `anchormap.yaml` est alors dans son nouvel état canonique ;
- la tentative d’écriture n’a plus de chemin d’échec contractuel.

Conséquences :

- aucune étape de système de fichiers n’est autorisée après un `rename` réussi dans le chemin contractuel de v1.0 ;
- `fsync` du répertoire parent n’appartient pas au chemin contractuel v1.0, car il créerait un état d’échec post-commit incompatible avec la règle `non-zéro => état initial inchangé` ;
- après un retour réussi de `writeConfigAtomic`, `commands` peut au plus produire un texte humain best-effort ; cet affichage ne peut pas changer le code de sortie.

### 8.6 Ownership et sémantique d’échec

- `commands` orchestre l’écriture mais n’édite jamais le fichier lui-même ;
- `config_io` possède à lui seul le format canonique, la séquence `pre_commit / commit`, le cleanup, et la définition opérationnelle de `WriteError` ;
- un `WriteError` signifie exclusivement : **échec avant commit, suivi d’un cleanup réussi** ;
- un commit réussi ne peut pas être reclassé en `WriteError` ou en un autre code non nul.

## 9. Politique d’erreurs et codes de sortie

### 9.1 Types d’erreurs

- `UsageError`
- `ConfigError`
- `UnsupportedRepoError`
- `WriteError`
- `InternalError`

### 9.2 Ownership de la classification

Règles :

- les modules métier produisent des erreurs typées, jamais des codes de sortie ;
- `commands` est l’unique frontière qui convertit un `AppError` en code de sortie ;
- cette conversion est totale et exécutée une seule fois ;
- une erreur déjà typée n’est jamais reclassée par un module inférieur ;
- `config_io` est l’unique module autorisé à produire `WriteError` ;
- `WriteError` ne peut être produit qu’avant commit et après cleanup confirmé.

### 9.3 Priorité contractuelle

Pour respecter le contrat, les handlers de commande doivent suivre cet ordre de décision :

1. **arguments invalides ou précondition utilisateur non satisfaite** -> `UsageError` -> code `4`
2. **config absente ou invalide** -> `ConfigError` -> code `2`
3. **dépôt hors support ou analyse impossible** -> `UnsupportedRepoError` -> code `3`
4. **échec du chemin d’écriture pré-commit après validations** -> `WriteError` -> code `1`
5. **tout autre échec inattendu** -> `InternalError` -> code `1`

Cette séquence matérialise explicitement la priorité **`4` > `2` > `3` > `1`**.

Règle d’application : une précondition utilisateur déjà décidable à partir des arguments ou d’un état validé doit être contrôlée avant de lancer une étape ultérieure susceptible de produire un code moins prioritaire. `commands` ne masque pas une erreur `2` ou `3` déjà produite par un module inférieur, mais il ordonnance les contrôles pour éviter d’exécuter inutilement une lecture dépôt quand un code `4` est déjà certain.

### 9.4 Classification par commande

#### `init`

- parser et valider les arguments ;
- vérifier `create-only` et les préconditions de chemins ;
- construire le `Config` initial canonique ;
- appeler `config_io.writeConfigAtomic` ;
- si cet appel réussit, retourner le chemin de succès ; aucun retour non nul n’est encore autorisé.

#### `map`

- parser et valider les arguments sans I/O :
  - `--anchor` exactement une fois et au format supporté ;
  - au moins un `--seed` ;
  - chaque seed convertible en `RepoPath` ;
  - unicité des seeds après normalisation ;
  - `--replace` sans argument ;
- charger et valider `anchormap.yaml` ;
- vérifier les préconditions décidables depuis la config validée avant toute analyse dépôt :
  - si `mappings[anchor]` existe déjà et que `--replace` est absent, produire `UsageError` ;
  - chaque seed doit être lexicalement sous `product_root` et hors `ignore_roots` ;
  - chaque seed doit avoir une forme admissible de `product_file` (`.ts`, hors `.d.ts`, hors `.tsx`, hors `.js`) ;
  - chaque seed doit exister comme fichier par un test ponctuel borné ; une absence produit `UsageError`, une impossibilité d’effectuer le test produit `UnsupportedRepoError` ;
- indexer les specs courantes ;
- vérifier que l’anchor demandée est présente dans `SpecIndex` ;
- découvrir les `product_files` ;
- vérifier que chaque seed appartient à l’ensemble trié des `product_files` découverts ;
- appeler `ts_graph.buildProductGraph(config, fs, productFiles)` pour effectuer avant commit les lectures, décodages, parsings et tests d’existence requis sur les `product_files` ;
- ignorer le `ProductGraph` pour la construction du YAML ; il ne sert ici qu’à valider que le dépôt produit est lisible et analysable avant commit, et ses findings ne changent pas le code de sortie ;
- construire le nouveau `Config` en remplaçant uniquement `mappings[anchor]` puis en appliquant la forme canonique ;
- appeler `config_io.writeConfigAtomic` ;
- si cet appel réussit, retourner le chemin de succès ; aucun retour non nul n’est encore autorisé.

#### `scan`

- parser et valider les arguments ;
- charger et valider `anchormap.yaml` ;
- construire `SpecIndex` ;
- découvrir les `product_files` et construire `ProductGraph` ;
- exécuter `scan_engine` ;
- construire puis écrire soit le JSON canonique, soit le texte humain.

### 9.5 Règle spécifique aux commandes d’écriture

Pour `init` et `map` :

- toute cause d’échec doit se produire avant un `rename` réussi ;
- après commit, seul un retour succès est autorisé ;
- tout texte humain de succès est hors contrat et ne doit jamais faire échouer la commande.

### 9.6 `scan --json`

`commands` garantit :

- succès (`0`) : JSON sur `stdout`, `stderr` vide ;
- échec (`1`, `2`, `3`, `4`) : `stdout` vide ; `stderr` éventuellement renseigné avec un texte humain hors contrat.

## 10. Testabilité

Le design doit rester testable par module et par frontière stable.

### 10.1 Tests par module

- `repo_fs` : tests sur arborescences temporaires pour symlinks, collisions de casse, ordre stable, normalisation, UTF-8 strict et BOM initial ;
- `config_io` : tests de décodage UTF-8 strict, BOM initial, validation de schéma, golden YAML canonique, et faute injectée sur création temp, écriture, `fsync`, `rename` et cleanup ;
- `spec_index` : fixtures ciblées Markdown/YAML, UTF-8 strict, BOM initial et doublons d’anchors ;
- `ts_graph` : fixtures TS ciblées pour résolution, diagnostics, UTF-8 strict, BOM initial et parse failures ;
- `scan_engine` : tests purs en mémoire sur `SpecIndex`, `ProductGraph` et `Config` synthétiques ;
- `render` : goldens de JSON déjà triés, sans I/O.

### 10.2 Tests de frontière

- intégration `init` : create-only, arguments, YAML minimal canonique, écriture atomique ;
- intégration `map` : création, garde `--replace`, validation des seeds, validation des `product_files` avant commit, réécriture canonique ;
- intégration `scan --json` : goldens byte-for-byte, `stdout`/`stderr`, codes de sortie ;
- tests de faute sur commandes d’écriture : échec injecté à chaque étape `pre_commit` -> code `1`, état initial byte-identique, et absence de fichier temporaire résiduel ;
- tests de priorité `map` : garde `--replace` avant indexation specs/produit, anchor absente avant graphe produit, seed invalide avant graphe produit ;
- tests de non-mutation `map` : `product_file` illisible, non UTF-8 ou non parsable -> code `3`, `anchormap.yaml` byte-identique, aucun fichier temporaire résiduel ;
- test de frontière de commit : après un `rename` réussi, `init` ou `map` ne disposent plus d’aucun chemin non nul ;
- tests métamorphiques : invariance à l’ordre du FS, réordonnancement éditorial du YAML et bruit de specs sans anchor.

### 10.3 Harness de fixtures et observabilité

Le harness de fixtures est un sous-système de développement de premier rang.

Il fournit :

- exécution isolée de fixtures ;
- capture de `stdout`, `stderr` et exit code ;
- comparaison de goldens ;
- détection de mutation filesystem ;
- traces structurées de phase lorsque activées ;
- timings de phase ;
- artefacts d'exécution par run ;
- rapports d'échec lisibles.

Règles :

- le harness échoue avant lancement de la CLI si le manifeste est invalide, si un golden requis manque, ou si une assertion de fixture est impossible ;
- les artefacts de run appartiennent au système de vérification et non au contrat utilisateur, sauf mention explicite contraire ;
- les traces et timings du harness doivent aider au diagnostic sans devenir une source de vérité cachée pour le runtime ;
- l'observabilité du harness doit rendre un échec reproductible et compréhensible pour un humain comme pour un agent.

## 11. Dépendances et reproductibilité

Le build publié doit figer les dépendances qui affectent :

- le parsing TypeScript ;
- le parsing Markdown ;
- le parsing YAML ;
- le parcours du système de fichiers ;
- la sérialisation JSON si une stratégie future remplace `ADR-0007` ;
- l’écriture YAML canonique si une stratégie future remplace `ADR-0007`.

Décisions de design :

- lockfile obligatoire ;
- aucune plage `^` ou `~` sur les dépendances qui touchent au contrat ;
- les pins parser acceptés sont `commonmark@0.30.0` (`ADR-0004`),
  `yaml@2.8.3` (`ADR-0005`) et `typescript@5.4.5` (`ADR-0006`) ;
- tests et goldens rejoués sur la matrice de plateformes supportées ;
- snapshots de golden JSON versionnés dans le dépôt.

## 12. Considérations cross-platform

Le design ne prétend pas au support universel.

Points sensibles :

- casse du système de fichiers ;
- comportement des symlinks ;
- ordre de répertoire ;
- newline et encodage ;
- atomicité effective de `rename` dans un même répertoire ;
- suppression synchrone du fichier temporaire avant retour d’échec ;
- normalisation de chemins.

Règles :

- v1.0 supporte explicitement Linux x86_64 et macOS arm64 ;
- Windows n’est pas revendiqué tant qu’une suite dédiée n’existe pas ;
- tout ordre renvoyé par le FS est traité comme non fiable ;
- toute logique dépendante de la plateforme est concentrée dans `repo_fs` et le backend d’écriture de `config_io` ;
- un backend n’est admissible que s’il fournit un `rename` atomique même-répertoire et permet de supprimer puis re-vérifier l’absence du fichier temporaire sur tout échec `pre_commit` ;
- la durabilité renforcée par `fsync` du répertoire parent après commit est hors chemin contractuel v1.0.

## 13. Complexité et budgets

À granularité fichier, la forme attendue reste linéaire ou quasi linéaire en taille du dépôt inspecté.

Ordres de grandeur attendus :

- découverte : `O(F)`
- parsing TS : `O(total source size)`
- construction du graphe : `O(F + E)`
- fermeture : `O(M * (F + E_reachable))` dans la forme naïve, où `M` est le nombre de mappings `usable`

Pour v1.0, la forme naïve est acceptable tant que les budgets de `evals.md` tiennent sur le corpus cible.

Une optimisation de type mémoïsation de fermeture n’est acceptable que si :

- elle reste purement en mémoire ;
- elle ne modifie pas l’ordre observable ;
- elle ne crée aucune nouvelle source de vérité.

## 14. Décisions explicitement repoussées

Le design v1.0 repousse volontairement :

- plugin system ;
- abstraction multi-langage ;
- support des aliases TypeScript ;
- prise en charge des monorepos ;
- cache persistant ;
- API serveur ;
- historique de scans ;
- suggestion automatique de mappings ;
- mise à jour incrémentale basée sur diff Git ;
- durabilité post-commit renforcée par `fsync` du répertoire parent dans le chemin contractuel d’écriture.

## 15. Structure de dépôt indicative

Une structure de code interne cohérente peut ressembler à :

```text
src/
  cli/
    main.ts
    parse-args.ts
  domain/
    anchor-id.ts
    repo-path.ts
    findings.ts
    scan-result.ts
    errors.ts
  infra/
    repo-fs.ts
    yaml-io.ts
    markdown-parser.ts
    ts-parser.ts
  app/
    load-config.ts
    build-spec-index.ts
    discover-product-files.ts
    build-product-graph.ts
    run-scan.ts
    run-init.ts
    run-map.ts
  render/
    render-json.ts
    render-human.ts
```

Cette structure est illustrative. Elle n’est pas une partie du contrat.

## 16. Résumé du design

Le design v1.0 doit rester lisible par un mainteneur unique.

Le cœur à préserver est :

- petit ;
- déterministe ;
- contract-first ;
- sans heuristique ;
- sans ambiguïté sur la provenance des données ;
- sans promesse plus forte que ce que le moteur calcule réellement ;
- avec un seul chemin d’écriture ;
- avec une frontière explicite `pre_commit / commit` ;
- avec une seule frontière de classification des erreurs.
