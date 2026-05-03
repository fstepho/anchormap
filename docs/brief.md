# AnchorMap CLI — brief.md

**Statut**: brief produit v3  
**Portée**: ce document décrit le problème, l'utilisateur cible, la promesse, le périmètre de release et les critères d'arrêt.  
**Prévalence**: le comportement runtime normatif vit dans `contract.md`. Les choix d'implémentation vivent dans `design.md`. Les gates de validation vivent dans `evals.md`.

## 1. Position produit

AnchorMap CLI est un outil local de **traçabilité structurelle déterministe** pour dépôts TypeScript mono-package à périmètre étroit.

Le produit ne cherche pas à répondre à la question :

> "qu'est-ce qu'on peut supprimer ?"

Le produit répond à la question :

> "quelles anchors formelles sont observées dans les specs, quels mappings ont été écrits explicitement par un humain, quels fichiers sont structurellement couverts par ces mappings selon des règles statiques supportées, et où l'analyse est-elle propre ou dégradée ?"

Le produit a un cœur volontairement restreint :

- pas de LLM dans la CLI ;
- pas de recommandation de suppression ;
- pas de réconciliation automatique ;
- pas d'interprétation de prose libre ;
- pas de workflow de décision.

## 2. Utilisateur primaire

L'utilisateur primaire de v1.0 est un ingénieur maintenant un dépôt TypeScript mono-package :

- avec un `product_root` explicite ;
- avec des specs formelles présentes en `.md`, `.yml` ou `.yaml` ;
- avec les dépendances produit-vers-produit nécessaires à la couverture exprimées par imports relatifs ;
- avec un besoin d'auditabilité et d'explicabilité supérieur au besoin d'automatisation.

Cet utilisateur veut une carte structurelle révisable et stable, pas un système "intelligent" qui émet des jugements opaques.

## 3. Problème

Dans les dépôts ciblés, la relation entre specs et code est souvent reconstruite à la main à partir :

- de conventions de nommage ;
- de lectures locales du dépôt ;
- de `grep` ;
- de connaissances tacites ;
- ou d'heuristiques probabilistes peu auditables.

Cela produit plusieurs classes de problème :

1. la frontière entre **observé**, **déclaré par un humain** et **déduit** n'est pas explicite ;
2. les discussions sur la couverture structurelle d'une spec deviennent peu vérifiables ;
3. les sorties "assistées" sont difficiles à rejouer byte-for-byte ;
4. les conclusions dérivent facilement vers des affirmations plus fortes que ce que l'outil peut réellement prouver.

## 4. Promesse du produit

La promesse de v1.0 est limitée et explicite :

- charger une configuration minimale ;
- détecter des anchors formelles dans des specs supportées ;
- stocker des mappings humains explicites entre anchors et `seed_files` ;
- construire un graphe statique local fichier-à-fichier sur le code supporté ;
- calculer des `covering_anchor_ids` à partir des seuls mappings exploitables ;
- exposer les dégradations techniques connues de l'analyse ;
- produire un JSON stable pour `scan --json`.

AnchorMap ne promet pas :

- la vérité métier d'un mapping ;
- la preuve de dead code ;
- la sûreté d'une suppression ;
- la capture complète de l'intention produit ;
- la complétude sémantique d'un dépôt moderne TypeScript.

## 5. Principes de pilotage produit

### 5.1 Scope étroit d'abord

La release v1.0 optimise pour :

- un domaine d'entrée petit ;
- des règles visibles ;
- une surface de maintenance faible ;
- des diagnostics explicites.

Toute extension qui brouille ces propriétés doit être repoussée hors v1.0.

### 5.2 Frontières de confiance explicites

Toute donnée exposée doit être classable en une seule catégorie :

- **Observed**
- **Human**
- **Derived**

Le produit doit éviter les sorties qui mélangent implicitement ces catégories.

### 5.3 Dégradation explicite plutôt que fallback silencieux

Quand une résolution est hors support, ambiguë ou impossible, le produit doit :

- le dire ;
- dégrader l'analyse si nécessaire ;
- s'abstenir de compléter silencieusement.

### 5.4 Pas de workflow caché

La CLI doit rester un outil de lecture structurée et d'écriture explicite de mappings, sans file d'attente, sans historique implicite, sans automation de décision.

## 6. Scope v1.0

### 6.1 IN

v1.0 inclut :

- dépôt TypeScript mono-package ;
- un unique `anchormap.yaml` à la racine courante ;
- un unique `product_root` ;
- `spec_roots` explicites ;
- `ignore_roots` explicites lorsqu'ils sont nécessaires ;
- anchors formelles en Markdown et YAML supportés ;
- mapping humain explicite ;
- `init`, `map`, `scan` ;
- rapport JSON stable pour `scan --json` ;
- classification explicite des dégradations connues ;
- granularité fichier uniquement.

### 6.2 OUT

v1.0 exclut explicitement :

- tout LLM dans la CLI ;
- monorepo ;
- multi-langage ;
- aliases locaux, `baseUrl`, `paths` ;
- `.tsx`, `.js`, `.d.ts` comme fichiers produit ;
- call graph ;
- runtime reachability ;
- preuve de dead code ;
- planification de suppression ;
- suppression automatique ;
- `status`, `refresh`, `decide` ;
- historique de décisions ;
- bootstrap par candidats ;
- CI/CD ;
- plugin IDE ;
- API séparée de navigation ou de reporting.

### 6.3 Qualification des dépôts

Un dépôt est qualifié v1.0 seulement si les dépendances produit-vers-produit nécessaires à la couverture sont exprimées par imports relatifs.

Les imports non relatifs sont acceptés uniquement s'ils désignent des packages externes ou des dépendances hors périmètre v1.0.

Tout dépôt nécessitant `baseUrl`, `paths`, `@/...`, `~/...`, `src/...` ou équivalent pour relier des fichiers produit locaux est rejeté du pilote v1.0.

## 6.4 Segment v1.1 prévu : TypeScript ESM à specifiers `.js`

AnchorMap v1.1 cible aussi les dépôts TypeScript mono-package qui écrivent
leurs dépendances locales relatives au format runtime ESM, par exemple
`import "./dep.js"` dans un fichier source `.ts`.

Cette extension reste dans le périmètre produit seulement si elle conserve les
contraintes suivantes :

- les fichiers produit restent des sources `.ts` ;
- `.js`, `.tsx` et `.d.ts` ne deviennent pas des fichiers produit supportés ;
- aucune lecture de `tsconfig.json`, `package.json`, `baseUrl`, `paths`,
  `exports`, conditions Node, cache ou environnement n'est utilisée comme
  source de vérité ;
- seuls les specifiers relatifs explicites terminés par `.js` peuvent être
  interprétés comme des références vers une source `.ts` jumelle ;
- les cas sans source `.ts` correspondante restent des dégradations explicites,
  jamais des fallbacks silencieux vers du JavaScript runtime.

## 6.5 Segment v1.1 prévu : formats d'anchors documentaires AnchorMap

AnchorMap v1.1 cible aussi les dépôts dont les specs supportées utilisent des
identifiants documentaires courts déjà stables, en particulier les formats
employés par les docs AnchorMap pour les tâches, jalons, spikes et ADR.

AnchorMap v1.1 cible également les dépôts dont les IDs de règle ou de politique
utilisent des segments dotted en `SCREAMING_SNAKE`, par exemple
`DOC.README.SECTIONS_MIN`, `OWN.CODEOWNERS.FILE_SIZE_UNDER_3MB` ou
`REL.PR_TITLE.CONVENTIONAL_COMMITS`.

Cette extension reste dans le périmètre produit seulement si elle conserve les
contraintes suivantes :

- les anchors restent des identifiants formels détectés uniquement dans les
  positions supportées : préfixe de heading ATX Markdown ou `id` racine YAML ;
- les références dans le prose, les numéros de section et les noms de fichiers
  ne deviennent pas des sources d'anchors ;
- les règles de doublon, de mapping explicite et de tri canonique restent
  inchangées ;
- le format étendu est une grammaire fermée, pas une inférence de conventions
  propres à un dépôt ;
- l'extension ne crée aucun mapping, candidat de mapping ou lien de propriété
  automatiquement.

## 6.6 Segment v1.2 prévu : métriques de traçabilité

AnchorMap v1.2 cible les dépôts où la couverture brute peut être dominée par
quelques mappings très connectés.

Cette extension reste dans le périmètre produit seulement si elle conserve les
contraintes suivantes :

- les métriques restent des données dérivées du scan courant ;
- `anchormap.yaml` reste l'unique état persistant propre à AnchorMap ;
- `scan` reste non-mutant ;
- aucune classification métier, aucun seuil, et aucun label repo-spécifique ne
  sont introduits ;
- les métriques ne deviennent pas une preuve de conformité, d'ownership, de
  code mort ou de suppression sûre.

## 7. Workflow utilisateur v1.0

Le workflow nominal est volontairement court :

1. créer `anchormap.yaml` avec `anchormap init ...` ;
2. exécuter `anchormap scan` pour voir anchors observées, mappings stockés, couverture et dégradations ;
3. ajouter un mapping explicite avec `anchormap map --anchor ... --seed ...` ;
4. relancer `anchormap scan` ;
5. corriger ou supprimer manuellement un mapping dans `anchormap.yaml` si nécessaire ;
6. répéter.

Aucun autre workflow n'est promis par v1.0.

## 8. Valeur attendue

La valeur n'est pas la suppression automatique. La valeur attendue est :

- rendre la carte structurelle visible ;
- réduire le temps de reconstitution manuelle d'un état traçable ;
- limiter les discussions floues sur "ce qui dépend de quoi" ;
- produire un état réexécutable et diffable ;
- permettre une lecture prudente : couverture structurelle, pas conclusion métier.

## 9. Métriques de succès

Les métriques de v1.0 servent à décider si le produit est utile sur sa cible réelle, sans étendre sa promesse.

### 9.1 Fenêtre et population d'observation

Sauf mention contraire, les métriques ci-dessous sont évaluées sur la fenêtre suivante :

- les **8 premières semaines** après le début du pilote v1.0 ;
- les **12 premiers dépôts candidats** examinés pour qualification ;
- les **8 premiers dépôts effectivement supportés** ;
- les **6 premiers utilisateurs ciblés** ;
- les **plateformes explicitement supportées** par la release.

### 9.2 Métriques produit

v1.0 est considérée utile si les métriques suivantes sont tenues :

- **temps de premier `scan --json` réussi** : unité = minutes ; cible = médiane `<= 10` ; population = 8 premiers dépôts supportés ; fenêtre = 8 premières semaines ; mesure = temps entre absence de config et premier `scan --json` avec `exit code 0` sur un dépôt supporté ;
- **temps d'ajout d'un mapping valide** : unité = minutes ; cible = médiane `<= 2` ; population = 8 premiers dépôts supportés ; fenêtre = 8 premières semaines ; mesure = temps pour créer via `map` un mapping valide pour une anchor déjà observée ;
- **visibilité des dégradations** : unité = pourcentage de scans avec `analysis_health = degraded` ; cible = `100%` ; population = tous les scans des 8 premiers dépôts supportés ; fenêtre = 8 premières semaines ; mesure = chaque scan dégradé expose au moins un finding dégradant explicite ;
- **lecture prudente du produit** : unité = nombre d'utilisateurs qui interprètent `untraced_product_file` comme une preuve de dead code après lecture du brief et d'un exemple de sortie ; cible = `<= 1/6` ; population = 6 premiers utilisateurs ciblés ; fenêtre = 8 premières semaines ;
- **rejets pour aliases locaux requis** : unité = nombre de dépôts ; cible = suivi descriptif uniquement ; population = les 12 premiers dépôts candidats examinés pour qualification ; fenêtre = 8 premières semaines ; mesure = nombre de dépôts rejetés parce que la couverture requiert des aliases locaux pour relier des fichiers produit ;
- **absence de cadrage destructif** : unité = nombre d'occurrences d'un message équivalent à "safe to delete" dans la CLI, la documentation de release et les exemples officiels ; cible = `0` ; population = tous les artefacts de la release v1.0 ; fenêtre = chaque release candidate.

### 9.3 Métriques de confiance

v1.0 doit également satisfaire :

- **déterminisme opérationnel** : unité = pourcentage de paires de reruns byte-identiques de `scan --json` ; cible = `100%` ; population = 20 reruns par dépôt sur les 8 premiers dépôts supportés ; fenêtre = validation de chaque release candidate sur chaque plateforme supportée ;
- **absence d'automatisme destructif** : unité = nombre de commandes CLI capables de modifier ou supprimer automatiquement du code produit ; cible = `0` ; population = surface CLI publiée ; fenêtre = chaque release candidate ;
- **absence de fallback implicite** : unité = nombre de cas observés où le produit complète silencieusement une résolution hors support, ambiguë ou impossible ; cible = `0` ; population = corpus de validation v1.0 ; fenêtre = chaque release candidate.

Les budgets détaillés de performance et les protocoles de validation restent définis dans `evals.md`.

## 10. Hypothèses de marché et de cible

Le produit repose sur les hypothèses suivantes :

- il existe une classe de dépôts suffisamment petite mais réelle où un moteur déterministe fichier-à-fichier est préférable à un système heuristique ;
- la discipline de specs formelles est déjà présente ou acceptable ;
- le coût d'écriture explicite des mappings reste inférieur au coût de reconstitution manuelle répétée ;
- les utilisateurs préfèrent un outil qui dit moins mais dit quelque chose de stable.

## 11. Risques produit

Le risque principal de mauvaise interprétation est la **surinterprétation** de `untraced_product_file` comme une preuve de dead code.

Le risque principal d'adoption est le **coût d'amorçage** du mapping humain explicite.

Les autres risques majeurs sont :

1. **mauvais segment** : la cible réelle est dominée par monorepo, aliases locaux ou multi-langage ;
2. **coût d'entretien** : le moteur de résolution et les dépendances de parsing coûtent plus cher que la valeur créée ;
3. **glissement de périmètre** : la pression produit pousse vers des features qui cassent la simplicité du contrat.

## 12. Kill criteria

Les critères suivants sont évalués sur la fenêtre de référence définie en 9.1, sauf mention contraire.

Si un seul critère est atteint, le produit doit être rescopé ou arrêté.

- **mauvais segment confirmé** : plus de `6/12` dépôts candidats sont hors scope à cause de monorepo, d'aliases locaux ou de multi-langage ;
- **coût d'amorçage trop élevé** : sur les 8 premiers dépôts supportés, la médiane du temps de premier `scan --json` avec `exit code 0` est `> 15 minutes`, ou la médiane du temps d'ajout d'un mapping valide est `> 5 minutes` ;
- **attente produit incompatible** : parmi les 6 premiers utilisateurs ciblés, au moins `4/6` déclarent qu'ils n'utiliseraient pas l'outil sans recommandation de suppression ou décision automatique ;
- **surinterprétation persistante** : parmi les 6 premiers utilisateurs ciblés, au moins `3/6` continuent à décrire `untraced_product_file` comme une preuve de dead code après lecture du brief et d'un exemple de sortie ;
- **coût de maintenance excessif** : pendant `2 sprints` consécutifs de `2 semaines`, la maintenance corrective du moteur ou des dépendances de parsing consomme `> 4 jours-ingénieur` par sprint ;
- **non-tenue des gates techniques** : sur `2 release candidates` consécutifs, au moins une gate de déterminisme ou de performance définie dans `evals.md` échoue sur une plateforme supportée.

## 13. Décisions de cadrage

Pour garder v1.0 cohérent, les décisions suivantes sont gelées :

- pas de parent search pour la config ;
- pas de persistance autre que `anchormap.yaml` ;
- pas de commande de suppression de mapping ;
- pas de réconciliation de rename, split ou merge ;
- pas de classement métier (`shared`, `infra`, `leaf`, `domain`) ;
- pas d'heuristique durable ;
- pas de "mode expert" qui contourne le contrat.

## 14. Position finale de la release

AnchorMap CLI v1.0 n'est pas un système de pruning et ne doit pas être présenté comme tel.

La release doit être jugée comme un outil de :

- traçabilité structurelle locale ;
- frontières de confiance explicites ;
- déterminisme fort ;
- diagnostics de dégradation ;
- surface de maintenance volontairement petite.

Sa phrase de vente la plus précise reste :

> "AnchorMap montre ce qui est observé dans les specs, ce qui a été mappé explicitement par un humain, ce qui est structurellement couvert par les règles supportées, et où l'analyse est propre ou dégradée."
