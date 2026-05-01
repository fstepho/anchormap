# AnchorMap CLI — evals.md

**Statut**: plan d'évaluation v4 corrigé  
**Portée**: ce document définit les évaluations, corpus, goldens, budgets et gates de release nécessaires pour valider le contrat v1.0 de la CLI.  
**Prévalence**: `contract.md` fixe le comportement observable garanti. Ce document fixe uniquement comment le vérifier. En cas de conflit, `contract.md` prévaut.

## 1. Objectif

Les evals de v1.0 ont quatre buts :

- valider le contrat publié de bout en bout ;
- détecter toute régression fonctionnelle ou de déterminisme ;
- soutenir une release binaire, mesurable et rejouable sur les plateformes supportées ;
- rester strictement limitées au contrat observable, aux budgets de performance et aux gates techniques.

Ce document est **hors scope** pour :

- la valeur produit ;
- la documentation marketing ou de release ;
- les détails d'architecture non nécessaires aux tests ;
- les préférences d'outillage ;
- les optimisations internes non observables.

## 2. Principes non négociables des evals

- **Fail closed** : tout comportement normatif majeur non explicitement couvert par une famille de tests est considéré non couvert.
- **Contract-first** : les oracles portent sur les sorties, effets de fichiers, codes de sortie et états explicitement garantis par `contract.md`.
- **Oracles exacts** : pour `scan --json`, les succès sont validés byte-for-byte ; les échecs sont validés par code de sortie exact et `stdout` vide.
- **Objets fermés** : tout golden valide aussi l'absence de clés hors contrat.
- **Canonique ou échec** : un ordre de clés, de collections ou de findings différent du contrat est un échec.
- **Aucun drift implicite** : une différence de golden n'est jamais acceptée comme “bruit”.
- **Gates binaires** : chaque gate de release a une condition de passage/échec mesurable.
- **Régression permanente** : tout bug confirmé corrigé ajoute un test permanent au corpus.
- **Neutralité d'implémentation** : les evals ne supposent ni module interne, ni algorithme interne particulier, tant que le comportement observable reste conforme au contrat.

## 3. Traçabilité contrat → familles d'évals

| Comportement contractuel à valider | Références du contrat | Familles d'évals obligatoires |
| --- | --- | --- |
| Schéma de `anchormap.yaml`, invariants de chemins, écriture canonique | §§ 7.2–7.5, 9.1, 9.2, 12.1 | A, B-init, B-map, B-config, C2 |
| Profils grammaticaux normatifs Markdown/YAML/TypeScript, décodage UTF-8 strict et BOM initial | § 1.1, §§ 8, 10.5, 12.3 | A, B-decodage, B-specs, B-graph, B-config, D |
| Détection des anchors Markdown/YAML et doublons | § 8 | A, B-specs, B-decodage |
| Échecs de lecture requise, décodage, énumération et classification code `2` / `3` | §§ 8, 10.5, 12.3, 13.8 | B-decodage, B-config, B-specs, B-graph, B-repo, B-map, B-cli |
| Surface CLI, préconditions, codes de sortie et priorité, y compris `scan` sans `--json` | §§ 3.3, 9, 13.8, 13.9 | B-cli |
| Résolution du graphe statique, classification et findings | §§ 10, 11 | B-graph, C5, C6 |
| États des mappings, couverture, `analysis_health` | §§ 6.6–6.9, 9.3, 11, 13.3–13.6 | B-scan, goldens |
| Déterminisme byte-for-byte, ordre canonique, fermeture des objets JSON | §§ 4.1, 4.7, 7.5, 11.6, 12.6, 13.2–13.7 | A, goldens, C1, C7, D |
| Absence de dépendance au réseau, au temps, à Git, à un cache persistant ou aux variables d'environnement comme source de vérité | §§ 4.1, 12.6 | C8, C9, C10, C11, C12 |
| Racine du dépôt et absence de recherche implicite dans les parents | § 12.1 | B-cli |
| Matrice de plateformes supportées | § 12.4 | D |
| Dépendances contractuelles figées | § 1.1 | F |
| Budgets de performance de release | défini par ce document | E |

Aucune famille de tests ne peut être supprimée sans mettre à jour cette matrice.

## 4. Niveaux d'évaluation

### 4.1 Niveau A — Invariants unitaires et oracles purs

Objectif : valider des invariants contractuels isolables sans dépôt complet.

Couverture minimale :

- formats d'`AnchorId` valides et invalides ;
- décodage UTF-8 strict, rejet des octets non décodables et retrait d'un unique BOM initial ;
- application des profils `MARKDOWN_PROFILE`, `YAML_PROFILE` et `TS_PROFILE` dans les cas minimaux contractuels ;
- normalisation et refus des chemins interdits par le contrat ;
- refus des champs inconnus et des clés YAML dupliquées ;
- invariants `seed_files` non vide et sans doublon ;
- ordre canonique des clés JSON et des collections ;
- déduplication et tri canonique des findings ;
- écriture canonique de `anchormap.yaml`, y compris `mappings: {}` ;
- absence de clés JSON hors contrat.

Le niveau A renforce la détection fine, mais ne remplace jamais les fixtures de frontière.

### 4.2 Niveau B — Contract fixtures de frontière

Objectif : vérifier le comportement observable complet sur des dépôts minimaux.

Chaque fixture doit définir exactement :

- l'arborescence du dépôt ;
- le répertoire courant d'exécution ;
- le contenu initial de `anchormap.yaml` si présent ;
- les spec files ;
- les fichiers TypeScript ;
- la commande invoquée ;
- le code de sortie attendu ;
- les effets de fichiers attendus si contractuels ;
- l'oracle `stdout` / `stderr` attendu si contractuel ;
- un golden exact si la commande produit une sortie contractuelle stable.

Règles d'oracle par commande :

- `scan --json` succès : `stdout` == golden exact, `stderr` vide.
- `scan --json` échec (`1`, `2`, `3`, `4`) : `stdout` vide, aucun JSON émis ; `stderr` est ignoré sauf contrainte d'encodage/fin de ligne si le harness le vérifie.
- toute fixture `scan` doit aussi vérifier l'absence de mutation de fichiers dans le dépôt analysé.
- `scan` sans `--json` : le texte humain n'est jamais oraclé ; le code de sortie exact, les préconditions applicables et l'absence de mutation de fichiers sont obligatoires.
- `init` et `map` : seuls le code de sortie, l'effet de fichier, l'absence de fichier temporaire résiduel après échec et la forme canonique écrite sont oraclés.
- toute fixture d'échec de lecture requise doit préciser la source de l'échec (`anchormap.yaml`, spec, `product_file`, énumération ou test d'existence) et vérifier le code `2` ou `3` correspondant.

### 4.3 Niveau C — Tests métamorphiques et d'isolation

Objectif : vérifier des invariants forts qui ne dépendent pas d'un seul exemple figé.

Ces tests doivent prouver que le résultat reste identique lorsque l'on modifie un détail déclaré non pertinent par le contrat, ou qu'il change exactement comme prévu lorsqu'une condition contractuelle bascule.

### 4.4 Niveau D — Matrice cross-platform

Objectif : vérifier la tenue du contrat et du déterminisme sur **toutes** les plateformes supportées.

### 4.5 Niveau E — Performance et ressources

Objectif : vérifier que la release reste dans des budgets explicites et mesurables.

### 4.6 Niveau F — Audit de reproductibilité de release

Objectif : vérifier les préconditions non fonctionnelles d'une release déterministe : dépendances contractuelles figées, absence d'intervalles flottants, lockfile cohérent et corpus de goldens versionné.

Le niveau F ne remplace pas les fixtures comportementales des profils grammaticaux et du décodage. Il vérifie seulement que les versions réellement testées pour parser Markdown, YAML et TypeScript sont celles de la release candidate.

## 5. Corpus minimal obligatoire v1.0

Le corpus ci-dessous est le minimum bloquant pour une release v1.0. Toute régression réelle ajoute une entrée supplémentaire ; aucune entrée existante ne peut être retirée tant que le contrat reste le même.

### 5.1 Famille B-decodage — profils normatifs, UTF-8 strict et BOM

Objectif : couvrir explicitement les règles de décodage et de profils grammaticaux qui bornent toutes les lectures contractuelles. Ces fixtures sont des fixtures de frontière, pas un audit de dépendances.

| Fixture ID | But principal | Exit | Oracles obligatoires |
| --- | --- | ---: | --- |
| `fx00a_decode_config_bom_success` | `anchormap.yaml` valide avec un unique BOM UTF-8 initial | 0 | `scan --json` succès ; golden JSON exact ; BOM absent de la sortie ; chemins et anchors inchangés |
| `fx00b_decode_markdown_bom_success` | spec Markdown avec un unique BOM initial avant un heading ATX valide | 0 | anchor détectée ; golden JSON exact |
| `fx00c_decode_yaml_spec_bom_success` | spec YAML avec un unique BOM initial et `id` racine valide | 0 | anchor détectée ; golden JSON exact |
| `fx00d_decode_product_bom_success` | `product_file` `.ts` avec un unique BOM initial | 0 | graphe et golden JSON identiques au cas sans BOM |
| `fx00e_decode_config_non_utf8` | `anchormap.yaml` contient des octets non UTF-8 | 2 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx00f_decode_markdown_non_utf8` | spec Markdown contient des octets non UTF-8 | 3 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx00g_decode_yaml_spec_non_utf8` | spec YAML contient des octets non UTF-8 | 3 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx00h_decode_product_non_utf8` | `product_file` contient des octets non UTF-8 | 3 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx00i_profile_markdown_commonmark_boundary` | cas limite CommonMark 0.30 distinguant heading ATX supporté et structure non supportée | 0 | seules les anchors attendues sont détectées ; golden JSON exact |
| `fx00j_profile_yaml_1_2_2_boundary` | cas limite YAML 1.2.2 valide et single-document | 0 | traitement conforme au profil ; golden JSON exact |
| `fx00k_profile_ts_5_4_boundary` | cas parsable avec le parser TypeScript piné, `ScriptKind.TS`, objectif `module`, sans JSX | 0 | `supported_local_targets` et findings exacts |
| `fx00l_profile_ts_jsx_rejected_in_ts` | syntaxe JSX dans un `product_file` `.ts` | 3 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx00m_map_decode_spec_non_utf8_no_mutation` | `map` rencontre une spec non UTF-8 pendant l'indexation | 3 | `anchormap.yaml` byte-identique ; aucun fichier temporaire ou auxiliaire résiduel |
| `fx00n_map_decode_product_non_utf8_no_mutation` | `map` rencontre un `product_file` non UTF-8 pendant la validation dépôt | 3 | `anchormap.yaml` byte-identique ; aucun fichier temporaire ou auxiliaire résiduel |
| `fx00o_map_decode_config_non_utf8_no_mutation` | `map` rencontre un `anchormap.yaml` non UTF-8 | 2 | `anchormap.yaml` byte-identique ; aucun fichier temporaire ou auxiliaire résiduel |

### 5.2 Famille B-scan — succès `scan --json` et états essentiels du schéma

| Fixture ID | But principal | Exit | Oracles obligatoires |
| --- | --- | ---: | --- |
| `fx01_scan_min_clean` | cas minimal clean avec un mapping exploitable | 0 | golden JSON exact ; `analysis_health = clean` ; `observed_anchors.mapping_state = usable` ; `stored_mappings.state = usable` ; `findings = []` |
| `fx02_scan_two_anchors_overlap` | plusieurs anchors, fermetures distinctes et recouvrement | 0 | golden JSON exact ; `covering_anchor_ids` triés et exacts |
| `fx03_scan_unmapped_anchor` | anchor observée sans mapping | 0 | golden JSON exact ; `mapping_state = absent` ; finding `unmapped_anchor` ; `analysis_health = clean` |
| `fx04_scan_stale_mapping` | mapping stocké vers anchor absente | 0 | golden JSON exact ; `stored_mappings.state = stale` ; finding `stale_mapping_anchor` ; `analysis_health = degraded` |
| `fx05_scan_broken_seed` | mapping observé mais non exploitable | 0 | golden JSON exact ; `observed_anchors.mapping_state = invalid` ; `stored_mappings.state = invalid` ; findings `broken_seed_path` ; `analysis_health = degraded` |
| `fx06_scan_clean_untraced` | fichiers produit couverts et non couverts en analyse clean avec toutes les anchors mappées | 0 | golden JSON exact ; au moins un `covering_anchor_ids = []` ; aucun finding `unmapped_anchor` ; finding `untraced_product_file` exact |
| `fx06a_scan_unmapped_anchor_suppresses_untraced` | anchor observée sans mapping et fichier non couvert dans une analyse clean | 0 | golden JSON exact ; au moins une anchor observée avec `mapping_state = absent` ; au moins un fichier avec `covering_anchor_ids = []` ; finding `unmapped_anchor` présent ; absence de `untraced_product_file` ; `analysis_health = clean` |
| `fx07_scan_degraded_suppresses_untraced` | même forme logique qu'un cas avec fichier non couvert mais analyse dégradée | 0 | golden JSON exact ; absence de `untraced_product_file` ; `analysis_health = degraded` |
| `fx08_scan_no_untraced_without_usable_mapping` | aucun mapping exploitable | 0 | golden JSON exact ; absence de `untraced_product_file` |
| `fx09_scan_findings_canonical_order` | plusieurs findings de kinds différents | 0 | golden JSON exact ; tri canonique des findings ; ordre canonique des clés |
| `fx10_scan_closed_objects` | fermeture stricte du schéma JSON | 0 | validation exacte des clés racine et des objets fermés ; aucun champ supplémentaire |

Les états essentiels du schéma doivent être explicitement couverts ainsi :

| État essentiel | Couverture minimale |
| --- | --- |
| `observed_anchors.mapping_state = absent` | `fx03_scan_unmapped_anchor` |
| `observed_anchors.mapping_state = usable` | `fx01_scan_min_clean` |
| `observed_anchors.mapping_state = invalid` | `fx05_scan_broken_seed` |
| `stored_mappings.state = usable` | `fx01_scan_min_clean` |
| `stored_mappings.state = invalid` | `fx05_scan_broken_seed` |
| `stored_mappings.state = stale` | `fx04_scan_stale_mapping` |
| `files[].covering_anchor_ids` non vide | `fx01_scan_min_clean` |
| `files[].covering_anchor_ids = []` | `fx06_scan_clean_untraced` ou `fx08_scan_no_untraced_without_usable_mapping` |
| `findings = []` | `fx01_scan_min_clean` |
| `findings` non vide | `fx03` à `fx09` |

### 5.3 Famille B-specs — détection d'anchors et échecs bloquants des specs

| Fixture ID | But principal | Exit | Oracles obligatoires |
| --- | --- | ---: | --- |
| `fx11_specs_markdown_atx_short_id` | heading ATX avec `SHORT_ID` | 0 | anchor détectée dans le golden |
| `fx12_specs_markdown_atx_dotted_id` | heading ATX avec `DOTTED_ID` | 0 | anchor détectée dans le golden |
| `fx13_specs_markdown_suffix_rules` | détection pour `anchor + fin`, `anchor + espace`, `anchor + :`, `anchor + -` | 0 | anchors attendues détectées ; absence de faux positifs |
| `fx14_specs_markdown_setext_ignored` | Setext heading ignoré | 0 | aucune anchor issue du Setext |
| `fx15_specs_markdown_anchor_not_prefix` | anchor non en préfixe du heading | 0 | aucune anchor détectée |
| `fx16_specs_yaml_root_id` | YAML valide avec `id` racine | 0 | anchor détectée |
| `fx17_specs_yaml_nested_id_ignored` | `id` imbriqué | 0 | aucune anchor détectée |
| `fx18_specs_yaml_valid_no_id` | YAML valide sans `id` | 0 | aucune anchor détectée |
| `fx19_specs_duplicate_anchor` | duplicate anchor dans les specs | 3 | `scan --json` échec ; `stdout` vide |
| `fx20_specs_yaml_invalid` | YAML invalide sous `spec_roots` | 3 | `scan --json` échec ; `stdout` vide |
| `fx21_specs_yaml_multidoc` | YAML multi-document sous `spec_roots` | 3 | `scan --json` échec ; `stdout` vide |
| `fx22_specs_yaml_duplicate_keys` | YAML à clés dupliquées sous `spec_roots` | 3 | `scan --json` échec ; `stdout` vide |
| `fx22a_specs_markdown_unreadable` | fichier Markdown requis impossible à ouvrir ou lire | 3 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx22b_specs_markdown_non_utf8` | fichier Markdown requis non décodable en UTF-8 strict | 3 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx22c_specs_markdown_bom_initial` | fichier Markdown avec BOM UTF-8 initial avant heading ATX | 0 | anchor détectée ; golden JSON exact |
| `fx22d_specs_yaml_unreadable` | fichier YAML requis impossible à ouvrir ou lire | 3 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx22e_specs_yaml_non_utf8` | fichier YAML requis non décodable en UTF-8 strict | 3 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx22f_specs_yaml_bom_initial` | fichier YAML avec BOM UTF-8 initial et `id` racine | 0 | anchor détectée ; golden JSON exact |

#### 5.3.1 Fixtures v1.1 planifiées pour formats d'anchors étendus

Ces fixtures planifient les extensions v1.1 définies par `ADR-0013` et
`ADR-0014`. Elles ne font pas partie du gate v1.0 tant que l'extension n'est
pas implémentée et activée.

| Fixture ID | But principal | Exit | Oracles obligatoires |
| --- | --- | ---: | --- |
| `fx22g_specs_repo_native_markdown_ids` | headings ATX avec `TASK_ID`, `MILESTONE_ID`, `SPIKE_ID` et `ADR_ID` | 0 | anchors `T10.6`, `T0.0a`, `M10`, `S5` et `ADR-0012` détectées ; golden JSON exact |
| `fx22h_specs_repo_native_yaml_root_ids` | specs YAML avec `id` racine pour chaque nouveau format documentaire | 0 | anchors documentaires détectées ; golden JSON exact |
| `fx22i_specs_repo_native_rejected_near_misses` | formes proches invalides, dont `t10.6`, `T10`, `T10.6A`, `M10.1`, `S05`, `ADR-12` et `ADR0012` | 0 | aucune anchor issue des formes invalides ; golden JSON exact |
| `fx19a_specs_duplicate_repo_native_anchor` | duplicate anchor documentaire entre specs | 3 | `scan --json` échec ; `stdout` vide |
| `fx22j_specs_screaming_snake_dotted_markdown_ids` | headings ATX avec segments `DOTTED_ID` en `SCREAMING_SNAKE` | 0 | anchors `DOC.README.SECTIONS_MIN`, `OWN.CODEOWNERS.FILE_SIZE_UNDER_3MB` et `REL.PR_TITLE.CONVENTIONAL_COMMITS` détectées ; golden JSON exact |
| `fx22k_specs_screaming_snake_dotted_yaml_root_ids` | specs YAML avec `id` racine utilisant des segments `DOTTED_ID` en `SCREAMING_SNAKE` | 0 | anchors dotted avec underscores détectées ; golden JSON exact |
| `fx22l_specs_screaming_snake_dotted_rejected_near_misses` | formes proches invalides, dont `_DOC.README`, `DOC._README`, `DOC.README_`, `doc.README.SECTIONS_MIN` et `DOC.README.SECTIONS-MIN` en contexte AnchorId entier | 0 | aucune anchor issue des formes invalides dans les contextes où l'AnchorId est la valeur entière ; golden JSON exact |
| `fx19b_specs_duplicate_screaming_snake_dotted_anchor` | duplicate anchor dotted avec underscore entre specs | 3 | `scan --json` échec ; `stdout` vide |

### 5.4 Famille B-graph — graphe statique, résolution et classification

| Fixture ID | But principal | Exit | Oracles obligatoires |
| --- | --- | ---: | --- |
| `fx23_graph_import_relative_ts` | import relatif supporté | 0 | golden JSON exact ; couverture conforme |
| `fx24_graph_import_type` | `import type` supporté | 0 | golden JSON exact ; edge local pris en compte |
| `fx25_graph_import_side_effect` | `import "./x"` supporté | 0 | golden JSON exact |
| `fx26_graph_reexport` | `export ... from` supporté | 0 | golden JSON exact |
| `fx27_graph_resolution_ts_over_index` | `<path>.ts` prioritaire sur `<path>/index.ts` | 0 | golden JSON exact ; cible retenue conforme |
| `fx28_graph_resolution_index_fallback` | fallback sur `index.ts` | 0 | golden JSON exact |
| `fx29_graph_unresolved_static_edge` | aucun candidat valide | 0 | finding `unresolved_static_edge` exact ; `analysis_health = degraded` |
| `fx30_graph_out_of_scope_static_edge` | cible existante hors `product_root` ou sous `ignore_roots` | 0 | finding `out_of_scope_static_edge` exact ; `target_path` exact |
| `fx31_graph_unsupported_local_target` | cible locale existante en `.tsx` / `.js` / `.d.ts` | 0 | finding `unsupported_local_target` exact ; `target_path` exact |
| `fx32_graph_require_local` | `require("./x")` local reconnu hors support | 0 | finding `unsupported_static_edge` avec `syntax_kind = require_call` |
| `fx33_graph_dynamic_import_local` | `import("./x")` local reconnu hors support | 0 | finding `unsupported_static_edge` avec `syntax_kind = dynamic_import` |
| `fx34_graph_non_relative_import_ignored` | import non relatif traité comme externe | 0 | aucun edge local ajouté ; aucun finding lié à cet import |
| `fx35_graph_duplicate_findings_dedup` | deux occurrences produisant le même finding | 0 | un seul finding final après déduplication |
| `fx36_graph_cycle` | cycle de dépendances supporté | 0 | fermeture exacte ; pas de boucle infinie ; golden stable |
| `fx37_graph_parse_failure` | `product_file` non parsable selon `TS_PROFILE` | 3 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx38_graph_outside_repo_root_candidate` | candidat calculé hors racine du dépôt | 0 | comportement conforme à “inexistant” selon la règle de résolution |
| `fx38a_graph_product_file_unreadable` | `product_file` requis impossible à ouvrir ou lire | 3 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx38b_graph_product_file_non_utf8` | `product_file` requis non décodable en UTF-8 strict | 3 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx38c_graph_product_file_bom_initial` | `product_file` `.ts` avec BOM UTF-8 initial | 0 | golden JSON identique au cas sans BOM |
| `fx38d_graph_ts_profile_jsx_rejected` | JSX dans un fichier `.ts` sous `TS_PROFILE` sans JSX | 3 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx38e_graph_required_existence_test_failure` | test d'existence ponctuel requis impossible pour un candidat de résolution | 3 | `scan --json` échec ; `stdout` vide ; aucun JSON |

#### 5.4.1 Fixtures v1.1 planifiées pour specifiers `.js` ESM

Ces fixtures planifient l'extension v1.1 définie par `ADR-0012`. Elles ne font
pas partie du gate v1.0 tant que l'extension n'est pas implémentée et activée.

| Fixture ID | But principal | Exit | Oracles obligatoires |
| --- | --- | ---: | --- |
| `fx38f_graph_js_specifier_to_ts_source` | `import "./dep.js"` retient `dep.ts` | 0 | golden JSON exact ; `supported_local_targets = ["src/dep.ts"]` ; aucun finding pour `dep.js` |
| `fx38g_graph_js_specifier_reexport_to_ts_source` | `export ... from "./dep.js"` retient `dep.ts` | 0 | golden JSON exact ; edge local pris en compte pour les formes de re-export supportées |
| `fx38h_graph_js_specifier_explicit_index_source` | `import "./lib/index.js"` retient `lib/index.ts` | 0 | golden JSON exact ; aucun fallback implicite vers `lib.ts` ou `lib/index.js` |
| `fx38i_graph_js_specifier_ts_source_wins_over_js` | `dep.ts` et `dep.js` existent tous les deux | 0 | golden JSON exact ; `dep.ts` est la cible supportée ; aucun `unsupported_local_target` pour `dep.js` |
| `fx38j_graph_js_specifier_exact_js_without_ts` | seul `dep.js` existe pour un specifier `.js` | 0 | finding `unsupported_local_target` exact avec `target_path = "src/dep.js"` ; `analysis_health = degraded` |
| `fx38k_graph_js_specifier_unresolved` | aucun candidat `.ts` ou `.js` n'existe | 0 | finding `unresolved_static_edge` exact avec `specifier = "./dep.js"` ; `analysis_health = degraded` |
| `fx38l_graph_js_specifier_source_out_of_scope` | la source `.ts` jumelle existe hors `product_root` ou sous `ignore_roots` | 0 | finding `out_of_scope_static_edge` exact ; la cible `.js` ne masque pas la priorité out-of-scope |

### 5.5 Famille B-repo — limites de support du dépôt et découverte

| Fixture ID | But principal | Exit | Oracles obligatoires |
| --- | --- | ---: | --- |
| `fx39_repo_case_collision_in_scope` | collision de casse dans un sous-arbre inspecté | 3 | `scan --json` échec ; `stdout` vide |
| `fx40_repo_symlink_in_scope` | symlink dans un sous-arbre inspecté | 3 | `scan --json` échec ; `stdout` vide |
| `fx41_repo_noise_outside_scope_ignored` | bruit hors `product_root` et hors `spec_roots` | 0 | golden JSON identique au cas sans bruit |
| `fx42_repo_no_parent_search_for_config` | `scan` ou `map` lancé dans un sous-répertoire sans `./anchormap.yaml`, mais avec un parent qui en contient un | 2 | échec config ; absence de recherche implicite |
| `fx42a_repo_product_root_enumeration_failure` | impossibilité d'énumérer récursivement `product_root` | 3 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx42b_repo_spec_root_enumeration_failure` | impossibilité d'énumérer récursivement un `spec_root` | 3 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx42c_repo_noncanonical_path_in_scope` | chemin découvert en scope non représentable comme `RepoPath` canonique | 3 | `scan --json` échec ; `stdout` vide ; aucun JSON |

### 5.6 Famille B-config — validation stricte de `anchormap.yaml`

| Fixture ID | But principal | Exit | Oracles obligatoires |
| --- | --- | ---: | --- |
| `fx43_config_missing_file` | config absente | 2 | `scan --json` échec ; `stdout` vide |
| `fx43a_config_unreadable_file` | `anchormap.yaml` impossible à ouvrir ou lire | 2 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx43b_config_non_utf8` | `anchormap.yaml` non décodable en UTF-8 strict | 2 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx43c_config_yaml_invalid` | `anchormap.yaml` YAML invalide | 2 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx43d_config_yaml_multidoc` | `anchormap.yaml` multi-document | 2 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx43e_config_root_not_mapping` | document racine de `anchormap.yaml` non mapping | 2 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx43f_config_duplicate_keys` | `anchormap.yaml` avec clés dupliquées | 2 | `scan --json` échec ; `stdout` vide ; aucun JSON |
| `fx43g_config_bom_initial_success` | `anchormap.yaml` valide avec BOM UTF-8 initial | 0 | `scan --json` succès ; golden JSON exact ; BOM absent de `stdout` |
| `fx44_config_invalid_schema` | schéma invalide | 2 | `scan --json` échec ; `stdout` vide |
| `fx45_config_unknown_field` | champ inconnu | 2 | `scan --json` échec ; `stdout` vide |
| `fx46_config_version_not_1` | `version != 1` | 2 | `scan --json` échec ; `stdout` vide |
| `fx47_config_empty_spec_roots` | `spec_roots` vide | 2 | `scan --json` échec ; `stdout` vide |
| `fx48_config_seed_files_empty` | `seed_files` vide | 2 | `scan --json` échec ; `stdout` vide |
| `fx49_config_seed_files_duplicated` | `seed_files` dupliqués | 2 | `scan --json` échec ; `stdout` vide |
| `fx50_config_absolute_path` | chemin absolu | 2 | `scan --json` échec ; `stdout` vide |
| `fx51_config_dotdot_path` | chemin avec `..` | 2 | `scan --json` échec ; `stdout` vide |
| `fx52_config_roots_overlap` | `spec_roots` ou `ignore_roots` dupliqués/chevauchants | 2 | `scan --json` échec ; `stdout` vide |
| `fx53_config_ignore_root_outside_product_root` | `ignore_root` existant hors `product_root` | 2 | `scan --json` échec ; `stdout` vide |

#### 5.6.1 Fixtures v1.1 planifiées pour anchors documentaires en config

Ces fixtures planifient les extensions v1.1 définies par `ADR-0013` et
`ADR-0014`. Elles ne font pas partie du gate v1.0 tant que l'extension n'est
pas implémentée et activée.

| Fixture ID | But principal | Exit | Oracles obligatoires |
| --- | --- | ---: | --- |
| `fx49a_config_mapping_repo_native_anchor_keys` | `mappings` accepte les nouveaux formats documentaires comme clés | 0 | golden JSON exact ; mappings valides visibles et triés canoniquement |
| `fx49b_config_mapping_screaming_snake_dotted_anchor_keys` | `mappings` accepte les anchors dotted avec segments `SCREAMING_SNAKE` comme clés | 0 | golden JSON exact ; mappings valides visibles et triés canoniquement |

### 5.7 Famille B-init / B-map — commandes d'écriture et effets de fichier

| Fixture ID | But principal | Exit | Oracles obligatoires |
| --- | --- | ---: | --- |
| `fx54_init_success_minimal` | `init` minimal réussi | 0 | `anchormap.yaml` écrit en forme canonique exacte ; `mappings: {}` présent ; pas de donnée dérivée |
| `fx55_init_create_only` | `init` échoue si `anchormap.yaml` existe déjà | 4 | aucun changement de fichier |
| `fx56_init_invalid_args` | arguments invalides de `init` | 4 | aucun fichier écrit |
| `fx57_init_missing_required_dirs` | `product_root` ou `spec_root` absent | 4 | aucun fichier écrit |
| `fx58_init_duplicate_normalized_roots` | `--spec-root` ou `--ignore-root` dupliqué après normalisation | 4 | aucun fichier écrit |
| `fx58a_init_option_order_invariant` | permutation de l'ordre des options supportées de `init` | 0 | même YAML canonique exact |
| `fx59_map_create` | création d'un mapping valide | 0 | YAML canonique exact ; nouveau mapping présent |
| `fx60_map_replace_guard` | mapping existant sans `--replace` | 4 | aucun changement de fichier |
| `fx61_map_replace_ok` | remplacement explicite avec `--replace` | 0 | YAML canonique exact ; mapping remplacé uniquement |
| `fx62_map_replace_create_if_absent` | `--replace` avec mapping absent crée le mapping | 0 | YAML canonique exact |
| `fx63_map_invalid_anchor_argument` | `--anchor` au mauvais format | 4 | aucun changement de fichier |
| `fx64_map_anchor_not_observed` | anchor absente des specs courantes | 4 | aucun changement de fichier |
| `fx65_map_invalid_seed` | seed absent, hors scope ou non admissible | 4 | aucun changement de fichier |
| `fx66_map_duplicate_seed_argument` | `--seed` dupliqué après normalisation | 4 | aucun changement de fichier |
| `fx67_map_option_order_invariant` | permutation des options de `map` | 0 ou 4 selon le cas | résultat et YAML final identiques |
| `fx67a_map_config_missing_or_invalid_code2` | `map` avec `anchormap.yaml` absent, illisible, non UTF-8 ou invalide | 2 | `anchormap.yaml` absent ou byte-identique ; aucun fichier temporaire ou auxiliaire résiduel |
| `fx67b_map_spec_read_or_decode_failure_code3` | `map` avec spec illisible ou non UTF-8 pendant l'indexation | 3 | `anchormap.yaml` byte-identique ; aucun fichier temporaire ou auxiliaire résiduel |
| `fx67c_map_product_read_decode_or_parse_failure_code3` | `map` avec `product_file` illisible, non UTF-8 ou non parsable pendant la validation | 3 | `anchormap.yaml` byte-identique ; aucun fichier temporaire ou auxiliaire résiduel |
| `fx67d_map_required_existence_test_failure_code3` | `map` avec test d'existence ponctuel requis impossible | 3 | `anchormap.yaml` byte-identique ; aucun fichier temporaire ou auxiliaire résiduel |

#### 5.7.1 Fixtures v1.1 planifiées pour `map` et anchors documentaires

Ces fixtures planifient les extensions v1.1 définies par `ADR-0013` et
`ADR-0014`. Elles ne font pas partie du gate v1.0 tant que l'extension n'est
pas implémentée et activée.

| Fixture ID | But principal | Exit | Oracles obligatoires |
| --- | --- | ---: | --- |
| `fx59a_map_create_repo_native_anchor_mapping` | `map` crée un mapping pour une anchor documentaire observée | 0 | `anchormap.yaml` final exact ; clé documentaire triée canoniquement |
| `fx63a_map_invalid_repo_native_anchor_near_miss` | `--anchor` rejette les formes proches invalides | 4 | aucun changement de fichier |
| `fx64a_map_repo_native_anchor_not_observed` | anchor documentaire valide mais absente des specs courantes | 4 | aucun changement de fichier |
| `fx59b_map_create_screaming_snake_dotted_anchor_mapping` | `map` crée un mapping pour une anchor dotted avec underscore observée | 0 | `anchormap.yaml` final exact ; clé dotted triée canoniquement |
| `fx63b_map_invalid_screaming_snake_dotted_anchor_near_miss` | `--anchor` rejette les formes dotted proches invalides | 4 | aucun changement de fichier |
| `fx64b_map_screaming_snake_dotted_anchor_not_observed` | anchor dotted avec underscore valide mais absente des specs courantes | 4 | aucun changement de fichier |

### 5.8 Famille B-cli — surface CLI, échecs machine et priorité des codes

| Fixture ID | But principal | Exit | Oracles obligatoires |
| --- | --- | ---: | --- |
| `fx68_cli_unknown_command` | commande inconnue | 4 | si `scan --json` est concerné : `stdout` vide |
| `fx69_cli_unknown_option` | option inconnue | 4 | si `scan --json` est concerné : `stdout` vide |
| `fx70_cli_invalid_option_combination` | combinaison d'options non supportée | 4 | si `scan --json` est concerné : `stdout` vide |
| `fx71_cli_scan_option_order_invariant` | permutation des options supportées de `scan --json` | 0 | JSON byte-identique |
| `fx71a_cli_scan_human_success` | `anchormap scan` sans `--json` sur dépôt valide | 0 | code exact ; absence de mutation ; `stdout`/`stderr` humains non oraclés |
| `fx71b_cli_scan_human_config_error_code2` | `anchormap scan` sans `--json` avec config absente ou invalide | 2 | code exact ; absence de mutation ; `stdout`/`stderr` humains non oraclés |
| `fx71c_cli_scan_human_repo_error_code3` | `anchormap scan` sans `--json` avec dépôt hors support ou lecture requise impossible | 3 | code exact ; absence de mutation ; `stdout`/`stderr` humains non oraclés |
| `fx71d_cli_scan_human_invalid_args_code4` | `anchormap scan` sans `--json` avec option ou combinaison non supportée | 4 | code exact ; absence de mutation ; `stdout`/`stderr` humains non oraclés |
| `fx71e_cli_scan_human_internal_error_code1` | `anchormap scan` sans `--json` avec erreur interne déterministe injectée après préconditions | 1 | code exact ; absence de mutation ; `stdout`/`stderr` humains non oraclés |
| `fx72_cli_priority_4_over_2` | arguments invalides + config absente/invalide | 4 | priorité exacte `4 > 2` |
| `fx73_cli_priority_2_over_3` | config invalide + dépôt hors support | 2 | priorité exacte `2 > 3` |
| `fx74_cli_priority_3_over_1` | dépôt hors support + erreur interne injectée après classification précédente | 3 | priorité exacte `3 > 1` |
| `fx75_cli_internal_error_code_1` | erreur interne déterministe sans argument invalide, sans config invalide, sans dépôt hors support | 1 | `scan --json` : `stdout` vide ; aucun JSON ; classification exacte |
| `fx76_cli_write_failure_code_1` | échec d'écriture atomique sur `init` ou `map` | 1 | absence de fichier partiel ; absence de mutation partielle ; code exact |

Notes obligatoires pour la famille B-cli :

- `fx74_cli_priority_3_over_1` et `fx75_cli_internal_error_code_1` peuvent utiliser un harness de faute **test-only** ou un backend de système de fichiers de test, à condition que l'oracle porte uniquement sur le comportement contractuel observable.
- L'existence d'un chemin testable vers le code `1` est obligatoire ; un contrat exposant `1` sans éval dédiée n'est pas suffisant.

## 6. Goldens et oracles exacts

### 6.1 Goldens JSON obligatoires

Chaque fixture de succès `scan --json` doit avoir un golden exact versionné qui valide simultanément :

- encodage UTF-8 ;
- fin de ligne unique `\n` ;
- ordre canonique des clés racine ;
- ordre canonique des clés dans les objets imbriqués ;
- tri canonique de `observed_anchors`, `stored_mappings`, `files`, `seed_files`, `covering_anchor_ids` et `findings` ;
- fermeture stricte des objets ;
- absence de clés supplémentaires ;
- normalisation POSIX des chemins.

### 6.2 Goldens YAML obligatoires

Les écritures de `init` et `map` qui réussissent doivent avoir des goldens exacts de `anchormap.yaml` validant :

- encodage UTF-8 ;
- fin de ligne unique `\n` ;
- ordre top-level exact ;
- omission de `ignore_roots` si vide ;
- présence obligatoire de `mappings`, y compris `mappings: {}` ;
- tri lexicographique de `spec_roots`, `ignore_roots`, des anchors et des `seed_files` ;
- non-préservation des commentaires ou du formatage source comme propriété non contractuelle.

### 6.3 Stabilité des goldens

Une stratégie de goldens n'est recevable que si sa stabilité est explicite. Pour v1.0 :

- tout golden est versionné dans le dépôt ;
- toute différence de golden échoue en CI et bloque la release tant qu'elle n'est pas classée ;
- un golden ne peut être mis à jour que dans l'un des cas suivants :
  1. correction d'une fixture incorrecte ;
  2. correction d'un bug avéré ;
  3. changement volontaire du contrat, documenté dans `contract.md`, avec mise à jour synchrone du corpus ;
- en dehors de ces cas, la différence est une régression.

## 7. Politique de régression

Toute régression confirmée doit être classée dans exactement une de ces catégories :

- bug d'implémentation ;
- ambiguïté du contrat ;
- fixture incorrecte ;
- changement volontaire de contrat.

Règles :

- un bug corrigé ajoute une fixture de frontière ou un test d'invariant permanent ;
- une ambiguïté du contrat impose une mise à jour explicite de `contract.md` avant acceptation des nouveaux goldens ;
- une fixture incorrecte est corrigée avec justification écrite ;
- un changement volontaire de contrat met à jour dans le même changement : le contrat, les goldens affectés, la matrice de traçabilité et les gates si nécessaire.

Aucun “expected drift” n'est accepté pour `scan --json` ou pour le YAML canonique.

## 8. Tests métamorphiques et d'isolation obligatoires

Les tests suivants sont obligatoires et bloquants.

### 8.1 C1 — Invariance à l'ordre du système de fichiers

Même dépôt logique, ordre de découverte différent :

- même code de sortie ;
- même JSON byte-for-byte ;
- même YAML canonique après `map` ou `init` si l'écriture intervient.

### 8.2 C2 — Invariance au réordonnancement éditorial du YAML

Même sémantique de `anchormap.yaml`, clés et listes réordonnées manuellement avant lecture :

- même résultat sémantique à `scan --json` ;
- après `map`, YAML canonique byte-identique au golden.

### 8.3 C3 — Invariance au bruit de spec sans anchor

Ajouter :

- du texte libre dans un `.md` ;
- un heading sans anchor ;
- un YAML valide sans `id` racine.

Oracle :

- aucune nouvelle anchor ;
- même couverture ;
- même `analysis_health` ;
- mêmes findings, hors ceux explicitement liés au bruit si le contrat en prévoit un, ce qui n'est pas le cas en v1.0.

### 8.4 C4 — Déplacement contrôlé d'un `seed_file`

Déplacer ou supprimer un seed sans mettre à jour `anchormap.yaml` :

- apparition de `broken_seed_path` ;
- absence de mutation silencieuse du mapping ;
- `analysis_health = degraded` ;
- absence d'`untraced_product_file` si l'analyse devient dégradée.

### 8.5 C5 — Ajout d'imports externes

Ajouter un import non relatif :

- aucun edge local supplémentaire ;
- aucun finding dégradant lié à cet import ;
- aucune variation du reste du JSON.

### 8.6 C6 — Conversion en extension non supportée

Remplacer une cible locale supportée par une cible locale existante non supportée :

- disparition de l'edge supporté ;
- apparition de `unsupported_local_target` exact ;
- passage éventuel à `analysis_health = degraded` conformément au contrat.

### 8.7 C7 — Reruns déterministes

Pour chaque fixture de succès `scan --json` :

- exécuter 20 reruns en processus séparés ;
- exiger 20 sorties `stdout` byte-identiques ;
- exiger `stderr` vide à chaque exécution.

### 8.8 C8 — Indépendance à la locale

Exécuter un sous-ensemble représentatif du corpus sous au moins :

- `LC_ALL=C`
- une locale UTF-8 non triviale

Oracle :

- mêmes sorties JSON et YAML byte-for-byte ;
- même ordre des findings et des chemins.

### 8.9 C9 — Indépendance à Git

Même dépôt logique avec et sans métadonnées Git, ou avec des métadonnées Git différentes :

- même code de sortie ;
- même JSON byte-for-byte ;
- même YAML écrit.

### 8.10 C10 — Indépendance au temps et au fuseau

Même dépôt logique avec date système ou fuseau différents :

- même code de sortie ;
- même JSON byte-for-byte ;
- même YAML écrit.

### 8.11 C11 — Aucune dépendance réseau ou variable d'environnement comme source de vérité

Deux sous-tests obligatoires :

1. exécuter `scan --json` avec réseau bloqué ;
2. exécuter le même corpus avec des variables d'environnement non contractuelles modifiées.

Oracle :

- aucune variation de résultat ;
- aucune tentative réseau requise pour le succès.

### 8.12 C12 — Absence de cache persistant et d'écriture par `scan`

Exécuter un sous-ensemble représentatif du corpus `scan` dans un environnement où :

- le dépôt est surveillé avant et après exécution ;
- les répertoires de cache usuels exposés au process sont initialement vides ou sandboxés.

Oracle :

- aucune mutation de fichier dans le dépôt ;
- aucune création de cache persistant nécessaire au succès ;
- le second run produit le même résultat byte-for-byte sans dépendre d'un artefact laissé par le premier.

## 9. Matrice cross-platform obligatoire

### 9.1 Plateformes supportées

La release v1.0 revendique exactement la matrice suivante :

- Linux x86_64
- macOS arm64

Aucune autre plateforme n'est couverte par ce plan comme garantie contractuelle v1.0.

### 9.2 Suite obligatoire par plateforme

Sur **chaque** plateforme supportée, la release candidate doit exécuter :

- 100% des fixtures de niveau B ;
- 100% des tests métamorphiques C1 à C12 ;
- 100% des goldens JSON ;
- 100% des goldens YAML ;
- la campagne de reruns déterministes C7.

### 9.3 Oracle cross-platform

La release passe la couverture cross-platform seulement si, sur chaque plateforme supportée :

- toutes les fixtures passent ;
- tous les goldens JSON et YAML sont byte-identiques à la version de référence ;
- aucune divergence de tri, de chemin, de newline, d'encodage ou de code de sortie n'apparaît.

Une divergence de golden entre plateformes supportées bloque la release.

## 10. Performance et ressources

### 10.1 Protocole de mesure

Les budgets de performance sont valides seulement s'ils sont mesurés selon un protocole explicite et rejouable.

Protocole obligatoire :

- build de release ;
- machine de référence documentée par plateforme supportée ;
- corpus de bench versionné ;
- 5 warm-up runs non comptés ;
- 30 runs mesurés en processus séparés ;
- temps mesuré en wall-clock de lancement à sortie du process ;
- rapport du `p95` sur les 30 runs ;
- mémoire mesurée en pic RSS du process ;
- aucune instrumentation qui change le comportement de la CLI ;
- machine sans charge concurrente significative non documentée.

Les résultats doivent être conservés comme artefacts de release.

### 10.2 Budgets de release v1.0

#### Benchmark `small`

Corpus :

- 200 `product_files`
- 50 anchors observées
- 1 500 edges supportés

Gate :

- `scan --json` `p95 <= 400 ms`
- pic RSS `<= 120 MiB`

#### Benchmark `medium`

Corpus :

- 1 000 `product_files`
- 200 anchors observées
- 8 000 edges supportés

Gate :

- `scan --json` `p95 <= 2,0 s`
- pic RSS `<= 300 MiB`

#### Benchmark `large`

Corpus :

- 5 000 `product_files`
- 500 anchors observées
- 40 000 edges supportés

Statut :

- benchmark **informationnel uniquement** ;
- exécuté et archivé pour suivi de tendance ;
- **hors gate de release v1.0**.

Le benchmark `large` ne participe jamais au verdict pass/fail d'une release v1.0.

## 11. Gates de release

Une release v1.0 est acceptée **uniquement** si toutes les gates suivantes passent.

### Gate A — Couverture du contrat observable

Passe si et seulement si :

- 100% des fixtures de niveau B passent, y compris B-decodage, B-config, B-specs, B-graph, B-repo, B-init/B-map et B-cli ;
- chaque fixture valide exactement son oracle déclaré ;
- aucun comportement revendiqué par la matrice de traçabilité n'est sans famille d'évals explicite.

### Gate B — Schéma machine, goldens et ordre canonique

Passe si et seulement si :

- 100% des goldens JSON passent byte-for-byte ;
- 100% des goldens YAML passent byte-for-byte ;
- aucun champ hors contrat n'est présent ;
- toutes les fermetures d'objets JSON sont respectées ;
- tous les cas d'échec `scan --json` vérifient `stdout` vide et absence de JSON.

### Gate C — Codes de sortie, préconditions et priorité

Passe si et seulement si :

- toutes les fixtures B-cli, y compris les fixtures explicites de priorité et les formes `scan` avec et sans `--json`, passent ;
- les codes `0`, `1`, `2`, `3`, `4` sont chacun couverts par au moins une éval dédiée ;
- `anchormap scan` sans `--json` est couvert en succès et en échecs `1`, `2`, `3`, `4` sans oracle sur le texte humain ;
- la priorité `4 > 2 > 3 > 1` est validée par les fixtures `fx72` à `fx75` ;
- la surface CLI supportée est vérifiée : commandes inconnues, options inconnues et combinaisons non supportées échouent avec le code `4`.

### Gate D — Déterminisme et isolation

Passe si et seulement si :

- tous les tests C1 à C12 passent ;
- tous les reruns déterministes C7 sont byte-identiques ;
- aucune dépendance à la locale, à Git, au temps, au réseau, à un cache persistant ou à des variables d'environnement comme source de vérité n'est observée.

### Gate E — Cross-platform

Passe si et seulement si :

- la suite obligatoire de la section 9.2 passe sur Linux x86_64 ;
- la suite obligatoire de la section 9.2 passe sur macOS arm64 ;
- aucune divergence cross-platform n'apparaît.

### Gate F — Performance

Passe si et seulement si :

- le benchmark `small` respecte ses deux budgets ;
- le benchmark `medium` respecte ses deux budgets ;
- les mesures sont produites selon le protocole de la section 10.1 ;
- le benchmark `large` est archivé mais n'entre pas dans le verdict.

### Gate G — Reproductibilité de release

Passe si et seulement si :

- les dépendances qui affectent parsing TypeScript, parsing Markdown, parsing YAML, énumération de fichiers, sérialisation JSON et écriture YAML canonique sont figées ;
- aucun intervalle semver flottant n'est publié pour ces dépendances contractuelles ;
- le lockfile est présent, versionné, cohérent avec les dépendances figées et correspond à la release candidate testée ;
- le corpus de goldens versionné correspond à la release candidate testée ;
- l'audit échoue si une dépendance contractuelle est résolue par plage flottante, lockfile absent, lockfile désynchronisé, ou golden non versionné.

## 12. Checklist de publication technique

La checklist suivante ne remplace pas les gates ; elle sépare les preuves
obligatoires du verdict T9.6/M9 des preuves de publication produites ensuite
en M10. Le verdict T9.6/M9 doit rester exécutable avant les artefacts T10.2,
T10.5 et T10.6. L'absence de preuve T10 doit rester `pending` ou
`not_applicable`, jamais un échec du verdict M9.

Preuves obligatoires pour le verdict T9.6/M9 :

- matrice supportée explicitée ;
- rapport de résultats des fixtures B archivé, avec statut séparé pour B-decodage et B-cli ;
- rapport des tests C archivé ;
- rapports cross-platform archivés pour Linux x86_64 et macOS arm64 ;
- résultats de performance `small`, `medium` et `large` archivés ;
- audit des dépendances contractuelles archivé ;
- liste des goldens modifiés depuis la release précédente archivée avec classification de chaque diff ;
- revue d'entropie T9.7 archivée, sans drift bloquant ou non classifié restant.

Preuves de publication M10 représentées lorsqu'elles sont présentes :

Le verdict T9.6/M9 ne réalise qu'un contrôle de cohérence minimal sur les
preuves T10 fournies : identité/version du paquet sélectionné par `ADR-0009`.
La preuve complète de fermeture runtime, de contenu du tarball, de lockback
consommateur, d'installation depuis l'artefact, de correspondance entre
artefacts T10.5/T10.6 et de publication appartient aux tâches T10.2, T10.3,
T10.5 et T10.6, pas au verdict M9.

- preuve de lockback consommateur archivée pour le paquet publié, incluant
  `npm-shrinkwrap.json` ou le mécanisme équivalent sélectionné par `ADR-0009`
  et montrant que la fermeture transitive runtime installée par un consommateur
  public correspond au candidat Gate G/M9 ;
- rapport d'artefact T10.5 archivé pour un tarball nommé produit par `npm pack`
  ou l'équivalent sélectionné par `ADR-0009`, avec nom du fichier, version,
  fichiers inclus conformes à la allowlist fermée d'`ADR-0009`, `integrity`
  npm, `shasum` npm et SHA-256 recalculé depuis le fichier tarball ;
- dry-run de publication T10.5 archivé comme preuve supplémentaire, sans
  remplacer le tarball réutilisable ni sa preuve SHA-256, et exécuté sur le
  même tarball nommé que les preuves d'artefact.

Preuve post-publication attendue après publication :

- preuve de publication T10.6 archivée avec coordonnée finale, `dist.integrity`,
  `dist.shasum`, SHA-256, lien vers le rapport d'artefact T10.5 et résultat de
  vérification d'installation post-publication ;
- lorsque T10.6 publie le tarball validé par T10.5, `dist.integrity`,
  `dist.shasum`, SHA-256 et version doivent correspondre au rapport d'artefact
  T10.5 archivé ;
- si T10.6 régénère un tarball, cette preuve inclut l'artefact tarball
  régénéré avec version, `integrity` npm, `shasum` npm et SHA-256, ainsi que
  les nouveaux package, install, checksum, lockback et dry-run de publication
  pour ce tarball régénéré ; dans ce cas, les champs `dist.*`, SHA-256 et
  version de publication doivent correspondre à l'artefact régénéré.

## 13. Résumé

`evals.md` existe pour empêcher trois dérives techniques :

- dérive de contrat ;
- dérive de déterminisme ;
- dérive de release non rejouable.

Tant que les niveaux A à F existent, que les familles B-decodage, B-scan, B-specs, B-graph, B-repo, B-config, B-init/B-map et B-cli restent rattachées à la matrice de traçabilité, et que les gates A à G sont binaires, la release v1.0 reste gouvernable et défendable.
