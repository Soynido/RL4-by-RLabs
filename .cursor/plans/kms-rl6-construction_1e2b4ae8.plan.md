---
name: KMS-RL6-construction
overview: Plan d'execution mecanique RL6 KMS sans cognition - construction fichier par fichier, integration sequencee, et suite de tests mecaniques obligatoires.
todos:
  - id: p0-scheduler-runcycle
    content: "[P0] Ajouter runCycle() sequentiel dans CognitiveScheduler.ts"
    status: pending
  - id: p0-entrypoint-wiring
    content: "[P0] Instancier composants manquants dans entrypoint.ts"
    status: pending
  - id: p0-cycles-jsonl
    content: "[P0] Creer cyclesWriter et ecrire cycles.jsonl"
    status: pending
  - id: p1-wal-integration
    content: "[P1] Appeler WAL.logSync avant ecritures critiques"
    status: pending
  - id: p1-rbom-integration
    content: "[P1] Appeler RBOMLedger.append sur events majeurs"
    status: pending
  - id: p1-writetracker
    content: "[P1] Appeler WriteTracker.markInternalWrite avant ecritures"
    status: pending
  - id: p1-stateregistry
    content: "[P1] Appeler StateRegistry.updateCycle/completeCycle"
    status: pending
  - id: p2-snapshot-rotation
    content: "[P2] Appeler SnapshotRotation.saveSnapshot par cycle"
    status: pending
  - id: p2-cache-index
    content: "[P2] Appeler CacheIndex.updateIncremental par cycle"
    status: pending
  - id: p2-activity-reconstruct
    content: "[P2] Appeler ActivityReconstructor.reconstruct"
    status: pending
  - id: p3-groundtruth
    content: "[P3] Activer GroundTruthSystem.verifyIntegrity periodique"
    status: pending
  - id: p3-timeline
    content: "[P3] Activer TimelineAggregator.generateTimeline periodique"
    status: pending
  - id: p3-validator
    content: "[P3] Activer CrossFileConsistencyValidator periodique"
    status: pending
  - id: tests-smoke
    content: "[TESTS] Smoke tests cycle-write, snapshot, index"
    status: pending
  - id: tests-soak
    content: "[TESTS] Soak 24h/48h stabilite"
    status: pending
---

# Plan de construction KMS RL6 EXHAUSTIF (P0/P1/P2/P3)

---

## PRIORITES

| Priorite | Description | Bloquant |

|----------|-------------|----------|

| **P0** | Critique - Sans cela le kernel ne produit pas de cycles | OUI |

| **P1** | Essentiel - Garantit durabilite et tracabilite | OUI pour soak |

| **P2** | Important - Indexation et reconstruction | NON |

| **P3** | Optionnel - Validation et timeline | NON |

---

## P0 - CRITIQUE (BLOQUANT)

### P0.1 - kernel/CognitiveScheduler.ts

**Etat actuel (lignes cles) :**

- L13-47 : Constructeur, options tick/gap/hourly
- L52-68 : `start()` / `stop()` 
- L73-95 : `tick()` — gap detection, hourly summary, system metrics, append scheduler_tick
- L169-171 : `notifyActivity()` — met a jour lastActivityTimestamp

**Diff attendu :**

```typescript
// AJOUTER apres L25
private cycleId: number = 0;
private cyclesWriter: AppendOnlyWriter | null = null;
private snapshotRotation: SnapshotRotation | null = null;
private cacheIndexer: RL4CacheIndexer | null = null;
private rbomLedger: RBOMLedger | null = null;
private wal: WriteAheadLog | null = null;
private stateRegistry: StateRegistry | null = null;
private activityReconstructor: ActivityReconstructor | null = null;
private writeTracker: WriteTracker | null = null;
private healthMonitor: HealthMonitor | null = null;

// AJOUTER dans SchedulerOptions (L7-11)
cyclesWriter?: AppendOnlyWriter;
snapshotRotation?: SnapshotRotation;
cacheIndexer?: RL4CacheIndexer;
rbomLedger?: RBOMLedger;
wal?: WriteAheadLog;
stateRegistry?: StateRegistry;
activityReconstructor?: ActivityReconstructor;
writeTracker?: WriteTracker;
healthMonitor?: HealthMonitor;
rotationIntervalCycles?: number; // Default: 100

// AJOUTER dans constructeur (L28-46)
this.cyclesWriter = options.cyclesWriter || null;
this.snapshotRotation = options.snapshotRotation || null;
this.cacheIndexer = options.cacheIndexer || null;
this.rbomLedger = options.rbomLedger || null;
this.wal = options.wal || null;
this.stateRegistry = options.stateRegistry || null;
this.activityReconstructor = options.activityReconstructor || null;
this.writeTracker = WriteTracker.getInstance();
this.healthMonitor = options.healthMonitor || null;

// MODIFIER tick() (L73) pour appeler runCycle()
private async tick() {
    const now = Date.now();
    const delta = now - this.lastActivityTimestamp;

    // 1) GAP DETECTION (conserver)
    if (delta > this.options.gapThresholdMs!) {
        this.handleGap(delta);
    }

    // 2) RUN CYCLE (NOUVEAU)
    await this.runCycle();

    // 3) HOURLY SUMMARY (conserver)
    if (now - this.lastHourlySummaryTime >= this.options.hourlySummaryIntervalMs!) {
        this.handleHourlySummary();
        this.lastHourlySummaryTime = now;
    }
}

// AJOUTER nouvelle methode runCycle() apres tick()
/**
 * MAIN CYCLE — phases sequentielles KMS
 * ingest → persist → snapshot → index → health/status
 */
private async runCycle(): Promise<void> {
    this.cycleId++;
    const cycleStart = Date.now();
    const timestamp = new Date().toISOString();

    this.logger.system(`[Cycle ${this.cycleId}] Starting...`);

    try {
        // --- PHASE 1: INGEST ---
        // Buffer events already collected via notifyActivity()
        // No action needed here, watchers push events

        // --- PHASE 2: PERSIST CYCLE ---
        await this.phasePersistCycle(timestamp, cycleStart);

        // --- PHASE 3: SNAPSHOT ---
        await this.phaseSnapshot();

        // --- PHASE 4: INDEX ---
        await this.phaseIndex(timestamp);

        // --- PHASE 5: HEALTH/STATUS ---
        await this.phaseHealthStatus();

        const duration = Date.now() - cycleStart;
        this.logger.system(`[Cycle ${this.cycleId}] Complete in ${duration}ms`);

    } catch (error) {
        this.logger.system(`[Cycle ${this.cycleId}] ERROR: ${error}`);
        // Ne pas throw — le scheduler doit continuer
    }
}

/**
 * PHASE 2: Persist cycle summary to cycles.jsonl
 */
private async phasePersistCycle(timestamp: string, cycleStart: number): Promise<void> {
    if (!this.cyclesWriter) return;

    const cycleData = {
        cycleId: this.cycleId,
        timestamp,
        startedAt: cycleStart,
        duration: Date.now() - cycleStart,
        phases: {
            ingest: { events: 0 }, // TODO: count from buffers
            persist: { success: true }
        },
        metadata: {
            heapUsed: process.memoryUsage().heapUsed
        }
    };

    // WAL avant ecriture
    if (this.wal) {
        this.wal.logSync('cycles.jsonl', JSON.stringify(cycleData));
    }

    // WriteTracker avant ecriture
    if (this.writeTracker) {
        this.writeTracker.markInternalWrite(this.cyclesWriter['path'] || '');
    }

    // Append cycles.jsonl
    await this.cyclesWriter.append(cycleData);

    // RBOM ledger
    if (this.rbomLedger) {
        await this.rbomLedger.append('cycle', { cycleId: this.cycleId });
    }

    // StateRegistry
    if (this.stateRegistry) {
        await this.stateRegistry.updateCycle({ cycleId: this.cycleId, startTime: timestamp });
    }
}

/**
 * PHASE 3: Save lightweight snapshot
 */
private async phaseSnapshot(): Promise<void> {
    if (!this.snapshotRotation) return;

    await this.snapshotRotation.saveSnapshot(this.cycleId, {
        patterns: [],
        correlations: [],
        forecasts: [],
        cognitive_load: 0,
        git_context: {},
        files_active: []
    });

    // WriteTracker
    if (this.writeTracker) {
        this.writeTracker.markInternalWrite(`snapshot-${this.cycleId}.json`);
    }

    // Rotation tous les N cycles
    const rotationInterval = this.options.rotationIntervalCycles || 100;
    if (this.cycleId % rotationInterval === 0) {
        await this.snapshotRotation.rotateIfNeeded();
    }
}

/**
 * PHASE 4: Update cache index
 */
private async phaseIndex(timestamp: string): Promise<void> {
    if (!this.cacheIndexer) return;

    await this.cacheIndexer.updateIncremental({
        cycleId: this.cycleId,
        timestamp,
        phases: {}
    }, []);
}

/**
 * PHASE 5: Health and status
 */
private async phaseHealthStatus(): Promise<void> {
    // Complete cycle in StateRegistry
    if (this.stateRegistry) {
        await this.stateRegistry.completeCycle(true, []);
    }

    // Health metrics already collected by HealthMonitor
}
```

**Signatures fonctionnelles :**

- `runCycle(): Promise<void>` — orchestration sequentielle
- `phasePersistCycle(timestamp: string, cycleStart: number): Promise<void>`
- `phaseSnapshot(): Promise<void>`
- `phaseIndex(timestamp: string): Promise<void>`
- `phaseHealthStatus(): Promise<void>`

**Points d'insertion :**

- Proprietes : apres L25
- Options interface : L7-11
- Constructeur wiring : L28-46
- tick() modification : L73
- Nouvelles methodes : apres L95

**Logs a ajouter :**

- `[Cycle N] Starting...`
- `[Cycle N] Complete in Xms`
- `[Cycle N] ERROR: ...`

**Tests a ecrire :**

- `scheduler.runCycle()` ecrit dans cycles.jsonl
- `scheduler.tick()` appelle `runCycle()`
- Rotation declenchee tous les N cycles

**Risques :**

- Boucle infinie si erreur non catchee → try/catch global
- Double append si retry → cycleId unique
- Gap log casse → conserver logique existante

---

### P0.2 - kernel/process/entrypoint.ts

**Etat actuel (lignes cles) :**

- L12-36 : Imports existants
- L366-376 : Creation directories (tracesDir, logsDir)
- L387-393 : AppendOnlyWriter kernel.jsonl
- L399-401 : StateRegistry
- L415-419 : FileChangeWatcher
- L421-430 : GitCommitListener
- L432-444 : CognitiveScheduler (legacy)
- L447-449 : Wiring notifiers
- L451-454 : HealthMonitor
- L507-531 : kernelComponents storage

**Diff attendu :**

```typescript
// AJOUTER imports apres L36
import { SnapshotRotation } from '../indexer/SnapshotRotation';
import { RL4CacheIndexer } from '../indexer/CacheIndex';
import { RBOMLedger } from '../rbom/RBOMLedger';
import { WriteAheadLog } from '../persistence/WriteAheadLog';
import { GroundTruthSystem } from '../ground_truth/GroundTruthSystem';
import { CrossFileConsistencyValidator } from '../validation/CrossFileConsistencyValidator';
import { ActivityReconstructor } from '../api/ActivityReconstructor';
import { WriteTracker } from '../WriteTracker';
import { TimelineAggregator } from '../indexer/TimelineAggregator';

// AJOUTER apres L376 (creation directories)
const ledgerDir = path.join(rl4Dir, 'ledger');
const snapshotsDir = path.join(rl4Dir, 'snapshots');
const cacheDir = path.join(rl4Dir, 'cache');
const groundTruthDir = path.join(rl4Dir, 'ground_truth');
fs.mkdirSync(ledgerDir, { recursive: true });
fs.mkdirSync(snapshotsDir, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

// AJOUTER apres L393 (apres kernel.jsonl writer)
console.log(`[DIAG] [${Date.now()}] Init start: cyclesWriter`);
const cyclesWriter = new AppendOnlyWriter(
    path.join(ledgerDir, 'cycles.jsonl'),
    { fsync: false, mkdirRecursive: true }
);
await cyclesWriter.init();
console.log(`[DIAG] [${Date.now()}] Init done: cyclesWriter`);

// AJOUTER apres cyclesWriter
console.log(`[DIAG] [${Date.now()}] Init start: RBOMLedger`);
const rbomLedger = new RBOMLedger(workspaceRoot);
await rbomLedger.init();
console.log(`[DIAG] [${Date.now()}] Init done: RBOMLedger`);

console.log(`[DIAG] [${Date.now()}] Init start: WriteAheadLog`);
const wal = WriteAheadLog.getInstance(workspaceRoot);
console.log(`[DIAG] [${Date.now()}] Init done: WriteAheadLog`);

console.log(`[DIAG] [${Date.now()}] Init start: SnapshotRotation`);
const snapshotRotation = new SnapshotRotation(workspaceRoot);
console.log(`[DIAG] [${Date.now()}] Init done: SnapshotRotation`);

console.log(`[DIAG] [${Date.now()}] Init start: RL4CacheIndexer`);
const cacheIndexer = new RL4CacheIndexer(workspaceRoot);
console.log(`[DIAG] [${Date.now()}] Init done: RL4CacheIndexer`);

console.log(`[DIAG] [${Date.now()}] Init start: ActivityReconstructor`);
const activityReconstructor = new ActivityReconstructor(workspaceRoot);
console.log(`[DIAG] [${Date.now()}] Init done: ActivityReconstructor`);

console.log(`[DIAG] [${Date.now()}] Init start: GroundTruthSystem`);
const groundTruthSystem = new GroundTruthSystem(rl4Dir);
console.log(`[DIAG] [${Date.now()}] Init done: GroundTruthSystem`);

console.log(`[DIAG] [${Date.now()}] Init start: CrossFileConsistencyValidator`);
const consistencyValidator = new CrossFileConsistencyValidator(workspaceRoot);
console.log(`[DIAG] [${Date.now()}] Init done: CrossFileConsistencyValidator`);

console.log(`[DIAG] [${Date.now()}] Init start: TimelineAggregator`);
const timelineAggregator = new TimelineAggregator(workspaceRoot);
console.log(`[DIAG] [${Date.now()}] Init done: TimelineAggregator`);

// MODIFIER CognitiveScheduler (L432-444)
console.log(`[DIAG] [${Date.now()}] Init start: CognitiveScheduler (KMS)`);
const scheduler = new CognitiveScheduler(
    logger,
    clock,
    fsWatcher,
    gitListener,
    appendWriter,
    {
        tickIntervalSec: 10,
        hourlySummaryIntervalMs: 3600000,
        gapThresholdMs: 15 * 60 * 1000,
        // NOUVEAUX PARAMS KMS
        cyclesWriter,
        snapshotRotation,
        cacheIndexer,
        rbomLedger,
        wal,
        stateRegistry,
        activityReconstructor,
        healthMonitor,
        rotationIntervalCycles: 100
    }
);
console.log(`[DIAG] [${Date.now()}] Init done: CognitiveScheduler (KMS)`);

// AJOUTER apres L449 (apres wiring notifiers)
// RBOM kernel_start event
await rbomLedger.append('kernel_start', { workspaceRoot, timestamp: new Date().toISOString() });

// AJOUTER dans kernelComponents (L507-531)
rbomLedger,
wal,
snapshotRotation,
cacheIndexer,
activityReconstructor,
groundTruthSystem,
consistencyValidator,
timelineAggregator,
cyclesWriter,
```

**Signatures fonctionnelles (modules a instancier) :**

- `new AppendOnlyWriter(path, options)` — cycles.jsonl
- `new RBOMLedger(workspaceRoot)` + `init()`
- `WriteAheadLog.getInstance(workspaceRoot)`
- `new SnapshotRotation(workspaceRoot)`
- `new RL4CacheIndexer(workspaceRoot)`
- `new ActivityReconstructor(workspaceRoot)`
- `new GroundTruthSystem(rl4Dir)`
- `new CrossFileConsistencyValidator(workspaceRoot)`
- `new TimelineAggregator(workspaceRoot)`

**Points d'insertion :**

- Imports : L36+
- Directories : L376+
- cyclesWriter : L393+
- Autres composants : apres cyclesWriter
- Scheduler modifie : L432-444
- kernelComponents : L507-531

**Logs a ajouter :**

- `[DIAG] Init start/done` pour chaque composant

**Tests a ecrire :**

- Tous composants instancies sans erreur
- rbom.jsonl contient kernel_start
- cycles.jsonl existe apres premier cycle

**Risques :**

- Import cycles si module inexistant → verifier chemins
- Init order → respecter dependencies

---

### P0.3 - cycles.jsonl creation

**Fichier :** `.reasoning_rl4/ledger/cycles.jsonl`

**Format par ligne :**

```json
{"cycleId":1,"timestamp":"2025-12-19T10:00:00.000Z","startedAt":1734602400000,"duration":45,"phases":{"ingest":{"events":0},"persist":{"success":true}},"metadata":{"heapUsed":52428800}}
```

**Chemin exact :** `path.join(workspaceRoot, '.reasoning_rl4', 'ledger', 'cycles.jsonl')`

---

## P1 - ESSENTIEL (BLOQUANT POUR SOAK)

### P1.1 - kernel/persistence/WriteAheadLog.ts

**Etat actuel :**

- L13-56 : Singleton, `logSync(file, content)` ecrit dans wal.jsonl avec fsync

**Diff attendu :** AUCUN — module pret

**Integration (dans CognitiveScheduler.phasePersistCycle) :**

```typescript
if (this.wal) {
    this.wal.logSync('cycles.jsonl', JSON.stringify(cycleData));
}
```

**Signature :**

- `logSync(file: string, content: string): number` — retourne seq

---

### P1.2 - kernel/rbom/RBOMLedger.ts

**Etat actuel :**

- L31-123 : Classe complete, `init()`, `append(type, payload)`, `flush()`, `close()`

**Diff attendu :** AUCUN — module pret

**Integration :**

```typescript
// Dans entrypoint.ts apres init
await rbomLedger.append('kernel_start', { workspaceRoot });

// Dans scheduler.phasePersistCycle
await this.rbomLedger.append('cycle', { cycleId: this.cycleId });

// Dans scheduler.phaseSnapshot (optionnel)
await this.rbomLedger.append('snapshot', { cycleId: this.cycleId });
```

**Signature :**

- `init(): Promise<void>`
- `append(type: string, payload: any): Promise<RBOMEntry>`
- `flush(): Promise<void>`

---

### P1.3 - kernel/WriteTracker.ts

**Etat actuel :**

- L10-87 : Singleton, `markInternalWrite(filePath)`, `shouldIgnoreChange(filePath)`

**Diff attendu :** AUCUN — module pret

**Integration :**

```typescript
// Avant chaque ecriture dans .reasoning_rl4/
WriteTracker.getInstance().markInternalWrite(filePath);
```

**Fichiers a marquer :**

- `cycles.jsonl`
- `snapshot-{cycleId}.json`
- `rbom.jsonl`
- `wal.jsonl`
- `kernel.json` (state)

**Signature :**

- `markInternalWrite(filePath: string): void`
- `shouldIgnoreChange(filePath: string): boolean`

---

### P1.4 - kernel/StateRegistry.ts

**Etat actuel :**

- L275-290 : `updateCycle(cycleInfo: Partial<CycleInfo>)`
- L297-314 : `completeCycle(success, errors)`
- L379-416 : `snapshot(force)`

**Diff attendu :** AUCUN — module pret

**Integration :**

```typescript
// Debut de runCycle
await this.stateRegistry.updateCycle({
    cycleId: this.cycleId,
    startTime: timestamp,
    phase: 'implementation',
    eventsCount: 0,
    success: true,
    errors: []
});

// Fin de runCycle
await this.stateRegistry.completeCycle(true, []);

// Periodique (optionnel)
await this.stateRegistry.snapshot(false);
```

**Signature :**

- `updateCycle(cycleInfo: Partial<CycleInfo>): Promise<void>`
- `completeCycle(success?: boolean, errors?: string[]): Promise<void>`
- `snapshot(force?: boolean): Promise<void>`

---

## P2 - IMPORTANT (NON BLOQUANT)

### P2.1 - kernel/indexer/SnapshotRotation.ts

**Etat actuel :**

- L761-775 : `saveSnapshot(cycleId, snapshot?)`
- L134-193 : `rotateIfNeeded()`

**Diff attendu :** AUCUN — module pret

**Integration :**

```typescript
// Dans phaseSnapshot
await this.snapshotRotation.saveSnapshot(this.cycleId, {
    patterns: [],
    correlations: [],
    forecasts: [],
    cognitive_load: 0,
    git_context: {},
    files_active: []
});

// Tous les N cycles
if (this.cycleId % 100 === 0) {
    await this.snapshotRotation.rotateIfNeeded();
}
```

**Signature :**

- `saveSnapshot(cycleId: number, snapshot?: Partial<CognitiveSnapshot>): Promise<void>`
- `rotateIfNeeded(): Promise<RotationResult>`

---

### P2.2 - kernel/indexer/CacheIndex.ts

**Etat actuel :**

- L178-227 : `updateIncremental(cycleData, files)`

**Diff attendu :** AUCUN — module pret

**Integration :**

```typescript
// Dans phaseIndex
await this.cacheIndexer.updateIncremental({
    cycleId: this.cycleId,
    timestamp: timestamp,
    phases: {}
}, []); // files array optionnel
```

**Signature :**

- `updateIncremental(cycleData: any, files?: string[]): Promise<void>`

---

### P2.3 - kernel/api/ActivityReconstructor.ts

**Etat actuel :**

- L201-260 : `reconstruct(eventStream?)`

**Diff attendu :** AUCUN — module pret

**Integration (optionnel, fin de cycle) :**

```typescript
// Fin de runCycle (optionnel)
if (this.activityReconstructor && this.cycleId % 10 === 0) {
    const result = await this.activityReconstructor.reconstruct();
    // Ajouter result.summary au cycleData si necessaire
}
```

**Signature :**

- `reconstruct(eventStream?: ActivityEvent[]): Promise<ReconstructionResult>`

**Risque :** CPU bound si buffer > 1000 events → limiter

---

## P3 - OPTIONNEL

### P3.1 - kernel/ground_truth/GroundTruthSystem.ts

**Etat actuel :**

- L47-123 : `establish(plan, tasks, context, metadata)`
- L128-133 : `isEstablished()`
- L263-293 : `verifyIntegrity()`

**Integration (periodique, faible frequence) :**

```typescript
// Tous les 100 cycles ou 1h
if (this.groundTruthSystem && this.groundTruthSystem.isEstablished()) {
    const result = this.groundTruthSystem.verifyIntegrity();
    if (!result.valid) {
        this.logger.system(`[GroundTruth] Integrity check failed: ${result.error}`);
    }
}
```

**Signature :**

- `isEstablished(): boolean`
- `verifyIntegrity(): { valid: boolean; error?: string }`

---

### P3.2 - kernel/indexer/TimelineAggregator.ts

**Integration (periodique) :**

```typescript
// Tous les 100 cycles
if (this.cycleId % 100 === 0) {
    await this.timelineAggregator.generateTimeline(new Date());
}
```

---

### P3.3 - kernel/validation/CrossFileConsistencyValidator.ts

**Integration (periodique, faible frequence) :**

```typescript
// Tous les 1000 cycles ou 1h
if (this.cycleId % 1000 === 0) {
    const issues = await this.consistencyValidator.validate();
    if (issues.length > 0) {
        this.logger.system(`[Consistency] Found ${issues.length} issues`);
    }
}
```

---

## PLAN D'INTEGRATION CROSS-MODULE

### Ordre exact des commits

| Commit | Fichier(s) | Description | Gate |

|--------|-----------|-------------|------|

| 1 | kernel/CognitiveScheduler.ts | Ajouter proprietes + runCycle() stub | Compile |

| 2 | kernel/process/entrypoint.ts | Imports + directories + cyclesWriter | Compile |

| 3 | kernel/process/entrypoint.ts | Instancier RBOMLedger, WAL, SnapshotRotation, CacheIndexer | Compile |

| 4 | kernel/process/entrypoint.ts | Wiring scheduler avec nouveaux params | Compile |

| 5 | kernel/CognitiveScheduler.ts | Implementer phasePersistCycle | cycles.jsonl ecrit |

| 6 | kernel/CognitiveScheduler.ts | Implementer phaseSnapshot | snapshot cree |

| 7 | kernel/CognitiveScheduler.ts | Implementer phaseIndex | index.json mis a jour |

| 8 | kernel/CognitiveScheduler.ts | Implementer phaseHealthStatus | StateRegistry updated |

| 9 | kernel/process/entrypoint.ts | Ajouter ActivityReconstructor, GroundTruth, etc. | Compile |

| 10 | Tests smoke | Verifier cycles.jsonl, rbom.jsonl, snapshot | GATE SMOKE |

| 11 | Tests soak 24h | Stabilite, pas de crash, growth controllee | GATE SOAK 24H |

| 12 | Tests soak 48h | Idem | GATE SOAK 48H |

### Tests gating par etape

| Etape | Test | Critere succes |

|-------|------|----------------|

| 5 | cycle-write | `cycles.jsonl` contient >= 1 ligne JSON valide |

| 6 | snapshot | `snapshots/snapshot-1.json` existe |

| 7 | index | `cache/index.json` contient cycleId |

| 8 | state | `state/kernel.json` mis a jour |

| 10 | smoke | rbom.jsonl contient kernel_start + cycle |

| 11 | soak-24h | 0 crash, heap < 500MB, files < 50MB |

| 12 | soak-48h | Idem + status < 1s |

---

## SUITE DE TESTS MECANIQUES OBLIGATOIRES

### T1 - cycle-writes

```bash
# Demarrer kernel, attendre 30s (3 cycles)
# Verifier:
cat .reasoning_rl4/ledger/cycles.jsonl | wc -l  # >= 3
cat .reasoning_rl4/ledger/cycles.jsonl | jq -c '.cycleId' | head -3  # 1,2,3
cat .reasoning_rl4/ledger/rbom.jsonl | grep kernel_start  # present
cat .reasoning_rl4/wal.jsonl | wc -l  # >= 3
```

**Critere :** cycles.jsonl, rbom.jsonl, wal.jsonl non vides, JSON valide

### T2 - snapshot rotation

```bash
# Forcer 100 cycles (ou attendre ~17min)
# Verifier:
ls .reasoning_rl4/snapshots/snapshot-*.json | wc -l  # 100
ls .reasoning_rl4/snapshots/archive/ | wc -l  # Rotation effectuee si > 100
```

**Critere :** Snapshots crees, rotation declenchee

### T3 - WAL atomicite

```bash
# Simuler crash apres logSync:
# 1. Ajouter throw apres wal.logSync dans phasePersistCycle
# 2. Verifier wal.jsonl contient entree
# 3. Redemarrer kernel
# 4. Verifier pas de doublon (cycleId unique)
```

**Critere :** WAL contient entree meme si append echoue

### T4 - growth-check

```bash
# Apres 24h:
du -sh .reasoning_rl4/ledger/cycles.jsonl  # < 10MB
du -sh .reasoning_rl4/ledger/rbom.jsonl    # < 5MB
du -sh .reasoning_rl4/snapshots/           # < 50MB (avec rotation)
du -sh .reasoning_rl4/cache/index.json     # < 5MB
```

**Critere :** Tailles sous quotas

### T5 - soak 24h

```bash
# Demarrer kernel, laisser tourner 24h
# Verifier toutes les 4h:
# - status < 1s (curl ou IPC)
# - heap < 500MB
# - 0 restart dans logs
# - cycles.jsonl croit lineairement
```

**Critere :** Stabilite 24h sans intervention

### T6 - soak 48h

**Idem T5 mais 48h — GATE BLOQUANTE AVANT COGNITION**

### T7 - status latency

```bash
# Envoyer query status via IPC
# Mesurer temps reponse
time curl -s localhost:PORT/status  # ou equivalent IPC
# Critere: < 1000ms
```

### T8 - race watchers

```bash
# Script de stress:
for i in {1..50}; do
    echo "test" >> test_file_$i.ts &
done
wait
git commit -am "stress test" &
# Verifier:
# - Pas de boucle infinie dans logs
# - notifyActivity recus (check scheduler logs)
# - WriteTracker ignore .reasoning_rl4 writes
```

**Critere :** Pas de crash, pas de boucle, events captures

---

## POINTS D'ECHEC POTENTIELS (A TRACER)

| Point | Symptome | Mitigation |

|-------|----------|------------|

| Deadlock ready IPC | Extension ne voit pas READY | Timeout + fallback stdout (deja en place L564) |

| Rotation non declenchee | Snapshots accumulent | Log rotation trigger + verifier rotationIntervalCycles |

| Append doublon | cycleId duplique dans cycles.jsonl | cycleId incremental + guard |

| IDEActivityListener child | Crash API vscode | NE PAS instancier dans entrypoint (main process only) |

| ActivityReconstructor CPU | Lag scheduler | Limiter buffer 1000 events |

| WAL IO lente | Latence cycle | Surveiller duration phase persist |

| WriteTracker oubli | Boucle watcher | Marquer TOUS les fichiers .reasoning_rl4 |

---

## LOGS A AJOUTER (MINIMUM)

```typescript
// Scheduler
this.logger.system(`[Cycle ${this.cycleId}] Starting...`);
this.logger.system(`[Cycle ${this.cycleId}] Phase persist: ${duration}ms`);
this.logger.system(`[Cycle ${this.cycleId}] Phase snapshot: saved`);
this.logger.system(`[Cycle ${this.cycleId}] Phase index: updated`);
this.logger.system(`[Cycle ${this.cycleId}] Complete in ${totalDuration}ms`);

// Entrypoint
console.log(`[DIAG] [${Date.now()}] Init start: ${componentName}`);
console.log(`[DIAG] [${Date.now()}] Init done: ${componentName}`);

// RBOM
console.log(`[RBOMLedger] Appended: ${type}`);

// SnapshotRotation
console.log(`[SnapshotRotation] Saved snapshot-${cycleId}.json`);
console.log(`[SnapshotRotation] Rotation triggered: ${result.deleted.length} deleted`);
```

---

## PACKAGING FINAL

```bash
# 1. Compile
npm run compile

# 2. Verifier pas d'erreurs TS
npx tsc --noEmit

# 3. Package
npx vsce package

# 4. Install
code --install-extension rl4-by-rlabs-*.vsix --force

# 5. Reload window
# Cmd+Shift+P > Developer: Reload Window

# 6. Smoke test
# - Output channel affiche logs
# - cycles.jsonl cree apres 10s
# - rbom.jsonl contient kernel_start

# 7. Soak 24h → 48h
```