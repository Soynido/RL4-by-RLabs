---
name: "Architecture Prompt System: Alignement Vision Cible"
overview: Plan d'exécution pour rendre le système de prompting souverain, déterministe et réutilisable, en séparant explicitement Intention (Kernel), Snapshot (artefact canonique), et Projection (Builders), sans casser les comportements existants.
todos:
  - id: phase0-intent
    content: "Phase 0: Introduire KernelIntent et rendre le Kernel souverain sur les intentions"
    status: completed
  - id: phase1-snapshot
    content: "Phase 1: Créer PromptSnapshot comme artefact réel dans UnifiedPromptBuilder"
    status: completed
  - id: phase2-projection
    content: "Phase 2: Implémenter projection explicite snapshot → prompt avec API renderPrompt()"
    status: pending
  - id: phase3-cleanup
    content: "Phase 3: Nettoyage ciblé - déplacer wording hors de PromptOptimizer"
    status: pending
---

# Architecture Prompt System: Alignement Vision Cible

## Objectif Stratégique

Rendre le système de prompting souverain, déterministe et réutilisable, sans casser les comportements existants, en séparant explicitement :

- **Intention** (Kernel) : Le Kernel décide pourquoi générer un prompt
- **Snapshot** (artefact canonique) : PromptSnapshot versionné, vérifié, réutilisable
- **Projection en prompt** (Builders) : Transformation snapshot + intention → prompt markdown

---

## Principes d'Exécution

1. **Ne casse rien** : mêmes commandes, mêmes prompts
2. **Le Kernel décide l'intention, mais en mode advisory** : la commande = signal fort
3. **PromptSnapshot est un artefact, pas un nouveau système de prompt**
4. **Pas de nouveaux builders** : on wrappe l'existant, on ne réécrit pas

## Invariants Non Négociables

- ✅ Les prompts actuels restent fonctionnellement identiques (même wording, même structure)
- ✅ UnifiedPromptBuilder, PromptOptimizer et TimeMachinePromptBuilder ne sont pas supprimés
- ✅ PromptSnapshot est le DTO canonique (défini dans `kernel/context/snapshot/PromptSnapshot.ts`)
- ✅ Le Kernel décide l'intention (mode advisory : commande = signal fort, jamais contredite)
- ✅ 1 Snapshot → N Projections (Snapshot / TimeMachine / Magic PR)
- ✅ Backward-compatible : aucune régression fonctionnelle

---

## État Actuel (Analyse Forensique)

### Ce qui existe et fonctionne

- ✅ PromptSnapshot DTO bien défini (`kernel/context/snapshot/PromptSnapshot.ts`)
- ✅ PromptSnapshotValidator pour intégrité (`kernel/context/snapshot/PromptSnapshotValidator.ts`)
- ✅ UnifiedPromptBuilder génère des prompts fonctionnels
- ✅ PromptOptimizer optimise la structure
- ✅ TimeMachinePromptBuilder génère des prompts historiques
- ✅ RCEP encoding infrastructure en place

### Gaps identifiés

1. **PromptSnapshot est orphelin** : DTO existe mais UnifiedPromptBuilder ne le crée jamais (utilise `SnapshotData` interne)
2. **Intentions hard-codées** : Dans `PromptProfile` (UnifiedPromptBuilder) et dans les builders (TimeMachinePromptBuilder)
3. **Kernel est pass-through** : Ne décide pas l'intention, transmet juste le `mode` utilisateur
4. **Snapshot et prompt fusionnés** : Pas de séparation claire, pas de réutilisation
5. **Wording dans Optimizer** : Sections markdown hard-codées dans `PromptOptimizer.buildOptimizedPrompt()`

### Responsabilités actuelles

| Composant | Responsabilité Actuelle | Responsabilité Cible |

|-----------|------------------------|---------------------|

| **Kernel** | Route IPC queries, instancie builders | Décide intention, orchestre snapshot → prompt |

| **UnifiedPromptBuilder** | Agrège données, génère prompt, contient profiles | Crée PromptSnapshot, projette snapshot → prompt |

| **PromptOptimizer** | Optimise structure + wording markdown | Optimise structure uniquement (sélection, priorisation) |

| **TimeMachinePromptBuilder** | Collecte données, génère prompt direct | Projette snapshot → prompt (même snapshot que UnifiedPromptBuilder) |

---

## Plan d'Exécution par Phases

### Phase 0 — Kernel Intent Explicite (0% changement de prompt)

**Objectif** : Rendre l'intention visible, loggable, stable. Le Kernel devient souverain en mode advisory.

**Actions** :

1. **Introduire `KernelIntent` objet** dans `kernel/core/KernelIntent.ts` :
   ```typescript
   export interface KernelIntent {
     kind: "snapshot" | "timemachine" | "magic_pr" | "custom";
     mode: "strict" | "flexible" | "exploratory" | "free" | "firstUse";
     source: {
       command: string;        // "generate_snapshot", "build_time_machine_prompt", etc.
       confidence: number;     // 0.0-1.0
       advisory: boolean;      // true = Kernel suggère, false = commande directe
     };
     ptrScheme: "mil-his-v1" | "internal-v1";
   }
   ```


**Note** : `"custom"` réservé pour intentions futures (debug, audit, explain, replay, etc.) sans rupture de type.

2. **Créer `IntentionResolver`** dans `kernel/core/IntentionResolver.ts` :

   - Mappe commande → intent.kind (jamais contredit)
   - Règle stricte : si `command === "build_time_machine_prompt"` → `intent.kind = "timemachine"` point
   - Ajoute refinements (mode, ptrScheme) sans jamais contredire la commande
   - `confidence` basé sur clarté de la commande
   - `advisory` = true si Kernel suggère des ajustements, false si commande directe

3. **Modifier Kernel (`entrypoint.ts`)** :

   - Dans `handleQuery()`, résoudre l'intention avant d'appeler les builders
   - Passer l'intention aux builders (même si ignorée au début pour backward-compat)
   - Logger l'intention résolue (observabilité)

4. **Modifier UnifiedPromptBuilder** :

   - Ajouter paramètre optionnel `intent?: KernelIntent` à `generate()`
   - Logger l'intention reçue (observabilité)
   - Ignorer l'intention pour le moment (backward-compat)

**Fichiers modifiés** :

- `kernel/core/KernelIntent.ts` (nouveau)
- `kernel/core/IntentionResolver.ts` (nouveau)
- `kernel/process/entrypoint.ts` (lignes 174-189, 239-246)
- `kernel/api/UnifiedPromptBuilder.ts` (signature `generate()`)

**Résultat attendu** :

- ✅ 0% changement de prompt (intention ignorée par builders)
- ✅ Le Kernel devient souverain sur le "pourquoi" (mode advisory)
- ✅ Observabilité claire de l'intention (logs)
- ✅ Extension continue de fonctionner (backward-compat)

**Critère d'acceptation (BLOQUANT pour VSIX)** :

- ✅ KernelIntent existe (objet, pas enum brut)
- ✅ IntentionResolver branché dans le Kernel
- ✅ Les commandes existantes ne changent pas
- ✅ L'intention est loggée (observabilité)
- ✅ Aucun builder ne casse si intent est absent
- ✅ L'extension fonctionne strictement comme avant, mais le Kernel sait pourquoi il génère un prompt

**Livrables** :

- `KernelIntent` objet défini (pas juste une string)
- `IntentionResolver` opérationnel (commande = signal fort)
- Kernel résout et passe intention (même si non utilisée)

---

### Phase 1 — Snapshot Canonique "en Parallèle" (non utilisé pour générer le prompt)

**Objectif** : Produire un PromptSnapshot réel (validé + checksum), sans toucher à la chaîne actuelle.

**Actions** :

1. **Dans UnifiedPromptBuilder.generate()** :

   - **Continuer le pipeline actuel** (inchangé) :
     - `SnapshotData` → `PromptContext` → `PromptOptimizer` → prompt
   - **Ajouter étape non intrusive en parallèle** :
     - Après `buildSnapshotData()`, créer snapshot via `createPromptSnapshotFromExistingArtifacts(snapshotData, promptContext)`
     - Mapper les artefacts existants vers `PromptSnapshot` :
       - `SnapshotData.plan/tasks/context` → `PromptSnapshot.layers/topics`
       - `SnapshotData.timeline` → `PromptSnapshot.timeline`
       - `SnapshotData.adrs` → `PromptSnapshot.decisions`
       - `SnapshotData.anomalies` → `PromptSnapshot.insights`
     - **Documenter l'origine exacte** dans `PromptSnapshot.source` :
       ```typescript
       source: {
         type: "runtime",
         component: "UnifiedPromptBuilder",
         version: "1.0",
         artifacts: ["SnapshotData", "PromptContext"]  // Origine documentaire
       }
       ```

     - Utiliser `PromptSnapshotValidator.validateAndSeal()` pour checksum
     - Logger le snapshot créé (observabilité)
     - Retourner le snapshot dans les métadonnées (nouveau champ `snapshot`)

2. **Optionnel : Persistence** :

   - Sauvegarder snapshot dans `.reasoning_rl4/snapshots/` avec nom basé sur timestamp
   - Permet réutilisation future

**Fichiers modifiés** :

- `kernel/api/UnifiedPromptBuilder.ts` :
  - Nouvelle méthode `createPromptSnapshotFromExistingArtifacts()` (lignes ~900-1000)
  - Modification `generate()` (lignes 350-354) : ajout création snapshot en parallèle
  - Ajout import `PromptSnapshot`, `PromptSnapshotValidator`

**Résultat attendu** :

- ✅ PromptSnapshot existe réellement (créé, validé, checksumé)
- ✅ Snapshot versionné, vérifiable, rejouable
- ✅ **0% changement de prompt** (pipeline actuel intact)
- ✅ Métadonnées enrichies avec snapshot

**Critère d'acceptation (BLOQUANT pour VSIX)** :

- ✅ PromptSnapshot est effectivement créé
- ✅ PromptSnapshotValidator est appelé en prod
- ✅ Checksum stable (tests de déterminisme OK)
- ✅ Snapshot n'influence PAS le prompt final
- ✅ Snapshot visible dans metadata ou logs
- ✅ Même prompt qu'avant (byte-identique), snapshot traçable en plus

**Livrables** :

- `PromptSnapshot` créé dans UnifiedPromptBuilder (en parallèle)
- `PromptSnapshotValidator` utilisé en production
- Snapshot dans métadonnées retournées
- (Optionnel) Persistence snapshot

---

### Phase 2 — Projection Explicite Snapshot → Prompt (sans changer le rendu)

**Objectif** : Rendre vraie la frontière "snapshot ≠ prompt" et préparer 1→N.

**Actions** :

1. **Introduire fonction de projection** (pas un nouveau framework) :

   - Créer méthode `renderPrompt(intent: KernelIntent, snapshot: PromptSnapshot, legacyArtifacts?: { snapshotData, promptContext }): string`
   - Dans `UnifiedPromptBuilder` (wrapper autour du code existant)

2. **Modifier UnifiedPromptBuilder.generate()** avec feature flag :

   - Créer snapshot (Phase 1)
   - Résoudre intention (Phase 0)
   - **Feature flag OFF** (défaut) :
     - Utiliser `legacyPath()` (code actuel inchangé)
     - Prompt généré comme aujourd'hui
   - **Feature flag ON** :
     - Appeler `renderPrompt(intent, snapshot, { snapshotData, promptContext })`
     - `renderPrompt()` appelle le code existant en interne (wrapper)
     - **Vérifier byte-identique** avec prompt legacy (golden tests)

3. **Tests golden** :

   - Capturer prompts générés avec feature flag OFF (référence)
   - Comparer byte-à-byte avec feature flag ON
   - **Normalisation interdite** : aucune normalisation (trim, newline, markdown reflow) avant comparaison
   - Échec si différence (même whitespace)
   - **Règle stricte** : si un futur dev normalise, le test doit échouer, pas s'adapter

4. **Refactorer TimeMachinePromptBuilder** (plus tard, si besoin) :

   - Option A : Utiliser même snapshot que UnifiedPromptBuilder
   - Option B : Créer snapshot spécifique (mais structure canonique)
   - Implémenter `renderPrompt(snapshot, intent)` avec feature flag

5. **Refactorer CommitPromptGenerator** (plus tard, si besoin) :

   - Créer snapshot depuis `CommitContext`
   - Implémenter `renderPrompt(snapshot, intent)` avec feature flag

**Fichiers modifiés** :

- `kernel/api/UnifiedPromptBuilder.ts` :
  - Nouvelle méthode `renderPrompt()` (wrapper autour du code existant)
  - `generate()` avec feature flag (legacyPath vs renderPrompt)
  - Tests golden pour validation byte-identique
- `kernel/api/TimeMachinePromptBuilder.ts` (Phase 2+ si besoin)
- `kernel/api/CommitPromptGenerator.ts` (Phase 2+ si besoin)

**Résultat attendu** :

- ✅ **Même prompt final** (byte-identique avec golden tests)
- ✅ Frontière snapshot / prompt explicite
- ✅ Support natif multi-intentions (préparé)
- ✅ Feature flag permet bascule progressive

**Livrables** :

- Fonction `renderPrompt(intent, snapshot, legacyArtifacts?)` implémentée
- Feature flag pour bascule progressive
- Tests golden (byte-identique)
- UnifiedPromptBuilder peut utiliser projection (quand feature flag ON)

---

### Phase 3 — Nettoyage Ciblé : Sortir le "Wording" du Optimizer (optionnel)

**Objectif** : PromptOptimizer redevient sélection/priorisation/structure, et le discours appartient à la projection.

**Prérequis** :

- ✅ Phase 2 est stable (feature flag ON, tests golden passent)
- ✅ Tests de régression sur prompts en place

**Actions** :

1. **Extraire wording de PromptOptimizer** :

   - Déplacer `buildOptimizedPrompt()` (lignes 482-530) → `renderPrompt()` dans UnifiedPromptBuilder
   - `PromptOptimizer` devient :
     - Sélection de fragments
     - Priorisation
     - Normalisation structure
     - **PAS de wording markdown**
   - Retourne structure optimisée (fragments, priorités, métriques)

2. **Builders portent le discours** :

   - `renderPrompt()` dans UnifiedPromptBuilder génère markdown
   - Sections markdown dans renderer, pas dans optimizer
   - PromptOptimizer retourne structure, renderer génère markdown

**Fichiers modifiés** :

- `kernel/api/PromptOptimizer.ts` :
  - Retirer `buildOptimizedPrompt()` (lignes 482-530)
  - Retourner structure optimisée (fragments, priorités, métriques)
- `kernel/api/UnifiedPromptBuilder.ts` :
  - `renderPrompt()` contient maintenant le wording (déplacé depuis PromptOptimizer)
  - Génère markdown avec sections appropriées

**Résultat attendu** :

- ✅ Optimizer pur (pas de wording)
- ✅ Renderer intentionnel (discours spécifique)
- ✅ Architecture propre et extensible
- ✅ Même prompt final (validé par tests golden)

**Livrables** :

- PromptOptimizer sans wording
- Renderer avec wording (dans UnifiedPromptBuilder)
- Architecture alignée vision long terme

---

## Livrables Clés

### Phase 0 — Kernel Intent Explicite

- ✅ `KernelIntent` objet défini (kind, mode, source, ptrScheme)
- ✅ `IntentionResolver` opérationnel (commande = signal fort, jamais contredite)
- ✅ Kernel résout et passe intention (mode advisory)
- ✅ 0% changement de prompt

### Phase 1 — Snapshot Canonique

- ✅ `PromptSnapshot` créé dans UnifiedPromptBuilder (en parallèle, non utilisé)
- ✅ `PromptSnapshotValidator` utilisé en production (validation + checksum)
- ✅ Snapshot dans métadonnées retournées
- ✅ 0% changement de prompt (pipeline actuel intact)

### Phase 2 — Projection Explicite

- ✅ Fonction `renderPrompt(intent, snapshot, legacyArtifacts?)` implémentée
- ✅ Feature flag pour bascule progressive (legacyPath vs renderPrompt)
- ✅ Tests golden (byte-identique)
- ✅ Frontière snapshot / prompt explicite

### Phase 3 — Nettoyage Wording (optionnel, si Phase 2 stable)

- ✅ PromptOptimizer pur (pas de wording, seulement sélection/priorisation)
- ✅ Renderer avec wording (dans UnifiedPromptBuilder)
- ✅ Tests de régression en place

---

## Critères de Succès

### Fonctionnels

- ✅ Même prompt qu'avant (wording identique, structure identique)
- ✅ Aucune régression fonctionnelle
- ✅ Extension continue de fonctionner

### Architecturaux

- ✅ Snapshot exploitable indépendamment (versionné, vérifiable)
- ✅ Kernel décide pourquoi, pas seulement comment
- ✅ Ajout futur d'un nouveau prompt sans toucher aux snapshots
- ✅ 1 snapshot → N prompts (démontré)

### Qualité

- ✅ Code testable (snapshot isolé, projection isolée)
- ✅ Observabilité (intentions loggées, snapshots tracés)
- ✅ Backward-compatible (API existante préservée)

---

## Risques et Mitigation

### Risque : Changement API builders

**Mitigation** : Paramètres optionnels, backward-compat, wrapper autour du code existant

### Risque : Performance (création snapshot supplémentaire)

**Mitigation** : Snapshot création est O(n) où n = données, pas de duplication majeure

### Risque : Complexité ajoutée

**Mitigation** : Phases incrémentales, chaque phase testable indépendamment

### Risque : Snapshot persistence (Phase 1 optionnel)

**Mitigation** : Optionnel, peut être ajouté plus tard sans impact

---

## Fichiers Clés

### Nouveaux fichiers

- `kernel/core/KernelIntent.ts` (Phase 0) - Interface objet, pas type string
- `kernel/core/IntentionResolver.ts` (Phase 0) - Résout intention (commande = signal fort)

### Fichiers modifiés

- `kernel/process/entrypoint.ts` (Phase 0, 2) - Résout intention, passe aux builders
- `kernel/api/UnifiedPromptBuilder.ts` (Phase 0, 1, 2, 3) - Principal fichier modifié
  - Phase 0 : Accepte `intent?` (ignoré)
  - Phase 1 : Crée snapshot en parallèle
  - Phase 2 : Feature flag + `renderPrompt()` + tests golden
  - Phase 3 : Wording déplacé depuis PromptOptimizer
- `kernel/api/TimeMachinePromptBuilder.ts` (Phase 2+, optionnel)
- `kernel/api/CommitPromptGenerator.ts` (Phase 2+, optionnel)
- `kernel/api/PromptOptimizer.ts` (Phase 3, optionnel) - Retire wording

### Fichiers existants (utilisés)

- `kernel/context/snapshot/PromptSnapshot.ts` (Phase 1) - DTO canonique
- `kernel/context/snapshot/PromptSnapshotValidator.ts` (Phase 1) - Validation + checksum

---

## Ordre d'Exécution

### Avant Build VSIX (BLOQUANT)

1. **Phase 0** → Kernel Intent explicite (0% changement prompt)

   - ✅ Critères d'acceptation validés
   - ✅ Tests manuels OK
   - ✅ **BLOQUANT** : Ne pas continuer si échec

2. **Phase 1** → Snapshot canonique en parallèle (non utilisé)

   - ✅ Critères d'acceptation validés
   - ✅ Tests de déterminisme OK (checksum stable)
   - ✅ **BLOQUANT** : Ne pas continuer si échec

3. **Checklist technique** → Pré-build

   - ✅ Compilation clean
   - ✅ Tests passent
   - ✅ Prompt byte-identique

4. **Build VSIX** → Packaging

   - ✅ `vsce package` sans erreur

5. **Installation et Validation** → Cursor

   - ✅ Extension fonctionne
   - ✅ Commandes inchangées
   - ✅ Prompts identiques

### Après VSIX Validé (Optionnel)

6. **Phase 2** → Projection explicite avec feature flag (tests golden)

   - ✅ Feature flag OFF par défaut
   - ✅ Tests golden en place

7. **Phase 3** → Nettoyage wording (seulement si Phase 2 stable)

   - ✅ Tests de régression en place

**Chaque phase est indépendante et testable**. Phases 0 et 1 sont BLOQUANTES pour le build VSIX.

---

---

## Garde-fous Obligatoires AVANT Build VSIX

### Phase 0 — Kernel Intent (BLOQUANT)

**Doit être vrai avant de continuer** :

- ✅ KernelIntent existe (objet, pas enum brut)
- ✅ IntentionResolver branché dans le Kernel
- ✅ Les commandes existantes ne changent pas
- ✅ L'intention est loggée (observabilité)
- ✅ Aucun builder ne casse si intent est absent

**Critère d'acceptation** :

> L'extension fonctionne strictement comme avant, mais le Kernel sait pourquoi il génère un prompt.

### Phase 1 — PromptSnapshot réel (BLOQUANT)

**Doit être vrai avant VSIX** :

- ✅ PromptSnapshot est effectivement créé
- ✅ PromptSnapshotValidator est appelé en prod
- ✅ Checksum stable (tests de déterminisme OK)
- ✅ Snapshot n'influence PAS le prompt final
- ✅ Snapshot visible dans metadata ou logs

**Critère d'acceptation** :

> Même prompt qu'avant (byte-identique), snapshot traçable en plus.

### Interdictions Absolues AVANT VSIX

- ❌ Pas de refactor PromptOptimizer
- ❌ Pas de nouveau "ProjectionEngine"
- ❌ Pas d'intent "intelligent" qui override l'utilisateur
- ❌ Pas de modification du wording des prompts
- ❌ Pas de Phase 2/3 en douce
- ❌ Pas de snapshot qui "commence à être utilisé un peu"
- ❌ Pas d'optimizer "amélioré" avant Phase 2
- ❌ Pas de wording déplacé avant golden tests

---

## Checklist Technique AVANT Packaging

### Pré-build

```bash
npm run compile
npm test            # si tests présents
```

**Vérifications** :

- ✅ Compilation clean (aucune erreur TypeScript)
- ✅ Tests passent (si présents)
- ✅ Snapshot généré (log ou metadata)
- ✅ Prompt identique à la version précédente (byte-identique, normalisation interdite)
- ✅ Commandes VS Code inchangées
- ✅ Aucun nouveau fichier "framework" inutile

### Build VSIX

```bash
vsce package
```

**Vérifications post-build** :

- ✅ VSIX généré sans erreur
- ✅ Taille raisonnable (pas de bloat)
- ✅ Manifest valide

### Installation et Validation

1. **Install VSIX dans Cursor** :
   ```bash
   code --install-extension rl4-extension-X.X.X.vsix
   ```

2. **Validation réelle dans Cursor** :

   - ✅ Extension s'active sans erreur
   - ✅ Commandes disponibles (palette de commandes)
   - ✅ Génération Snapshot fonctionne
   - ✅ Génération TimeMachine fonctionne
   - ✅ Magic PR fonctionne (si activé)
   - ✅ Observation du comportement LLM (prompts identiques)

3. **Vérifications observabilité** :

   - ✅ Logs montrent KernelIntent résolu
   - ✅ Logs montrent PromptSnapshot créé
   - ✅ Métadonnées contiennent snapshot (si exposé)

---

## Ordre d'Exécution avec Garde-fous

1. **Phase 0** → Kernel Intent explicite

   - ✅ Critères d'acceptation validés
   - ✅ Tests manuels OK
   - ✅ **BLOQUANT** : Ne pas continuer si échec

2. **Phase 1** → Snapshot canonique en parallèle

   - ✅ Critères d'acceptation validés
   - ✅ Tests de déterminisme OK (checksum stable)
   - ✅ **BLOQUANT** : Ne pas continuer si échec

3. **Checklist technique** → Pré-build

   - ✅ Compilation clean
   - ✅ Tests passent
   - ✅ Prompt byte-identique

4. **Build VSIX** → Packaging

   - ✅ `vsce package` sans erreur

5. **Installation et Validation** → Cursor

   - ✅ Extension fonctionne
   - ✅ Commandes inchangées
   - ✅ Prompts identiques

6. **Phase 2** → Projection explicite (APRÈS VSIX validé)

   - ✅ Feature flag OFF par défaut
   - ✅ Tests golden en place

7. **Phase 3** → Nettoyage wording (APRÈS Phase 2 stable)

   - ✅ Tests de régression en place

---

## Vérité Finale

Si ce plan est suivi :

- ✅ La vision cible est atteinte
- ✅ Sans dette technique
- ✅ Sans rupture fonctionnelle
- ✅ Sans réécriture inutile
- ✅ Architecture souveraine et extensible
- ✅ **VSIX buildable et installable après Phase 0 + Phase 1**