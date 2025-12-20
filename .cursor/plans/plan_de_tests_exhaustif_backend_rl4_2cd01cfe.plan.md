---
name: Plan de tests exhaustif backend RL4
overview: "Plan de tests exhaustif pour valider le fonctionnement complet du backend RL4 : logs, fichiers .RL4, kernel, persistence, et intégration de tous les composants."
todos:
  - id: test-logs-output-channel
    content: "Tester l'output channel unique : vérifier qu'un seul channel 'RL4 by RLabs' existe dans VS Code"
    status: pending
  - id: test-logs-deduplication
    content: "Tester la déduplication : modifier le même fichier plusieurs fois en <1min et vérifier que le message apparaît une seule fois"
    status: pending
  - id: test-logs-rotation
    content: "Tester l'auto-rotation : générer >2000 lignes et vérifier le nettoyage automatique"
    status: pending
  - id: test-logs-file-changes
    content: "Tester les logs enrichis de file changes : vérifier chemin, taille, extension pour chaque modification"
    status: pending
  - id: test-rl4-parsing
    content: "Tester le parsing des fichiers .RL4 : Plan.RL4, Tasks.RL4, Context.RL4 avec frontmatter et Markdown"
    status: pending
  - id: test-rl4-write-tracking
    content: "Tester WriteTracker : vérifier que les écritures internes .RL4 n'apparaissent pas dans FileChangeWatcher"
    status: pending
  - id: test-kernel-persistence
    content: "Tester la persistence du kernel : redémarrer VS Code et vérifier que l'état est restauré (kernel.json)"
    status: pending
  - id: test-kernel-gaps
    content: "Tester la détection des gaps : attendre 15+ minutes et vérifier les logs toutes les 5 minutes"
    status: pending
  - id: test-kernel-cycles
    content: "Tester les cycles cognitifs : vérifier les logs de cycle start/end"
    status: pending
  - id: test-file-watcher
    content: "Tester FileChangeWatcher : modifier/ajouter/supprimer des fichiers et vérifier la détection"
    status: pending
  - id: test-git-listener
    content: "Tester GitCommitListener : faire un commit et vérifier la capture (hash, message, intent)"
    status: pending
  - id: test-ide-listener
    content: "Tester IDEActivityListener : ouvrir/fermer fichiers, générer erreurs linter et vérifier les snapshots"
    status: pending
  - id: test-build-listener
    content: "Tester BuildMetricsListener : lancer un build et vérifier la capture des métriques"
    status: pending
  - id: test-jsonl-integrity
    content: "Tester l'intégrité JSONL : vérifier que tous les fichiers .jsonl sont valides (append-only)"
    status: pending
  - id: test-upgrade-guard
    content: "Tester UpgradeGuard : corrompre un JSONL et vérifier la réparation automatique au démarrage"
    status: pending
  - id: test-kernel-history
    content: "Tester kernel history : vérifier que kernel_history.jsonl contient des snapshots d'état"
    status: pending
  - id: test-integration-init
    content: "Tester l'initialisation complète : activer l'extension dans un workspace vide et vérifier la création de tous les répertoires"
    status: pending
  - id: test-integration-ipc
    content: "Tester la communication IPC : utiliser une commande VS Code qui interroge le kernel et vérifier la réponse"
    status: pending
  - id: test-integration-session
    content: "Tester la persistence de session : fermer/rouvrir VS Code et vérifier que le kernel reprend où il était"
    status: pending
  - id: test-resilience-24h
    content: "Tester résilience 24h : laisser RL4 tourner 24h sans redémarrage et vérifier stabilité (pas de crash, pas de leak mémoire)"
    status: pending
  - id: test-resilience-jsonl-10k
    content: "Tester JSONL > 10k lignes : générer > 10k lignes et vérifier absence de dégradation (écritures rapides, fichier valide)"
    status: pending
  - id: test-resilience-output-channel
    content: "Tester Output Channel longue durée : générer > 10k lignes de logs et vérifier rotation OK, pas de ralentissement"
    status: pending
  - id: test-resilience-memory-drift
    content: "Tester dérive mémoire : laisser tourner 48h et vérifier RSS stable (±10%), pas d'accumulation de timers/listeners"
    status: pending
  - id: test-resilience-scheduler-precision
    content: "Tester précision scheduler : laisser tourner 24h et vérifier ticks toutes les 10s (±1s), résumés horaires à l'heure (±5min)"
    status: pending
  - id: test-pathological-giant-repo
    content: "Tester repo géant : ouvrir monorepo avec millions de fichiers et vérifier CPU stable, ignore patterns respectés"
    status: pending
  - id: test-pathological-symlinks
    content: "Tester repo avec symlinks : vérifier pas de boucles infinies, changements détectés, pas d'erreurs EPERM"
    status: pending
  - id: test-pathological-unreadable-files
    content: "Tester fichiers illisibles : créer fichiers avec permissions restreintes et vérifier gestion gracieuse, pas de crash"
    status: pending
  - id: test-ipc-slow-kernel
    content: "Tester kernel lent : forcer sleep 35s sur requête status et vérifier timeout correct, pas de deadlock"
    status: pending
  - id: test-ipc-partial-response
    content: "Tester réponse partielle : simuler réponse IPC incomplète et vérifier erreur détectée, pas de crash"
    status: pending
  - id: test-ipc-kernel-restart-during-request
    content: "Tester redémarrage pendant requête : tuer kernel pendant requête et vérifier échec gracieux, redémarrage automatique"
    status: pending
---

# Plan de tests exhaustif - Backend RL4

## Objectif

Valider que tous les composants du backend RL4 fonctionnent correctement : logs, fichiers .RL4, kernel, persistence, et intégration complète.

## Architecture testée

### Composants principaux

- **CognitiveLogger** : Logging centralisé avec output channel unique, déduplication, auto-rotation
- **StateRegistry** : Persistence de l'état du kernel (`kernel.json`, `kernel_history.jsonl`)
- **FileChangeWatcher** : Surveillance des modifications de fichiers
- **GitCommitListener** : Détection et capture des commits Git
- **IDEActivityListener** : Capture de l'activité IDE (fichiers ouverts, erreurs linter)
- **BuildMetricsListener** : Métriques de build/compilation
- **CognitiveScheduler** : Boucle principale du kernel (cycles, gaps, résumés horaires)
- **UpgradeGuard** : Réparation automatique des fichiers corrompus
- **KernelBridge** : Gestion du processus enfant du kernel
- **PlanTasksContextParser** : Parsing des fichiers .RL4 (Plan.RL4, Tasks.RL4, Context.RL4)
- **AppendOnlyWriter** : Écriture append-only JSONL pour traces et ledger

### Structure de données

- `.reasoning_rl4/governance/` : Plan.RL4, Tasks.RL4, Context.RL4
- `.reasoning_rl4/traces/` : kernel.jsonl, ide_activity.jsonl, build_metrics.jsonl
- `.reasoning_rl4/ledger/` : rbom.jsonl, cycles.jsonl
- `.reasoning_rl4/state/` : kernel.json, kernel_history.jsonl
- `.reasoning_rl4/logs/` : structured.jsonl

## Tests à effectuer

### 1. Tests des logs (CognitiveLogger)

#### 1.1 Output channel unique

- **Action** : Vérifier qu'un seul output channel "RL4 by RLabs" existe
- **Vérification** : Dans VS Code, ouvrir "View > Output" et vérifier qu'il n'y a qu'un seul channel "RL4 by RLabs"
- **Fichiers concernés** : `extension.ts` (ligne 54), `kernel/core/CognitiveLogger.ts` (lignes 32-33, 65-67)

#### 1.2 Déduplication des messages

- **Action** : Modifier le même fichier plusieurs fois en moins d'1 minute
- **Vérification** : Le message "📝 File modified" n'apparaît qu'une seule fois par minute
- **Fichiers concernés** : `kernel/core/CognitiveLogger.ts` (lignes 58-59, 223-229)

#### 1.3 Auto-rotation à 2000 lignes

- **Action** : Générer plus de 2000 lignes de logs (modifier beaucoup de fichiers)
- **Vérification** : À 1600 lignes (80%), message d'avertissement "⚠️ RL4 console approaching rotation limit"
- **Vérification** : À 2000 lignes, le channel est vidé avec message "🧹 RL4 console cleared"
- **Fichiers concernés** : `kernel/core/CognitiveLogger.ts` (lignes 57, 238-247)

#### 1.4 Logs structurés

- **Action** : Vérifier que les logs structurés sont écrits
- **Vérification** : Le fichier `.reasoning_rl4/logs/structured.jsonl` contient des entrées JSON valides
- **Fichiers concernés** : `kernel/core/CognitiveLogger.ts` (lignes 86-91, 261-264)

#### 1.5 Logs de file changes enrichis

- **Action** : Modifier un fichier (ajout, modification, suppression)
- **Vérification** : Les logs affichent le chemin relatif, la taille en KB, et l'extension
- **Format attendu** : `📝 File modified: path/to/file.ts (12.5 KB, .ts)`
- **Fichiers concernés** : `kernel/inputs/FileChangeWatcher.ts` (lignes 262-266, 297-301, 332-335)

### 2. Tests des fichiers .RL4

#### 2.1 Parsing Plan.RL4

- **Action** : Vérifier que Plan.RL4 est parsé correctement
- **Vérification** : Le fichier `.reasoning_rl4/governance/Plan.RL4` existe et contient :
- YAML frontmatter avec `version`, `updated`, `confidence`
- Sections Markdown : `## Phase`, `## Goal`, `## Timeline`, `## Success Criteria`
- **Fichiers concernés** : `kernel/api/PlanTasksContextParser.ts` (lignes 145-171)

#### 2.2 Parsing Tasks.RL4

- **Action** : Vérifier que Tasks.RL4 est parsé correctement
- **Vérification** : Le fichier contient :
- YAML frontmatter avec `version`, `updated`, `bias`
- Section `## Active` avec checkboxes `- [ ]` ou `- [x]`
- Section `## Blockers` (optionnelle)
- Section `## Completed` (optionnelle)
- **Fichiers concernés** : `kernel/api/PlanTasksContextParser.ts` (lignes 176-203)

#### 2.3 Parsing Context.RL4

- **Action** : Vérifier que Context.RL4 est parsé correctement
- **Vérification** : Le fichier contient :
- YAML frontmatter avec `version`, `updated`, `confidence`, `kpis_llm`, `kpis_kernel`
- Sections Markdown : `## Active Files`, `## Recent Activity`, `## Health`, `## Observations`
- **Fichiers concernés** : `kernel/api/PlanTasksContextParser.ts` (lignes 208-251)

#### 2.4 Sauvegarde .RL4 avec WriteTracker

- **Action** : Modifier Plan.RL4 via l'API (si disponible) ou manuellement
- **Vérification** : La modification n'apparaît PAS dans les logs de FileChangeWatcher (écriture interne ignorée)
- **Fichiers concernés** : `kernel/api/PlanTasksContextParser.ts` (lignes 563-564, 615-616, 659-660), `kernel/WriteTracker.ts`

#### 2.5 Génération par défaut si fichiers absents

- **Action** : Supprimer temporairement Plan.RL4, Tasks.RL4, ou Context.RL4
- **Vérification** : Les fichiers sont régénérés avec des valeurs par défaut au prochain accès
- **Fichiers concernés** : `kernel/api/PlanTasksContextParser.ts` (lignes 495-511, 517-528, 533-553)

### 3. Tests du kernel

#### 3.1 Persistence de l'état (StateRegistry)

- **Action** : Redémarrer VS Code / l'extension
- **Vérification** : Le kernel reprend là où il s'est arrêté :
- Le fichier `.reasoning_rl4/state/kernel.json` existe et contient l'état valide
- `uptime` est recalculé depuis `startedAt`
- `lastCycle`, `lastSnapshot` sont préservés
- **Fichiers concernés** : `kernel/StateRegistry.ts` (lignes 462-476, 379-416)

#### 3.2 Détection des gaps d'activité

- **Action** : Ne rien faire pendant 15+ minutes
- **Vérification** : Message "⏸️ Gap detected: no activity for X minutes" apparaît toutes les 5 minutes (pas chaque minute)
- **Fichiers concernés** : `kernel/CognitiveScheduler.ts` (lignes 26, 100-113)

#### 3.3 Cycles cognitifs

- **Action** : Attendre plusieurs cycles (tick toutes les 10 secondes)
- **Vérification** : Les logs montrent "🧠 Cycle X started" et "🧠 Cycle X completed"
- **Fichiers concernés** : `kernel/CognitiveScheduler.ts` (lignes 73-95)

#### 3.4 FileChangeWatcher

- **Action** : Modifier, ajouter, supprimer des fichiers
- **Vérification** :
- Les changements sont détectés et loggés immédiatement
- Les patterns sont détectés (refactor, feature, fix, test, docs, config)
- Les événements sont sauvegardés dans `traces/kernel.jsonl`
- **Fichiers concernés** : `kernel/inputs/FileChangeWatcher.ts` (lignes 148-180, 243-342)

#### 3.5 GitCommitListener

- **Action** : Faire un commit Git
- **Vérification** :
- Le commit est détecté (via hook ou polling)
- Les informations sont capturées (hash, message, author, files, insertions, deletions)
- L'intent est parsé depuis le message
- L'événement est sauvegardé dans `traces/kernel.jsonl`
- **Fichiers concernés** : `kernel/inputs/GitCommitListener.ts` (lignes 100-132, 225-282)

#### 3.6 IDEActivityListener

- **Action** : Ouvrir/fermer des fichiers, modifier du code, générer des erreurs linter
- **Vérification** :
- Les snapshots IDE sont capturés périodiquement
- Les fichiers ouverts, le fichier focus, les erreurs linter sont enregistrés
- Les événements sont sauvegardés dans `traces/ide_activity.jsonl`
- **Fichiers concernés** : `kernel/inputs/IDEActivityListener.ts` (lignes 54-91, 96-153)

#### 3.7 BuildMetricsListener

- **Action** : Lancer une tâche de build/compilation dans VS Code
- **Vérification** :
- La tâche est détectée et trackée
- La durée, le succès, la taille du bundle sont enregistrés
- Les événements sont sauvegardés dans `traces/build_metrics.jsonl`
- **Fichiers concernés** : `kernel/inputs/BuildMetricsListener.ts` (lignes 55-92, 97-128)

### 4. Tests de persistence

#### 4.1 AppendOnlyWriter

- **Action** : Vérifier l'intégrité des fichiers JSONL
- **Vérification** :
- Tous les fichiers `.jsonl` dans `.reasoning_rl4/` sont valides (chaque ligne est un JSON valide)
- Les écritures sont append-only (pas d'écrasement)
- **Fichiers concernés** : `kernel/AppendOnlyWriter.ts` (lignes 58-66, 81-95)

#### 4.2 UpgradeGuard

- **Action** : Corrompre manuellement un fichier JSONL (ajouter une ligne invalide)
- **Vérification** : Au redémarrage, UpgradeGuard répare le fichier (supprime la ligne corrompue)
- **Fichiers concernés** : `kernel/bootstrap/UpgradeGuard.ts` (lignes 88-122, 291-293)

#### 4.3 Kernel history

- **Action** : Vérifier que l'historique du kernel est sauvegardé
- **Vérification** : Le fichier `.reasoning_rl4/state/kernel_history.jsonl` contient des snapshots d'état
- **Fichiers concernés** : `kernel/StateRegistry.ts` (lignes 544-557)

### 5. Tests d'intégration

#### 5.1 Initialisation complète

- **Action** : Activer l'extension dans un workspace vide
- **Vérification** :
- Tous les répertoires `.reasoning_rl4/` sont créés
- Les fichiers .RL4 par défaut sont générés
- Le kernel démarre sans erreur
- Les listeners sont actifs
- **Fichiers concernés** : `extension.ts` (lignes 40-175), `kernel/process/entrypoint.ts` (lignes 338-556)

#### 5.2 Communication Extension ↔ Kernel

- **Action** : Utiliser une commande VS Code qui interroge le kernel (ex: `rl4.getStatus`)
- **Vérification** : La requête IPC est envoyée, le kernel répond, la réponse est affichée
- **Fichiers concernés** : `kernel/KernelAPI.ts`, `kernel/KernelBridge.ts`, `kernel/process/entrypoint.ts` (lignes 64-333)

#### 5.3 Session persistence

- **Action** : Fermer VS Code, rouvrir le même workspace
- **Vérification** :
- Le kernel reprend avec l'état précédent (`kernel.json` chargé)
- Les cycles continuent depuis le dernier cycle
- L'uptime est recalculé correctement
- **Fichiers concernés** : `kernel/StateRegistry.ts` (lignes 462-476), `kernel/process/entrypoint.ts` (lignes 395-396)

#### 5.4 Réparation automatique

- **Action** : Simuler des données corrompues (ancienne version RL4)
- **Vérification** : UpgradeGuard détecte et répare automatiquement au démarrage
- **Fichiers concernés** : `kernel/bootstrap/UpgradeGuard.ts` (lignes 173-289), `extension.ts` (lignes 79-85)

### 6. Tests de résilience longue durée (NON NÉGOCIABLE pour MVP)

**Objectif** : Valider que RL4 reste stable et performant sur des périodes prolongées (24h+), simulant un usage réel.

#### 6.1 Kernel actif pendant 24h sans redémarrage

- **Action** : Laisser RL4 tourner pendant 24h avec activité sporadique (modifications de fichiers, commits occasionnels)
- **Note** : Ce test sera exécuté en parallèle du développement d'autres fonctionnalités (non bloquant)
- **Vérification** :
- Aucun crash du kernel
- Aucun leak mémoire visible (RSS stable, pas de croissance continue)
- Le scheduler reste précis (pas de drift temporel)
- Les listeners restent actifs (FileChangeWatcher, GitCommitListener, etc.)
- **Métriques à surveiller** :
- RSS mémoire (via `process.memoryUsage().rss`)
- Temps de réponse du kernel aux requêtes IPC
- Nombre de timers actifs (via `TimerRegistry.getActiveCount()`)
- **Fichiers concernés** : `kernel/HealthMonitor.ts`, `kernel/CognitiveScheduler.ts`, `kernel/StateRegistry.ts`

#### 6.2 JSONL > 10k lignes sans dégradation

- **Action** : Générer > 10k lignes dans `traces/kernel.jsonl` (modifier beaucoup de fichiers, faire des commits)
- **Vérification** :
- Les écritures restent rapides (pas de ralentissement)
- Le fichier reste lisible et valide (chaque ligne est un JSON valide)
- Aucun problème de fragmentation disque
- La taille du fichier est raisonnable (< 50MB pour 10k lignes)
- **Fichiers concernés** : `kernel/AppendOnlyWriter.ts` (lignes 58-66, 81-95)

#### 6.3 Output Channel reste lisible (rotation OK)

- **Action** : Générer > 10k lignes de logs dans l'output channel
- **Vérification** :
- L'auto-rotation fonctionne correctement (nettoyage à 2000 lignes)
- Pas de ralentissement de l'affichage
- La déduplication continue de fonctionner
- Aucun memory leak côté VS Code output channel
- **Fichiers concernés** : `kernel/core/CognitiveLogger.ts` (lignes 57, 238-247)

#### 6.4 Accumulation lente (dérive mémoire)

- **Action** : Laisser tourner 48h avec activité normale
- **Note** : Ce test sera exécuté en parallèle du développement d'autres fonctionnalités (non bloquant)
- **Vérification** :
- RSS mémoire reste stable (±10% de variation acceptable)
- Aucune accumulation de timers non nettoyés
- Aucune accumulation de listeners non disposés
- Queue size reste raisonnable (< 1000)
- **Métriques à surveiller** :
- `HealthMonitor.getMetrics()` toutes les heures
- Comparaison RSS au démarrage vs après 48h
- **Fichiers concernés** : `kernel/HealthMonitor.ts` (lignes 82-100), `kernel/inputs/IDEActivityListener.ts` (lignes 268-272), `kernel/inputs/BuildMetricsListener.ts` (lignes 240-252)

#### 6.5 Scheduler reste précis (pas de drift)

- **Action** : Laisser tourner 24h et vérifier la précision des ticks
- **Vérification** :
- Les ticks du scheduler arrivent toutes les 10 secondes (±1s de tolérance)
- Les résumés horaires sont générés à l'heure pile (±5min de tolérance)
- Les gaps sont détectés correctement (pas de faux positifs/négatifs)
- **Fichiers concernés** : `kernel/CognitiveScheduler.ts` (lignes 52-57, 73-95)

### 7. Tests workspace pathologique (POST-MVP, recommandé)

**Objectif** : Valider que RL4 gère correctement les repos complexes ou mal configurés.

#### 7.1 Repo géant (node_modules, dist, vendor)

- **Action** : Ouvrir un monorepo avec millions de fichiers (ex: node_modules volumineux)
- **Vérification** :
- CPU reste stable (< 10% en idle)
- Pas de spam dans les logs (ignore patterns respectés)
- FileChangeWatcher ne surveille pas les dossiers ignorés
- Temps de démarrage acceptable (< 30s)
- **Fichiers concernés** : `kernel/inputs/FileChangeWatcher.ts` (lignes 205-238)

#### 7.2 Repo avec symlinks

- **Action** : Ouvrir un repo avec des symlinks (ex: `ln -s ../external ./external`)
- **Vérification** :
- Les symlinks sont gérés correctement (pas de boucles infinies)
- Les changements dans les fichiers pointés sont détectés
- Pas d'erreurs EPERM ou ENOENT
- **Fichiers concernés** : `kernel/inputs/FileChangeWatcher.ts` (lignes 347-367)

#### 7.3 Repo avec fichiers illisibles

- **Action** : Créer des fichiers avec permissions restreintes (ex: `chmod 000 file.txt`)
- **Vérification** :
- Les erreurs sont gérées gracieusement (pas de crash)
- Les fichiers illisibles sont ignorés ou loggés en warning
- Le kernel continue de fonctionner normalement
- **Fichiers concernés** : `kernel/inputs/FileChangeWatcher.ts` (lignes 527-534)

### 8. Tests IPC dégradés (POST-MVP, recommandé)

**Objectif** : Valider la robustesse de la communication Extension ↔ Kernel en cas de dégradation.

#### 8.1 Kernel lent (timeout)

- **Action** : Forcer un sleep dans le kernel sur une requête `status` (ex: 35 secondes)
- **Vérification** :
- La requête timeout correctement (pas de deadlock)
- Un message d'erreur clair est affiché
- L'extension reste responsive (pas de freeze)
- Les requêtes suivantes fonctionnent normalement
- **Fichiers concernés** : `kernel/KernelAPI.ts`, `kernel/KernelBridge.ts`

#### 8.2 Kernel qui répond partiellement

- **Action** : Simuler une réponse IPC partielle (données incomplètes)
- **Vérification** :
- L'erreur est détectée et loggée
- Pas de crash côté extension
- Retry ou fallback si applicable
- **Fichiers concernés** : `kernel/KernelAPI.ts` (gestion des réponses malformées)

#### 8.3 Kernel qui redémarre pendant une requête

- **Action** : Tuer le processus kernel pendant qu'une requête est en cours
- **Vérification** :
- La requête échoue gracieusement (timeout ou erreur claire)
- Le kernel redémarre automatiquement (via KernelBridge)
- Les requêtes suivantes fonctionnent après redémarrage
- **Fichiers concernés** : `kernel/KernelBridge.ts` (crash protection, zombie killer)

## Checklist de validation

### Logs

- [ ] Un seul output channel "RL4 by RLabs"
- [ ] Déduplication fonctionne (messages répétés ignorés pendant 1 minute)
- [ ] Auto-rotation à 2000 lignes avec avertissement à 80%
- [ ] Logs structurés écrits dans `structured.jsonl`
- [ ] Logs de file changes enrichis (chemin, taille, extension)

### Fichiers .RL4

- [ ] Plan.RL4 parsé correctement (frontmatter + Markdown)
- [ ] Tasks.RL4 parsé correctement (checkboxes, timestamps)
- [ ] Context.RL4 parsé correctement (KPIs LLM/Kernel séparés)
- [ ] Écritures internes ignorées par FileChangeWatcher
- [ ] Génération par défaut si fichiers absents

### Kernel

- [ ] État persisté et restauré entre sessions
- [ ] Gaps détectés et loggés toutes les 5 minutes (pas chaque minute)
- [ ] Cycles cognitifs exécutés et loggés
- [ ] FileChangeWatcher détecte add/change/delete
- [ ] GitCommitListener capture les commits
- [ ] IDEActivityListener capture l'activité IDE
- [ ] BuildMetricsListener capture les métriques de build

### Persistence

- [ ] Fichiers JSONL valides (append-only, pas de corruption)
- [ ] UpgradeGuard répare les fichiers corrompus
- [ ] Kernel history sauvegardé dans `kernel_history.jsonl`

### Intégration

- [ ] Initialisation complète sans erreur
- [ ] Communication Extension ↔ Kernel fonctionnelle
- [ ] Session persistence entre redémarrages
- [ ] Réparation automatique des données corrompues

### Résilience longue durée (NON NÉGOCIABLE pour MVP)

- [ ] Kernel actif 24h sans redémarrage (pas de crash, pas de leak mémoire)
- [ ] JSONL > 10k lignes sans dégradation (écritures rapides, fichier valide)
- [ ] Output Channel reste lisible (rotation OK, pas de ralentissement)
- [ ] Accumulation lente maîtrisée (RSS stable après 48h, pas de dérive)
- [ ] Scheduler reste précis (pas de drift temporel sur 24h)

### Workspace pathologique (POST-MVP)

- [ ] Repo géant géré correctement (CPU stable, ignore patterns respectés)
- [ ] Repo avec symlinks géré correctement (pas de boucles infinies)
- [ ] Repo avec fichiers illisibles géré gracieusement (pas de crash)

### IPC dégradés (POST-MVP)

- [ ] Kernel lent géré correctement (timeout, pas de deadlock)
- [ ] Réponse partielle gérée gracieusement (erreur claire, pas de crash)
- [ ] Redémarrage pendant requête géré correctement (recovery automatique)

## Ordre d'exécution recommandé

### Phase 1 : Tests de base (MVP critique)

1. **Tests de base** : Initialisation, logs, fichiers .RL4
2. **Tests du kernel** : Persistence, cycles, listeners
3. **Tests de persistence** : JSONL, UpgradeGuard, history
4. **Tests d'intégration** : Communication, session persistence, réparation

### Phase 2 : Tests de résilience (NON NÉGOCIABLE pour MVP)

5. **Tests longue durée** : 24h/48h, JSONL > 10k lignes, accumulation mémoire, précision scheduler

- **Note** : Les tests 24h/48h seront exécutés en parallèle du développement (non bloquant pour les autres tests)

### Phase 3 : Tests avancés (POST-MVP, recommandé)

6. **Tests workspace pathologique** : Repo géant, symlinks, fichiers illisibles
7. **Tests IPC dégradés** : Kernel lent, réponse partielle, redémarrage pendant requête

## Critères de succès

### MVP (Phase 1 + Phase 2)

- ✅ Tous les composants s'initialisent sans erreur
- ✅ Les logs sont cohérents et non-dupliqués
- ✅ Les fichiers .RL4 sont parsés et sauvegardés correctement
- ✅ Le kernel persiste et restaure son état entre sessions
- ✅ Tous les listeners capturent les événements attendus
- ✅ Les fichiers JSONL restent valides et non-corrompus
- ✅ La communication Extension ↔ Kernel fonctionne
- ✅ La réparation automatique fonctionne en cas de corruption
- ✅ **Kernel stable sur 24h+ (pas de crash, pas de leak mémoire)**
- ✅ **JSONL > 10k lignes sans dégradation de performance**
- ✅ **Output Channel reste lisible et performant sur longue durée**
- ✅ **Aucune dérive mémoire après 48h d'activité**
- ✅ **Scheduler reste précis (pas de drift temporel)**

### POST-MVP (Phase 3)

- ✅ Gestion correcte des repos pathologiques (géants, symlinks, fichiers illisibles)
- ✅ Robustesse IPC en cas de dégradation (timeout, réponse partielle, redémarrage)