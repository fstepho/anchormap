# AnchorMap CLI — operating-model.md

**Statut**: modèle opérationnel projet v1.1  
**Portée**: ce document définit la méthode de production du projet AnchorMap CLI.  
**Prévalence**: ce document ne définit aucun comportement runtime. En cas de conflit, `contract.md` prévaut pour le comportement observable, `evals.md` prévaut pour les gates de vérification, `brief.md` prévaut pour le périmètre produit, et `design.md` prévaut seulement pour les choix d'implémentation compatibles avec le contrat.

## 1. Objet du document

Ce document explique comment utiliser les documents du projet pour passer de l'intention produit au code vérifié sans dérive de scope.

Il définit :

- la hiérarchie des documents ;
- les phases de production ;
- les gates de passage ;
- la politique de changement ;
- les règles d'utilisation des agents IA ;
- la classification des écarts ;
- le protocole de review ;
- la stratégie d'implémentation ;
- la boucle d'apprentissage produit ;
- la définition de done.

Ce document ne définit pas :

- le comportement observable de la CLI ;
- le schéma de sortie JSON ;
- la grammaire des fichiers supportés ;
- les règles de graphe TypeScript ;
- les budgets de performance ;
- les fixtures de release ;
- une roadmap produit hors v1.0.

Ces sujets vivent respectivement dans `contract.md`, `design.md`, `evals.md` et `brief.md`.

## 2. Principe directeur

AnchorMap CLI est développé selon une méthode **contract-first, eval-driven, scope-closed**.

Cela signifie :

- le produit est cadré avant d'être spécifié ;
- le comportement observable est défini avant le design ;
- les evals sont dérivées du contrat avant l'implémentation complète ;
- les tâches sont dérivées du contrat, du design et des evals ;
- l'implémentation ne peut pas introduire de comportement produit implicite ;
- toute divergence doit être classifiée avant d'être corrigée ;
- les agents IA sont utilisés comme assistants de production, jamais comme source autonome de décisions produit.

La méthode optimise pour :

- déterminisme ;
- traçabilité ;
- vérifiabilité ;
- faible surface d'interprétation ;
- isolation des effets de bord ;
- coût de review maîtrisé ;
- absence de drift implicite.

### 2.1 Principes de harness engineering

Le dépôt doit rester le système de vérité pour les humains comme pour les agents.

Conséquences :

- `AGENTS.md` est une carte d'entrée courte, pas un manuel normatif ;
- l'intention durable du projet doit vivre dans le dépôt, jamais uniquement dans l'historique de chat ;
- quand un agent échoue de manière répétée, la réponse par défaut n'est pas d'élargir le prompt mais d'ajouter la contrainte manquante dans le dépôt ;
- cette contrainte manquante peut prendre la forme d'un document, d'une ADR, d'une fixture, d'un golden, d'un check de frontière, d'un script de validation ou d'un diagnostic d'échec plus lisible ;
- le harness doit rendre le comportement observable par captures `stdout` / `stderr`, codes de sortie, rapports de mutation, goldens explicites et diffs lisibles ;
- le travail humain prioritaire consiste à cadrer, borner et vérifier ; le travail agentique consiste à exécuter à l'intérieur de ces bornes.

### 2.2 Fail fast

Le projet préfère les échecs précoces, locaux et classifiables aux échecs tardifs et ambigus.

#### Process fail fast

Pendant l'implémentation :

- une seule tâche bornée est traitée à la fois ;
- les documents, fixtures et checks pertinents sont identifiés avant le patch ;
- le plus petit check utile doit être lancé tôt ;
- un check ciblé précoce ne remplace pas les checks statiques repo-locaux applicables aux fichiers modifiés ; avant handoff, ces checks doivent être relancés et passer, y compris le lint quand cette surface est couverte ;
- un échec bloquant doit être classifié avant tout patch supplémentaire ;
- un agent ne doit pas corriger "à l'aveugle" ni élargir la portée pour faire passer un check.

Un échec répété est traité d'abord comme un manque d'infrastructure ou de lisibilité du dépôt, pas comme un problème de volonté de l'agent.

#### Runtime fail fast

Le runtime doit échouer rapidement lorsque la précondition rend l'opération invalide ou l'analyse non fiable.

Exemples typiques :

- commande invalide ;
- option invalide ;
- config absente ou invalide ;
- entrée non décodable ou non parsable là où la lecture est requise ;
- invariant interne impossible ;
- chemin d'écriture ou de mutation non admissible.

À l'inverse, un finding métier prévu par le contrat n'est pas un motif de fail fast s'il doit être exposé structurellement dans une entrée valide.

### 2.3 Observabilité lisible par agent

Le harness est la surface principale d'observabilité du projet.

Son but n'est pas de faire du monitoring généraliste, mais de rendre un échec de fixture diagnosticable sans contexte humain implicite.

Une exécution de fixture doit rendre accessibles au minimum :

- la commande ;
- le `cwd` ;
- l'exit code ;
- `stdout` et `stderr` ;
- le diff de golden si applicable ;
- le diff de mutation filesystem si applicable ;
- les timings de phase si disponibles ;
- les traces structurées si disponibles ;
- le manifeste de fixture ;
- la classification d'échec si elle a déjà été établie.

Quand ce signal est insuffisant, la réponse attendue est d'ajouter le signal manquant au dépôt.

## 3. Hiérarchie des documents

Le projet utilise les documents suivants :

1. `docs/brief.md`  
   Intention produit, utilisateur cible, problème, promesse, scope, non-objectifs, risques, kill criteria.

2. `docs/contract.md`  
   Contrat normatif du comportement observable v1.0 : commandes, entrées, sorties, codes de sortie, garanties de déterminisme, règles de mutation, schémas, sérialisation canonique.

3. `docs/design.md`  
   Design de référence compatible avec le contrat : architecture cible, frontières internes, modules, pipeline logique, stratégie d'implémentation.

4. `docs/evals.md`  
   Plan d'évaluation : familles de tests, fixtures, oracles, goldens, gates de release, budgets, reproductibilité.

5. `docs/tasks.md`  
   Plan d'exécution dérivé des documents précédents : jalons, tâches, dépendances, références au contrat, composants de design, fixtures associées, critères de sortie.

6. `docs/operating-model.md`  
   Modèle de travail : règles de production, politique de changement, usage des agents, protocole de review et définition de done.

7. `docs/adr/`  
   Dossiers de décisions techniques structurantes : stack, dépendances, arbitrages d'architecture, alternatives rejetées, conséquences et statut de décision.

## 4. Résolution des conflits

En cas de contradiction entre documents, appliquer l'ordre suivant.

### 4.1 Comportement observable

Pour tout comportement visible par l'utilisateur ou par les evals, `docs/contract.md` prévaut.

Exemples :

- code de sortie ;
- contenu de `stdout` ou `stderr` ;
- schéma JSON ;
- ordre canonique ;
- mutation ou non-mutation de `anchormap.yaml` ;
- support ou rejet d'une classe d'entrée ;
- classification des findings ;
- garantie de déterminisme.

Si le code contredit le contrat, le code est incorrect.

Si le design contredit le contrat, le design doit être modifié.

Si une eval contredit le contrat, l'eval est incorrecte ou le contrat doit être amendé explicitement avant de poursuivre.

### 4.2 Vérification de release

Pour les gates de validation, `docs/evals.md` prévaut.

Une release ne peut pas être considérée prête si les gates de `evals.md` ne passent pas, même si le code semble correct par inspection.

### 4.3 Scope produit

Pour le périmètre produit, les non-objectifs et les kill criteria, `docs/brief.md` prévaut.

Si une demande d'implémentation élargit le scope au-delà du brief, elle doit être refusée ou requalifiée comme changement produit.

### 4.4 Design interne

`docs/design.md` guide l'implémentation tant qu'il reste compatible avec `contract.md` et `evals.md`.

Un design peut être modifié sans changement produit si :

- le contrat reste satisfait ;
- les evals restent valides ;
- le comportement observable ne change pas ;
- le changement rend l'implémentation plus simple, plus sûre ou plus déterministe.

### 4.5 Plan d'exécution

`docs/tasks.md` est dérivé. Il peut être amendé ou régénéré si les références au contrat, au design et aux evals restent traçables.

Une tâche ne peut pas justifier un changement de contrat par elle-même.

## 5. Phases de production

Le projet suit des phases distinctes. Chaque phase produit des artefacts différents et autorise des décisions différentes.

### Phase 0 — Cadrage produit

**Entrées** : idée produit, problème utilisateur, contraintes, risques.  
**Sortie** : `docs/brief.md`.

Objectif : définir ce que v1.0 essaie de prouver et ce qui est explicitement hors scope.

Interdit dans cette phase :

- implémenter du code produit ;
- définir des détails de design prématurés ;
- ajouter des comportements non reliés à la promesse produit ;
- confondre hypothèse produit et garantie contractuelle.

### Phase 1 — Définition du contrat

**Entrée** : `docs/brief.md`.  
**Sortie** : `docs/contract.md`.

Objectif : transformer le scope produit en comportement observable, testable et normatif.

Le contrat doit définir :

- commandes ;
- préconditions ;
- sorties ;
- codes de sortie ;
- sérialisation ;
- mutation ou absence de mutation ;
- cas supportés ;
- cas rejetés ;
- dégradations connues ;
- garanties de déterminisme.

### Phase 2 — Design

**Entrées** : `docs/brief.md`, `docs/contract.md`.  
**Sortie** : `docs/design.md`.

Objectif : proposer une implémentation cible capable de satisfaire le contrat avec une surface réduite et auditable.

Le design ne peut pas affaiblir le contrat.

### Phase 3 — Évaluation

**Entrées** : `docs/contract.md`, `docs/design.md`.  
**Sortie** : `docs/evals.md`.

Objectif : définir comment le contrat sera vérifié.

Les evals doivent vérifier le comportement observable, pas les préférences internes d'implémentation.

### Phase 4 — Planification des tâches

**Entrées** : `docs/contract.md`, `docs/design.md`, `docs/evals.md`.  
**Sortie** : `docs/tasks.md`.

Objectif : découper l'exécution en tâches petites, traçables et vérifiables.

Chaque tâche doit référencer :

- une ou plusieurs sections de `contract.md` ;
- un ou plusieurs composants de `design.md` ;
- une ou plusieurs fixtures, familles d'evals ou gates de `evals.md` ;
- un critère de sortie vérifiable.

### Phase 5 — Implémentation

**Entrées** : `docs/tasks.md` et les sections pertinentes des documents normatifs.  
**Sorties** : code, tests, fixtures, notes d'implémentation si nécessaires.

Objectif : implémenter une tâche bornée sans modifier implicitement le produit.

Une implémentation ne peut pas :

- ajouter du comportement observable non contracté ;
- changer le contrat par commodité ;
- affaiblir une fixture pour faire passer les tests ;
- modifier du scope produit sans décision explicite.

### Phase 6 — Vérification

**Entrées** : code, tests, fixtures, release gates.  
**Sorties** : résultat pass/fail, diff, diagnostics, cas de régression, décision de release.

Objectif : décider si le comportement produit respecte le contrat et les evals.

Tout bug confirmé corrigé doit ajouter une couverture permanente, sauf si une couverture équivalente existe déjà.

## 6. Boucle d'apprentissage produit

L'implémentation peut prouver qu'AnchorMap peut être construit selon le contrat.
Elle ne prouve pas, à elle seule, qu'AnchorMap doit être adopté, élargi ou repositionné.

Le projet distingue donc deux boucles :

- **boucle de production** : transformer le contrat en code vérifié ;
- **boucle d'apprentissage produit** : vérifier que le produit, son scope et sa promesse restent pertinents.

La boucle produit ne doit pas être confondue avec les tâches d'implémentation.
Une question de valeur, de segment, d'adoption ou de compréhension utilisateur ne doit pas être résolue par un patch de code.

### 6.1 Artefacts produit optionnels

`docs/brief.md` est l'artefact produit minimal et obligatoire.

Les artefacts suivants peuvent être ajoutés si la validation produit devient active :

- `docs/pilot.md`  
  Décrit les dépôts candidats, les utilisateurs pilotes, les scripts d'entretien, les observations et les signaux d'adoption.

- `docs/bets.md`  
  Liste les hypothèses produit explicites : promesse, utilisateur, workflow, adoption, coût d'amorçage, périmètre supporté.

- `docs/metrics.md`  
  Définit les métriques produit : time-to-first-scan, time-to-first-valid-mapping, taux de findings compris, taux de mauvaises interprétations, coût d'amorçage, réutilisation.

- `docs/decisions.md`  
  Journalise les décisions produit ou techniques à fort impact : garder, couper, différer, pivoter, élargir ou abandonner.

Ces documents sont optionnels. Ils ne doivent pas devenir une nouvelle surface de spéculation si aucune validation produit n'est en cours.

### 6.2 Questions produit

Une question est une question produit si elle affecte :

- l'utilisateur cible ;
- la promesse centrale ;
- le workflow attendu ;
- le coût d'adoption ;
- les classes de dépôts supportées ;
- le sens perçu des findings ;
- les non-objectifs ;
- les kill criteria ;
- l'ordre des capacités à construire ;
- la décision de garder, réduire, élargir ou abandonner une hypothèse.

Une question produit ne doit pas être résolue dans une tâche d'implémentation.

Actions autorisées :

- mettre à jour `docs/brief.md` ;
- ajouter une décision dans `docs/decisions.md` si ce fichier existe ;
- ajouter une entrée dans `docs/pilot.md` si la question nécessite observation ;
- différer explicitement la question ;
- créer une tâche de validation produit distincte, sans modification de comportement runtime.

### 6.3 Validation produit

La validation produit doit utiliser le plus petit artefact crédible.

Artefacts autorisés :

- exemples statiques de sortie CLI ;
- sorties produites par fixtures ;
- walking skeleton ;
- démo locale sur dépôt réel ;
- entretien utilisateur ;
- run pilote sur dépôt candidat ;
- mesure du temps jusqu'au premier mapping valide ;
- mesure du nombre de findings mal interprétés ;
- comparaison entre workflow existant et workflow AnchorMap.

Une validation produit peut conduire à :

- maintenir le scope ;
- réduire le scope ;
- modifier un non-objectif ;
- ajuster un kill criterion ;
- différer une capacité ;
- ajouter une contrainte produit ;
- abandonner une hypothèse.

Elle ne peut pas élargir silencieusement l'implémentation.

### 6.4 Séparation entre apprentissage produit et release v1.0

Pendant la construction de v1.0, une observation produit ne modifie pas automatiquement le contrat.

Le chemin normal est :

```text
observation produit -> question produit -> décision explicite -> brief/contract/evals/tasks si nécessaire
```

Une observation issue d'un pilote ne devient un changement d'implémentation que si :

- la décision est écrite ;
- le document normatif concerné est modifié ;
- les evals sont mises à jour si le comportement observable change ;
- les tâches sont ajustées ;
- le changement reste compatible avec la stratégie de scope.

### 6.5 Questions produit à surveiller pour AnchorMap CLI

Les questions suivantes sont connues et ne doivent pas être résolues implicitement par le code :

- les utilisateurs comprennent-ils correctement `untraced_product_file` ?
- acceptent-ils un outil read-only qui cartographie sans recommander automatiquement de suppression ?
- le coût de création des mappings est-il acceptable ?
- le segment initial préfère-t-il une sortie JSON stable ou une restitution humaine plus interprétée ?
- les dépôts réels du segment cible respectent-ils assez souvent les contraintes v1.0 ?
- les utilisateurs attendent-ils une suggestion automatique de mappings, hors scope v1.0 ?

Ces questions peuvent être explorées par `docs/pilot.md`, mais ne doivent pas entrer dans v1.0 sans changement de scope explicite.

## 7. Gates de passage

Les gates sont binaires. Un gate flou n'est pas un gate.

Sauf mention contraire dans la référence citée, les gates de cette section sont
les **gates du modèle opérationnel**.

`docs/evals.md` réutilise aussi les libellés `Gate A` à `Gate G` pour un autre
namespace : les **gates de release**. Toute référence à ces dernières doit être
qualifiée explicitement comme `evals.md Gate X` ou `release Gate X`.

### Gate A — Brief prêt

`brief.md` est prêt lorsque :

- l'utilisateur primaire est défini ;
- le problème principal est défini ;
- la promesse produit est limitée ;
- les non-objectifs sont explicites ;
- les risques produit sont nommés ;
- les kill criteria sont définis.

### Gate B — Contrat prêt

`contract.md` est prêt lorsque :

- les comportements observables sont définis ;
- les commandes et options sont définies ;
- les entrées supportées et rejetées sont définies ;
- les sorties JSON et leur ordre canonique sont définis ;
- les codes de sortie sont définis ;
- les politiques de mutation sont définies ;
- les garanties de déterminisme sont définies ;
- les profils grammaticaux normatifs sont définis ;
- les hors-contrat sont explicites.

### Gate C — Evals prêtes

`evals.md` est prêt lorsque :

- chaque comportement contractuel majeur mappe vers une famille d'evals ;
- les fixtures de frontière couvrent les commandes principales ;
- les cas d'échec vérifient code de sortie et `stdout` vide lorsque requis ;
- les goldens vérifient l'ordre canonique et l'absence de clés hors contrat ;
- les attentes de mutation ou non-mutation sont testables ;
- les gates de performance, plateforme, reproductibilité et dépendances sont définis.

### Gate D — Tâches prêtes

`tasks.md` est prêt lorsque :

- les tâches sont découpées en unités exécutables ;
- chaque tâche référence contrat, design et evals ;
- les dépendances entre tâches sont explicites ;
- les tâches de spike sont séparées des tâches de production ;
- les critères de sortie sont vérifiables ;
- aucune tâche ne contient de nouvelle feature implicite.

### Gate E — Implémentation prête à démarrer

L'implémentation peut commencer lorsque :

- `brief.md`, `contract.md`, `design.md`, `evals.md` et `tasks.md` sont cohérents ;
- la première tâche est explicitement bornée ;
- les fichiers autorisés ou composants ciblés sont connus ;
- les fixtures ou tests attendus sont nommés ;
- aucun point d'ambiguïté bloquant ne reste ouvert pour cette tâche.

### Gate F — Tâche terminée

Une tâche passe Gate F si et seulement si la définition de done de `§19.1 Tâche`
est satisfaite.

### Gate G — Release candidate prête

Une release candidate est prête lorsque :

- tous les gates de `evals.md` passent ;
- les budgets de performance passent ;
- les plateformes supportées passent ;
- la reproductibilité est validée ;
- les dépendances publiées sont figées ;
- aucun comportement observable connu ne viole `contract.md` ;
- les questions produit non résolues sont explicitement différées ou closes.

## 8. Politique de changement

La politique de changement vise à empêcher les modifications implicites de scope ou de contrat pendant l'implémentation.

### 8.1 Changement de contrat

Un changement de `contract.md` est requis si l'un des éléments suivants change :

- comportement CLI observable ;
- commande ou option ;
- format de sortie ;
- ordre canonique ;
- code de sortie ;
- politique de mutation ;
- classe d'entrée supportée ou rejetée ;
- garantie de déterminisme ;
- profil grammatical normatif ;
- classification des findings ;
- sens de `analysis_health`.

Un changement de contrat doit mettre à jour, si applicable :

- `docs/contract.md` ;
- `docs/evals.md` ;
- les fixtures concernées ;
- les goldens concernés ;
- `docs/design.md` si l'architecture est affectée ;
- `docs/tasks.md` si le plan d'exécution change.

Un changement de contrat ne doit pas être glissé dans une tâche d'implémentation sans instruction explicite.

### 8.2 Changement de design

Un changement de `design.md` est autorisé si :

- le contrat reste satisfait ;
- les evals restent valides ;
- le comportement observable ne change pas ;
- l'implémentation devient plus simple, plus sûre, plus déterministe ou plus auditable.

Un changement de design doit être documenté s'il modifie :

- les frontières de module ;
- la propriété des effets de bord ;
- la séquence de commit ;
- la représentation interne des données ;
- le modèle d'erreur interne ;
- les dépendances techniques structurantes.

### 8.3 Changement d'evals

Un changement de `evals.md`, d'une fixture ou d'un golden est autorisé si :

- il rend la vérification du contrat plus stricte ;
- il corrige une attente incorrecte ;
- il ajoute une couverture de régression ;
- il rend un oracle plus explicite sans changer le comportement attendu.

Un changement d'eval est interdit s'il :

- affaiblit silencieusement un gate ;
- accepte un comportement non contracté ;
- masque une régression ;
- remplace un oracle exact par une vérification vague sans justification explicite.

### 8.4 Changement de tâches

`tasks.md` peut être amendé ou régénéré lorsque :

- le découpage est trop large ;
- une dépendance manquante est découverte ;
- une tâche doit être scindée ;
- un spike révèle une contrainte technique ;
- une fixture impose un ordre différent.

Toute tâche nouvelle doit rester traçable au contrat, au design et aux evals.

### 8.5 Changement produit

Un changement produit est requis lorsque la modification :

- change la promesse de v1.0 ;
- élargit le segment cible ;
- ajoute une classe majeure de cas supportés ;
- transforme une non-promesse en promesse ;
- retire ou affaiblit un kill criterion ;
- introduit une capacité explicitement hors scope.

Un changement produit doit commencer par `brief.md`, pas par le code.

### 8.6 Architectural Decision Records

Les décisions techniques significatives sont journalisées dans `docs/adr/`.

Une ADR est requise lorsqu'une décision :

- sélectionne ou rejette une dépendance structurante ;
- affecte le comportement observable, le déterminisme ou la reproductibilité ;
- affecte parsing, rendu, mutation, comportement de sortie, packaging ou harness ;
- modifie une hypothèse de gate, de plateforme ou de release ;
- est coûteuse à inverser après démarrage de l'implémentation.

Règles :

- `design.md` décrit l'architecture actuelle ;
- les ADR expliquent pourquoi une option de stack ou d'architecture a été choisie ;
- une ADR acceptée est contraignante jusqu'à remplacement explicite ;
- une implémentation ou un refactor ne doit pas contourner silencieusement une ADR acceptée.

### 8.7 Pré-production : simplifier plutôt que compatibiliser

Tant que le projet n'a ni utilisateurs en production ni release déployée à préserver, la politique par défaut est de **remplacer proprement** plutôt que de conserver de la compatibilité interne.

Règles :

- lorsqu'un design, un refactor ou une convention interne en remplace un autre, l'ancien chemin doit être supprimé, pas maintenu "au cas où" ;
- ne pas conserver deux chemins d'exécution, deux représentations internes, deux conventions ou deux comportements internes en parallèle sans nécessité explicitement tracée au contrat, aux evals ou à une ADR acceptée ;
- ne pas accumuler de flags, couches de compatibilité, adaptateurs temporaires, aliases temporaires ou branches mortes pour ménager une migration qui n'existe pas encore ;
- en pré-production, la compatibilité à préserver est celle du contrat, des evals, des fixtures, des goldens et des ADR, pas celle d'anciens choix internes ;
- si une coexistence transitoire est strictement nécessaire pour garder un patch petit, vérifiable et réversible, elle doit être explicitement bornée dans le plan de tâche ou le diff de travail et supprimée avant la clôture du jalon concerné.

## 9. Règles d'utilisation des agents IA

Les agents IA peuvent être utilisés pour produire, vérifier et implémenter le projet, mais uniquement dans des rôles bornés.

AnchorMap CLI ne contient pas de LLM dans son runtime v1.0. L'utilisation d'agents IA concerne uniquement le processus de développement.

### 9.1 Ce que les agents peuvent faire

Les agents peuvent :

- résumer les documents ;
- détecter des incohérences entre documents ;
- dériver `tasks.md` à partir du contrat, du design et des evals ;
- proposer un plan d'implémentation borné ;
- implémenter une tâche explicitement référencée ;
- générer des tests unitaires ;
- générer des fixtures et goldens sous contrôle ;
- expliquer un échec de test ;
- reviewer un diff contre le contrat ;
- proposer un refactor sous invariants explicites ;
- produire une liste de risques techniques pour une tâche donnée.

### 9.2 Ce que les agents ne doivent pas faire

Les agents ne doivent pas :

- inventer de nouveau comportement produit ;
- modifier `contract.md` sans instruction explicite ;
- élargir le scope ;
- changer un format de sortie pour commodité d'implémentation ;
- affaiblir une fixture pour faire passer les tests ;
- supprimer un gate sans justification contractuelle ;
- faire des refactors larges hors tâche ;
- mélanger décision produit et patch d'implémentation ;
- introduire une dépendance structurante sans validation ;
- ignorer ou contourner une ADR acceptée ;
- ajouter un cache, du réseau, une dépendance à Git, à l'horloge ou à l'environnement comme source de vérité ;
- modifier silencieusement une garantie de déterminisme.

### 9.3 Discipline de prompt

Toute demande à un agent pendant l'implémentation doit préciser :

- la phase courante ;
- la tâche cible ;
- les fichiers autorisés ou composants ciblés ;
- les changements interdits ;
- les sections pertinentes du contrat ;
- les fixtures ou tests attendus ;
- le format de sortie attendu ;
- le niveau de liberté autorisé.

Les prompts ouverts sont interdits pendant l'implémentation.

Exemples de prompts interdits :

```text
Improve this.
Review everything.
Make it better.
Implement AnchorMap.
Fix all failing tests.
Refactor the project.
```

Exemple de prompt autorisé :

```text
Implémente uniquement la tâche T3.2 de docs/tasks.md.

Contraintes :
- ne modifie pas docs/contract.md ;
- ne modifie pas le schéma JSON ;
- ne modifie pas les fixtures hors fx43, fx44 et fx45 ;
- ne change pas le comportement de scan ;
- respecte les sections 7.2, 9.1 et 13.8 de docs/contract.md.

Critères de sortie :
- tests unitaires config passent ;
- fixtures fx43, fx44 et fx45 passent ;
- stdout reste vide sur erreur ;
- aucun fichier hors scope n'est modifié.

Retour attendu :
- résumé court ;
- patch ;
- tests exécutés ;
- risques résiduels.
```

## 10. Taxonomie des écarts

Tout échec, divergence ou surprise doit être classifié avant correction.

Cette taxonomie est unique et normative pour :

- les prompts d'implémentation ;
- les templates de review ;
- les templates de triage de fixtures ;
- les mises à jour de `tasks.md` déclenchées par une déviation classifiée.

Des tags secondaires de triage peuvent être ajoutés pour aider au routage ou au diagnostic, mais ils ne remplacent jamais la classification normative.

Les libellés canoniques de classification sont les suivants :

- `contract violation`
- `spec ambiguity`
- `design gap`
- `eval defect`
- `product question`
- `tooling problem`
- `out-of-scope discovery`

Dans une review, chaque finding doit porter :

- exactement une classification primaire issue de cette section ;
- un statut explicite `bloquant` ou `non bloquant` par rapport à la définition de done de la tâche (§19.1).

Une sévérité de type `high` / `medium` / `low` peut être ajoutée pour aider au triage, mais elle reste non normative et ne remplace ni la classification primaire ni le statut bloquant.

### 10.1 Contract violation

L'implémentation ne satisfait pas `contract.md`.

Action :

- corriger l'implémentation ;
- ajouter une fixture de régression si la couverture manque ;
- ne pas modifier le contrat sauf si la violation révèle une erreur explicite du contrat.

### 10.2 Spec ambiguity

Le contrat ne définit pas assez clairement le comportement attendu.

Action :

- arrêter l'implémentation du point ambigu ;
- clarifier `contract.md` ;
- mettre à jour `evals.md` et les fixtures ;
- reprendre ensuite l'implémentation.

### 10.3 Design gap

Le design ne permet pas de satisfaire proprement le contrat ou les evals.

Action :

- modifier `design.md` ;
- ajuster les tâches impactées ;
- ne pas affaiblir le contrat.

### 10.4 Eval defect

Une fixture, un golden ou un gate contredit le contrat ou vérifie le mauvais comportement.

Action :

- corriger l'eval ;
- documenter la raison ;
- vérifier qu'aucun gate n'a été affaibli.

### 10.5 Product question

La divergence révèle une question de scope, de valeur, de segment ou de promesse.

Action :

- ne pas résoudre par le code ;
- mettre à jour `brief.md` ou différer explicitement ;
- ne pas modifier `contract.md` tant que la décision produit n'est pas prise.

### 10.6 Tooling problem

L'échec vient du harness, de l'environnement, d'une dépendance parser, d'un comportement plateforme ou du runner de tests.

Action :

- corriger l'outillage ;
- ajouter un test de harness si nécessaire ;
- ne pas modifier le comportement produit pour contourner un problème d'outillage.

### 10.7 Out-of-scope discovery

Un cas réel intéressant est découvert mais n'appartient pas à v1.0.

Action :

- documenter comme hors scope ;
- ne pas l'implémenter ;
- créer éventuellement une note future séparée ;
- préserver la fermeture du scope v1.0.

## 11. Contrôle du scope

Le projet est volontairement étroit.

Toute nouvelle capacité est rejetée par défaut sauf si elle satisfait toutes les conditions suivantes :

- elle est nécessaire pour respecter le contrat v1.0 ;
- elle correspond au brief produit ;
- elle est couverte par des evals ;
- elle ne réduit pas le déterminisme ;
- elle ne crée pas de mutation cachée ;
- elle ne change pas implicitement le segment cible ;
- elle ne transforme pas une non-promesse en promesse.

Sont hors scope v1.0 sauf changement produit explicite :

- recommandation automatique de suppression ;
- preuve de dead code ;
- interprétation de prose libre ;
- bootstrap automatique de mappings candidats ;
- réconciliation automatique de renames, splits ou merges ;
- support multi-package ou monorepo ;
- support des aliases locaux requis ;
- support JSX/TSX ;
- support JavaScript ;
- call graph ;
- reachability runtime ;
- dépendance à Git comme source de vérité ;
- cache persistant ;
- service cloud ;
- daemon ;
- LLM dans la CLI ;
- workflows `status`, `refresh` ou `decide`.

## 12. Stratégie d'implémentation

L'implémentation procède de l'infrastructure de vérification vers le comportement produit.

Ordre recommandé :

1. `tasks.md` ;
2. format de fixtures ;
3. runner de fixtures ;
4. frontière CLI ;
5. types domaine purs ;
6. rendu JSON canonique ;
7. lecture/validation/écriture config ;
8. commande `init` ;
9. index des specs ;
10. découverte des fichiers produit ;
11. graphe TypeScript supporté ;
12. moteur `scan` ;
13. commande `map` ;
14. gates de déterminisme, mutation, plateforme, performance et release.

Règles :

- ne pas commencer par le graphe TypeScript complet ;
- ne pas commencer par le moteur `scan` complet ;
- construire d'abord la machine qui dira si le code respecte le contrat ;
- préférer un walking skeleton vérifié à une logique métier large non testée ;
- faire passer un petit nombre de fixtures avant d'élargir le corpus ;
- ajouter les cas de régression au fur et à mesure des défauts confirmés.

## 13. Walking skeleton

Le premier jalon d'implémentation doit prouver la boucle :

```text
spec -> fixture -> CLI -> golden -> diff -> correction
```

Le walking skeleton doit inclure :

- une CLI réelle ou stub contrôlée ;
- le runner de fixtures ;
- au moins une fixture de succès ;
- au moins une fixture d'échec ;
- validation de l'exit code ;
- validation de `stdout` ;
- validation de `stderr` ;
- validation de mutation ou non-mutation lorsque applicable ;
- diff lisible en cas d'échec.

Le walking skeleton n'a pas besoin d'implémenter tout le produit. Il doit prouver que le système de vérification fonctionne.

## 14. Protocole de review

Les reviews doivent être bornées.

Les reviews générales sont déconseillées car elles produisent du feedback non actionnable et rouvrent le scope.

### 14.1 Types de review autorisés

#### Contract review

Question : le contrat est-il clair, complet et non contradictoire pour le comportement ciblé ?

Sortie attendue : ambiguïtés bloquantes, contradictions, comportements non testables.

#### Eval review

Question : les evals vérifient-elles le contrat sans supposer un détail interne inutile ?

Sortie attendue : trous de couverture, oracles incorrects, gates faibles ou non mesurables.

#### Design review

Question : le design peut-il satisfaire le contrat avec des frontières claires et des effets de bord bornés ?

Sortie attendue : mismatch design/contrat, risques de déterminisme, ownership flou.

#### Task review

Question : les tâches sont-elles petites, traçables et exécutables ?

Sortie attendue : tâches trop larges, dépendances manquantes, critères de sortie faibles.

#### Diff review

Question : le diff satisfait-il la tâche ou la maintenance process bornée sans
violer le contrat ni modifier du comportement hors scope ?

Sortie attendue : violations de contrat, tests manquants, mutation cachée, scope creep.

### 14.2 Règles de review de diff

Une review de diff task-scoped doit répondre à ces questions :

- quelle tâche est visée ?
- quelles sections du contrat sont impactées ?
- quelles fixtures doivent passer ?
- le diff modifie-t-il un comportement hors tâche ?
- le diff modifie-t-il une sortie, un code de sortie ou une mutation ?
- le diff change-t-il une dépendance structurante ?
- le diff affaiblit-il une eval ?
- les erreurs et cas d'échec sont-ils couverts ?
- les limites connues sont-elles documentées ?

Une review de diff process-maintenance doit répondre à ces questions :

- quelle surface process est visée ?
- quelles sections de `operating-model.md`, `AGENTS.md`, `agent-loop.md`,
  `code-review.md`, des skills ou des ADRs sont impactées ?
- le diff modifie-t-il du comportement runtime, du scope produit, le contrat ou
  les evals ?
- le diff crée-t-il une autorité concurrente ou une contradiction avec la
  hiérarchie documentaire ?
- les invariants de review fraîche, de classification et de bornage restent-ils
  préservés ?

Chaque finding de review doit ensuite être exprimé avec :

- une classification primaire selon la section 10 ;
- un statut `bloquant` ou `non bloquant` relativement à §19.1 ;
- éventuellement des tags secondaires de triage.

Le protocole repo exige une **fresh review session Codex** pour chaque passe de
review.

Une fresh review session est une session Codex dédiée à la review d'un unique
diff cumulé borné à une tâche, ou d'un unique diff de maintenance process borné
qui ne modifie pas le comportement runtime.

Entrées autorisées :

- `codex review --uncommitted`
- `codex review --base <branch>`
- `codex review --commit <sha>`
- une session interactive `codex` démarrée fraîchement pour la review, avec la
  review comme premier work step

La fresh review session produit les findings.

Immédiatement après ces findings, et avant toute modification de code, il faut
émettre une **review decision**.

La review decision est un artefact de coordination obligatoire. Son support
officiel est :

- la sortie de la session interactive fraîche lorsque cette session est la
  surface de review ;
- le handoff du coordinateur, ou un commentaire PR équivalent, lorsque la
  surface d'entrée est `codex review`.

`docs/tasks.md` n'est pas le journal des review decisions. Il enregistre
uniquement les effets durables décidés par le routage de boucle : état de tâche,
tâche done, tâche bloquée, rework requis, ou déviation ouverte lorsque le modèle
opérationnel l'exige.

La review decision doit ensuite restater explicitement :

- la tâche reviewée, ou la surface de maintenance process reviewée ;
- le mode de review (`standard` ou `critical`) ;
- la source de review utilisée (`codex review ...` ou session interactive
  fraîche) ;
- les checks exécutés lorsque cette information est disponible ;
- soit les findings actionnables, soit l'absence explicite de findings ;
- en cas d'absence de findings, les invariants revus et les checks ou falsifications qui justifient ce verdict propre.

Forme minimale attendue :

```text
Review decision:
- Surface: <TASK_ID or process surface>
- Mode: <standard|critical>
- Source: <codex review command or fresh interactive review>
- Verdict: <clean verdict|actionable findings|blocked>
- Findings mapping: <none or each finding -> §10 class + blocking status>
- Checks/falsifications: <checks reported by reviewer, if available>
- Routing: <done|needs_rework|blocked|handoff only>
```

États de review decision :

- classer le résultat en `clean verdict`, `actionable findings` ou `blocked` ;
- mapper chaque finding actionnable natif vers exactement une classification primaire selon la section 10 ;
- indiquer séparément pour chaque finding actionnable s'il est `bloquant` ou `non bloquant` ;
- pour un `clean verdict` task-scoped, router vers la transition de tâche
  seulement si la définition de done de §19.1 est satisfaite ;
- pour un `clean verdict` process-maintenance, ne pas marquer de tâche done et ne pas modifier `docs/tasks.md` sauf si la maintenance change explicitement le plan de tâches ;
- ne pas inventer de finding supplémentaire au-delà de la sortie native ;
- ne pas utiliser la review decision comme un second moteur de review.

Une review de diff ne doit pas proposer de nouvelles features.

#### Modes de review

Le protocole local distingue deux modes :

- `standard` : mode par défaut pour un diff de tâche borné qui ne touche pas une surface critique ;
- `critical` : mode obligatoire dès que le diff touche parser, renderer, frontière CLI, mutation filesystem, packaging, test harness, `docs/contract.md`, `docs/evals.md`, ou la mécanique repo-locale de review/orchestration.

Règles :

- les deux modes reviewent le diff cumulé complet de la tâche ou de la surface
  de maintenance process ;
- les deux modes doivent lister les nouveaux invariants introduits par le diff ;
- les deux modes doivent mapper chaque invariant nouveau vers un check existant ou un check de falsification dérivé par le reviewer ;
- si la review est lancée sans task ID explicite dans le prompt runtime, elle
  doit d'abord déterminer si le diff est une maintenance process bornée ; si
  oui, cette surface process devient le scope de review ; sinon, elle doit
  prendre `docs/tasks.md` `## Execution State` -> `Current active task` comme
  ancre de tâche ; si aucune surface process bornée ni tâche active exploitable
  n'existe, la review doit s'arrêter au lieu de deviner ;
- les findings de review viennent d'une fresh review session Codex ;
- la guidance de review durable vit dans `AGENTS.md` et `docs/code-review.md`, pas dans des prompts runtime routiniers ;
- `codex review --uncommitted` n'est autorisé que si le worktree est strictement borné au diff cumulé de la tâche ou de la maintenance process ; sinon utiliser une surface bornée via `--base` ou `--commit` ;
- une session interactive `codex` n'est autorisée comme surface de review que si elle est fraîche et que la review est son premier work step ;
- la review decision consomme les findings de review et les mappe vers l'état de boucle ; elle vit dans le handoff du coordinateur ou commentaire PR équivalent, sauf sur le chemin interactif frais où la session de review peut l'émettre directement ; elle ne remplace pas la review et ne produit pas de finding nouveau ;
- aucune modification de code n'est autorisée avant que la review decision soit explicite ;
- `critical` doit être lancé depuis une fresh session Codex ; si la session courante ne convient pas, la review s'arrête avec une classification `tooling problem` ;
- aucun second moteur de review n'est autorisé.

## 15. Gestion des fixtures et goldens

Les fixtures sont des artefacts de contrat exécutable.

Règles :

- une fixture doit avoir un identifiant stable ;
- une fixture doit déclarer son objectif ;
- une fixture doit définir son arbre de dépôt ;
- une fixture doit définir la commande exécutée ;
- une fixture doit définir le cwd ;
- une fixture doit définir l'exit code attendu ;
- une fixture doit définir les attentes `stdout` et `stderr` ;
- une fixture doit définir les attentes de mutation ou non-mutation ;
- un golden JSON de succès doit être vérifié byte-for-byte ;
- une différence de golden est une régression sauf changement contractuel explicite ;
- les objets JSON doivent rester fermés ;
- aucun champ hors contrat ne peut être accepté par commodité.

Les goldens ne doivent pas être régénérés automatiquement sans review.

## 16. Politique de dépendances

Les dépendances publiées doivent être figées et justifiées lorsqu'elles implémentent un profil normatif.

Une dépendance est structurante si elle affecte :

- parsing Markdown ;
- parsing YAML ;
- parsing TypeScript ;
- sérialisation ;
- gestion des chemins ;
- écriture atomique ;
- CLI parsing ;
- tests de fixtures.

Toute dépendance structurante doit avoir :

- une version exacte ou verrouillée ;
- un rôle documenté ;
- un test ou spike confirmant sa compatibilité avec le contrat ;
- une absence de comportement implicite contraire au déterminisme attendu.

Aucune dépendance ne doit introduire réseau, horloge, Git ou environnement comme source de vérité.

## 17. Politique de spikes

Un spike est autorisé lorsqu'une hypothèse technique pourrait invalider le design ou le contrat.

Exemples :

- profil exact du parser Markdown ;
- comportement YAML sur duplicate keys ;
- diagnostics syntaxiques TypeScript ;
- écriture atomique cross-platform ;
- performance cold start ;
- sérialisation canonique.

Un spike doit produire :

- une question précise ;
- un protocole court ;
- un résultat ;
- une décision ;
- les conséquences sur design, contrat, evals ou tâches.

Un spike ne doit pas devenir une implémentation produit cachée.

Si un spike sélectionne, rejette ou borne une dépendance structurante ou une stratégie structurante couverte par la politique ADR, sa fermeture exige aussi :

- la création ou la mise à jour de l'ADR correspondante ;
- un statut ADR explicite (`Accepted`, `Rejected`, `Superseded` ou maintien explicite en `Proposed`) ;
- la mise à jour de `design.md` et `tasks.md` si la décision change l'architecture cible ou l'ordre d'exécution ;
- le maintien des tâches dépendantes à l'état bloqué tant que la décision normative n'est pas enregistrée.

## 18. Commit et granularité de changement

Les changements doivent rester petits et attribuables.

Un changement idéal référence :

- une tâche ;
- une ou plusieurs sections du contrat ;
- une ou plusieurs fixtures ou tests ;
- un type de changement : docs, test, harness, implémentation, refactor, spike.

Règles :

- ne pas mélanger changement de contrat et implémentation dans le même patch, sauf décision explicite ;
- ne pas mélanger refactor large et nouvelle capacité ;
- ne pas mettre à jour des goldens sans explication ;
- ne pas corriger plusieurs classes de défauts sans les classifier ;
- tout commit lié à une tâche bornée doit inclure son identifiant (`Tn.m`, `Tn.ma` ou `Sn`) dans le message de commit ;
- préférer une séquence de petits patchs vérifiables à un patch global.

## 19. Definition of Done

### 19.1 Tâche

Une tâche est done lorsque :

- l'objectif de la tâche est rempli ;
- le code respecte les sections de contrat référencées ;
- les tests unitaires pertinents passent ;
- les fixtures référencées passent ;
- les checks statiques repo-locaux applicables aux fichiers touchés passent ; un test ciblé ne suffit pas à lui seul lorsqu'un lint, un check de formatage ou un check de type couvre cette surface ;
- les cas d'échec sont couverts ;
- les politiques `stdout`, `stderr`, exit code et mutation sont vérifiées si applicables ;
- aucun comportement hors scope n'a changé ;
- aucune eval n'a été affaiblie ;
- toute limite ou dette introduite est documentée.

### 19.2 Jalon

Un jalon est done lorsque :

- toutes ses tâches obligatoires sont done ;
- les fixtures associées passent ;
- les risques résiduels sont listés ;
- aucune contradiction document/code connue ne reste ouverte ;
- les tâches suivantes sont débloquées.

### 19.3 Release candidate

Une release candidate est done lorsque :

- les gates de `docs/evals.md` passent ;
- le contrat publié est satisfait ;
- les performances sont dans les budgets ;
- la reproductibilité est validée ;
- les dépendances sont figées ;
- la matrice plateforme est validée ;
- les questions produit ouvertes sont explicitement différées ;
- aucun bug critique connu ne viole le contrat.

## 20. Prompts de travail recommandés

### 20.1 Génération de tâches

```text
À partir de docs/brief.md, docs/contract.md, docs/design.md et docs/evals.md, produis docs/tasks.md.

Contraintes :
- aucune nouvelle feature ;
- chaque tâche référence une section du contrat ;
- chaque tâche référence un composant du design ;
- chaque tâche référence une fixture, une famille d'evals ou un gate ;
- chaque tâche a un critère de sortie vérifiable ;
- les tâches de spike sont séparées des tâches d'implémentation ;
- les tâches sont regroupées par jalons.
```

### 20.2 Implémentation d'une tâche

```text
Implémente uniquement la tâche <TASK_ID> de docs/tasks.md.

Lis d'abord :
- docs/operating-model.md
- docs/contract.md sections <...>
- docs/design.md sections <...>
- docs/evals.md fixtures/gates <...>

Contraintes :
- ne modifie pas docs/contract.md ;
- ne modifie pas les fixtures hors scope ;
- ne change pas le comportement public hors tâche ;
- ne fais pas de refactor large ;
- respecte les politiques stdout/stderr/exit/mutation.

Retour attendu :
- résumé court ;
- fichiers modifiés ;
- tests exécutés ;
- fixtures passées ;
- risques ou limites.
```

### 20.3 Review de diff

```text
Review le diff cumulé complet de la tâche <TASK_ID> ou de la surface process <PROCESS_SURFACE> uniquement contre cette tâche ou cette surface et les documents normatifs applicables.

À chaque passe de review :
- inspecte le diff cumulé complet depuis le début de la tâche ou de la maintenance process, pas seulement le dernier delta de correction ;
- si c'est une deuxième passe ou plus, accorde une attention supplémentaire aux fichiers modifiés depuis la review précédente tout en re-reviewant le diff cumulé complet.
- exécute la passe dans une fresh review session Codex ;
- garde la guidance de review durable dans `AGENTS.md` et `docs/code-review.md`, pas dans un prompt ad hoc ;
- n'utilise aucun wrapper qui relit les fichiers de session Codex ni aucun moteur alternatif.
- si aucun task ID explicite n'est donné au lancement, détermine d'abord si le diff est une maintenance process bornée ; si oui, review cette surface process ; sinon ancre la review sur `docs/tasks.md` `## Execution State` -> `Current active task`, ou stoppe si cette valeur n'est pas exploitable.
- émets une review decision explicite immédiatement après les findings, et avant toute modification de code.
- si la surface d'entrée est `codex review`, le coordinateur émet la review decision dans son handoff ou commentaire PR équivalent juste après lecture de la sortie.
- si la surface d'entrée est une session interactive `codex`, la même session peut émettre la review decision.

Ne propose pas de nouvelle feature.
Ne fais pas de review de style sauf si cela affecte le contrat, les evals ou la maintenabilité immédiate.

Dans la review decision, classe chaque finding actionnable avec exactement une classification primaire selon la section 10 :
- contract violation ;
- spec ambiguity ;
- design gap ;
- eval defect ;
- product question ;
- tooling problem ;
- out-of-scope discovery.

Indique séparément pour chaque finding actionnable s'il est :
- bloquant ;
- non bloquant.

Des tags secondaires de triage peuvent être ajoutés.
Une sévérité éventuelle (`high` / `medium` / `low`) reste informative uniquement et ne décide jamais à elle seule du done.
```

### 20.4 Analyse d'échec de fixture

```text
Analyse l'échec de fixture <FIXTURE_ID>.

Contraintes :
- commence par identifier l'oracle attendu ;
- compare le résultat réel au contrat ;
- classe l'échec selon la taxonomie de docs/operating-model.md ;
- ne propose pas de changement d'eval sauf si l'eval contredit clairement le contrat ;
- propose la correction minimale.
```

## 21. Règle finale

Pendant le développement de v1.0, toute action doit pouvoir être rattachée à l'une des catégories suivantes :

- clarifier le scope produit ;
- préciser le contrat ;
- rendre le design compatible avec le contrat ;
- vérifier le contrat ;
- implémenter une tâche traçable ;
- corriger une violation classifiée ;
- renforcer une régression.

Toute action qui ne rentre dans aucune de ces catégories est hors méthode et doit être refusée, différée ou reformulée.
