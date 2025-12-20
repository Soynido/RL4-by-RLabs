---
name: MIL MVP Implementation
overview: Implémentation minimale de MIL (Memory Index Layer) + CursorChatListener pour enrichir UnifiedPromptBuilder et TimeMachinePromptBuilder. Scope strictement limité aux besoins directs de ces deux composants, avec 3 garde-fous critiques intégrés.
todos:
  - id: mil-types
    content: Créer kernel/memory/types.ts avec UnifiedEvent, EventSource, EventType, EventCategory (sans DECISION)
    status: completed
  - id: mil-normalizer
    content: "Créer kernel/memory/EventNormalizer.ts avec normalize(), mapType() (CORRIGER: rawEvent), extractIndexedFields() (limites strictes keywords)"
    status: completed
    dependencies:
      - mil-types
  - id: mil-temporal-index
    content: Créer kernel/memory/TemporalIndex.ts avec Array trié (pas Map), binary search, flush périodique 5s
    status: completed
    dependencies:
      - mil-types
  - id: mil-spatial-index
    content: Créer kernel/memory/SpatialIndex.ts avec Map filePath→event_ids, flush périodique 5s
    status: completed
    dependencies:
      - mil-types
  - id: mil-type-index
    content: Créer kernel/memory/TypeIndex.ts avec Map type→event_ids, flush périodique 5s
    status: completed
    dependencies:
      - mil-types
  - id: mil-main
    content: Créer kernel/memory/MIL.ts avec ingest(), buildContextForLLM(), queryTemporal(), persistance seq_state.json
    status: completed
    dependencies:
      - mil-normalizer
      - mil-temporal-index
      - mil-spatial-index
      - mil-type-index
  - id: integrate-file-watcher
    content: "Modifier FileChangeWatcher.ts : ajouter mil?: MIL dans constructeur, appeler mil.ingest() dans saveToTraces()"
    status: completed
    dependencies:
      - mil-main
  - id: integrate-git-listener
    content: "Modifier GitCommitListener.ts : ajouter mil?: MIL dans constructeur, appeler mil.ingest() dans saveToTraces()"
    status: completed
    dependencies:
      - mil-main
  - id: integrate-ide-listener
    content: "Modifier IDEActivityListener.ts : ajouter mil?: MIL dans constructeur, appeler mil.ingest() dans captureSnapshot()"
    status: completed
    dependencies:
      - mil-main
  - id: integrate-entrypoint-mil
    content: "Modifier entrypoint.ts : initialiser MIL, passer aux listeners existants"
    status: completed
    dependencies:
      - integrate-file-watcher
      - integrate-git-listener
      - integrate-ide-listener
  - id: integrate-unified-prompt
    content: "Modifier UnifiedPromptBuilder.ts : ajouter mil?: MIL, enrichir buildSnapshotData() avec MIL.buildContextForLLM()"
    status: completed
    dependencies:
      - integrate-entrypoint-mil
  - id: integrate-time-machine
    content: "Modifier TimeMachinePromptBuilder.ts : ajouter mil?: MIL, enrichir build() avec MIL.queryTemporal()"
    status: completed
    dependencies:
      - integrate-entrypoint-mil
  - id: cursor-chat-listener
    content: "Créer CursorChatListener.ts avec findCursorStateDb(), extractChatHistory(), parseChatData() (CORRIGER: trier par timestamp réel), opt-in feature flag"
    status: completed
    dependencies:
      - mil-main
  - id: cursor-chat-package
    content: Ajouter better-sqlite3 dans package.json dependencies
    status: completed
  - id: cursor-chat-entrypoint
    content: "Modifier entrypoint.ts : initialiser CursorChatListener conditionnellement (opt-in), fallback silencieux"
    status: completed
    dependencies:
      - cursor-chat-listener
      - cursor-chat-package
---

# Plan d'Implémentation MIL MVP

## RÈGLES ABSOLUES (À RESPECTER IMPÉRATIVEMENT)

### Règle 1 : Scope MVP Strict

**Toute implémentation doit être justifiée par :**

1. Un invariant existant (I01-I20 de northstar.md Section 4)
2. Un besoin direct de `UnifiedPromptBuilder` ou `TimeMachinePromptBuilder`

**Toute autre implémentation est hors-scope MVP, même si décrite dans northstar.md Section 10.**

### Règle 2 : EpisodeStore Append-Only

**EpisodeStore est append-only, jamais mutatif.**

- Toute "mise à jour" = nouvel épisode lié (via `related_episode_ids`), jamais overwrite
- Pas de `update()`, `modify()`, `patch()` sur épisodes existants
- Pattern : `EpisodeStore.append(newEpisode)` uniquement

### Règle 3 : CursorChatListener Opt-In

**CursorChatListener est stratégiquement sensible.**

- Opt-in explicite requis (feature flag dans Context.RL4 ou config)
- Fallback silencieux si SQLite inaccessible
- Pas de hard dependency : MIL fonctionne sans CursorChatListener
- Logging explicite mais non intrusif

---

## Phase 1 : MIL Core - Infrastructure Minimale

**Objectif** : Créer l'infrastructure de base pour normaliser et indexer les événements.

**Fichiers à créer** (ordre strict) :

1. **`kernel/memory/types.ts`**

   - `UnifiedEvent` (schéma normalisé)
   - `EventSource` enum (FILE_SYSTEM, GIT, IDE, CURSOR_CHAT)
   - `EventType` enum (FILE_CREATE, FILE_MODIFY, GIT_COMMIT, etc.)
   - `EventCategory` enum (CODE_CHANGE, COMMUNICATION, SYSTEM, METADATA) — **SUPPRIMER DECISION**
   - Types minimaux pour MVP

2. **`kernel/memory/EventNormalizer.ts`**

   - `normalize(rawEvent, source): UnifiedEvent`
   - `mapType(rawEvent, source): EventType` — **CORRIGER** : passer `rawEvent`, pas `rawType`
   - `mapCategory(rawEvent, source): EventCategory`
   - `extractIndexedFields(rawEvent, source)` — **LIMITES STRICTES** : keywords 4-20 chars, max 5, stop words
   - ZERO-INTELLIGENCE : structure uniquement, pas d'inférence

3. **`kernel/memory/TemporalIndex.ts`**

   - `Array<[number, string]>` — **CORRIGER** : Array trié, pas Map
   - `insert(event: UnifiedEvent): void`
   - `rangeQuery(start: number, end: number, filters?): string[]` — binary search
   - `ensureSorted(): void` — tri explicite
   - Flush périodique (5s) + flush manuel
   - Persistance dans `memory/indices/temporal.json`

4. **`kernel/memory/SpatialIndex.ts`**

   - `Map<string, Set<string>>` (filePath → event_ids)
   - `insert(event: UnifiedEvent): void`
   - `getByFile(filePath: string): string[]`
   - Flush périodique (5s) + flush manuel
   - Persistance dans `memory/indices/spatial.json`

5. **`kernel/memory/TypeIndex.ts`**

   - `Map<EventType, Set<string>>` (type → event_ids)
   - `insert(event: UnifiedEvent): void`
   - `getByType(type: EventType): string[]`
   - Flush périodique (5s) + flush manuel
   - Persistance dans `memory/indices/type_index.json`

6. **`kernel/memory/MIL.ts`** (Classe principale)

   - `ingest(rawEvent, source): Promise<UnifiedEvent>`
   - `buildContextForLLM(anchorEventId?, windowMs?): Promise<LLMContext>` — **MVP** : seulement pour UnifiedPromptBuilder
   - `queryTemporal(start, end, filters?): Promise<UnifiedEvent[]>`
   - `queryByFile(filePath): Promise<UnifiedEvent[]>`
   - `queryByType(type): Promise<UnifiedEvent[]>`
   - Persistance `GlobalClock.seq` dans `memory/seq_state.json` — **CORRIGER** : ou dériver depuis `events.jsonl`
   - `init()` : créer dossiers, charger indices
   - `close()` : flush tous les indices

**Critères de complétion Phase 1** :

- Tests unitaires passent pour chaque composant
- `MIL.ingest()` normalise et indexe correctement
- `MIL.queryTemporal()` retourne résultats triés
- Persistance fonctionne (redémarrage = données conservées)

---

## Phase 2 : Intégration Listeners Existants

**Objectif** : Faire ingérer les événements existants dans MIL.

**Fichiers à modifier** :

1. **`kernel/inputs/FileChangeWatcher.ts`**

   - Ajouter `mil?: MIL` dans constructeur (optionnel pour compatibilité)
   - Dans `saveToTraces()` (ligne ~443) : après `await this.saveToTraces(event)`, ajouter `if (this.mil) await this.mil.ingest(event, EventSource.FILE_SYSTEM)`
   - Double écriture : traces existantes + MIL (pas de breaking change)

2. **`kernel/inputs/GitCommitListener.ts`**

   - Même pattern : `mil?: MIL` dans constructeur
   - Dans `saveToTraces()` : `if (this.mil) await this.mil.ingest(event, EventSource.GIT)`

3. **`kernel/inputs/IDEActivityListener.ts`**

   - Même pattern : `mil?: MIL` dans constructeur
   - Dans `captureSnapshot()` : `if (this.mil) await this.mil.ingest(snapshot, EventSource.IDE)`

4. **`kernel/process/entrypoint.ts`**

   - Ligne ~528 : Initialiser MIL après création des writers
   ```typescript
   const mil = new MIL(workspaceRoot);
   await mil.init();
   ```

   - Passer `mil` aux listeners existants (optionnel)
   - Ajouter `mil` à `kernelComponents` pour accès IPC

**Critères de complétion Phase 2** :

- Les événements existants sont ingérés dans MIL
- Pas de régression : traces existantes fonctionnent toujours
- `memory/events.jsonl` contient des événements normalisés

---

## Phase 3 : Intégration UnifiedPromptBuilder

**Objectif** : Enrichir les prompts avec contexte MIL.

**Fichiers à modifier** :

1. **`kernel/api/UnifiedPromptBuilder.ts`**

   - Ajouter `mil?: MIL` dans constructeur (optionnel)
   - Dans `buildSnapshotData()` (ligne ~875) :
     - Appeler `MIL.buildContextForLLM()` pour récupérer événements structurés
     - Ajouter section "Memory Consolidator Context" dans prompt
     - Inclure timeline unifiée, contexte spatial, intelligence précédente (si disponible)
   - **MVP** : Seulement enrichir le prompt, pas de `storeLLMIntelligence()` (Phase 4 différée)

2. **`kernel/process/entrypoint.ts`**

   - Ligne ~600 : Passer `mil` à `UnifiedPromptBuilder` constructeur

**Critères de complétion Phase 3** :

- Les prompts générés incluent contexte MIL
- Timeline unifiée visible dans prompts
- Pas de breaking change : prompts existants fonctionnent toujours

---

## Phase 4 : Intégration TimeMachinePromptBuilder

**Objectif** : Enrichir Time Machine avec contexte MIL.

**Fichiers à modifier** :

1. **`kernel/api/TimeMachinePromptBuilder.ts`**

   - Ajouter `mil?: MIL` dans constructeur (optionnel)
   - Dans `build()` (ligne ~109) :
     - Appeler `MIL.queryTemporal(start, end)` pour récupérer événements
     - Enrichir `composePrompt()` avec timeline MIL
     - Corréler avec données existantes (git, WAL, etc.)

2. **`kernel/process/entrypoint.ts`**

   - Ligne ~327 : Passer `mil` à `TimeMachinePromptBuilder` constructeur

**Critères de complétion Phase 4** :

- Time Machine prompts incluent contexte MIL
- Corrélation temporelle fonctionne
- Pas de breaking change

---

## Phase 5 : CursorChatListener (Opt-In)

**Objectif** : Intégrer historique Cursor avec opt-in explicite.

**Fichiers à créer** :

1. **`kernel/inputs/CursorChatListener.ts`**

   - `findCursorStateDb(): string | null` — OS-specific (macOS, Windows, Linux)
   - `extractChatHistory(): Promise<void>` — Query SQLite + parsing
   - `parseChatData(chats): ChatEvent[]` — **CORRIGER** : parser puis trier par timestamp réel (pas ORDER BY value DESC)
   - `start(): Promise<void>` — Polling périodique (5 min)
   - Feature flag : vérifier `Context.RL4` ou config pour opt-in
   - Fallback silencieux si SQLite inaccessible
   - Double écriture : `traces/cursor_chat.jsonl` + `MIL.ingest()`

2. **`package.json`**

   - Ajouter `"better-sqlite3": "^9.x"` dans dependencies

**Fichiers à modifier** :

1. **`kernel/process/entrypoint.ts`**

   - Ligne ~542 : Initialiser CursorChatListener conditionnellement
   ```typescript
   // CursorChatListener (opt-in)
   let cursorChatListener: CursorChatListener | null = null;
   if (shouldEnableCursorChat(workspaceRoot)) { // Feature flag check
       cursorChatListener = new CursorChatListener(workspaceRoot, mil, undefined, logger);
       await cursorChatListener.start();
   }
   ```


2. **`kernel/api/GovernanceModeManager.ts`** (ou nouveau fichier config)

   - Ajouter méthode `shouldEnableCursorChat(workspaceRoot): boolean`
   - Vérifier `Context.RL4` frontmatter ou config file

**Critères de complétion Phase 5** :

- CursorChatListener fonctionne avec opt-in
- Fallback silencieux si SQLite inaccessible
- Pas de hard dependency : MIL fonctionne sans CursorChatListener
- Logging explicite mais non intrusif

---

## DIFFÉRÉ EXPLICITEMENT (Hors-Scope MVP)

**Ces composants sont décrits dans northstar.md Section 10 mais NE SONT PAS dans ce plan MVP :**

1. **EpisodeStore** — Stockage épisodes consolidés (Phase future)
2. **EpisodeIndex** — Index épisodes (Phase future)
3. **SpatialMapStore** — Cartes cognitives (Phase future)
4. **PlaceCell** — Cellules de lieu (Phase future)
5. **`MIL.storeLLMIntelligence()`** — Stockage intelligence LLM (Phase future)
6. **`MIL.recallContext()`** — Récupération contextuelle avancée (Phase future)
7. **ContextReconstructor** — Reconstruction contextuelle (Phase future)

**Raison** : Ces composants ne sont pas nécessaires pour les besoins directs de `UnifiedPromptBuilder` et `TimeMachinePromptBuilder` dans le MVP.

---

## Tests de Non-Régression

Après chaque phase :

1. Vérifier invariants I01-I20 (northstar.md Section 4)
2. Vérifier que prompts existants fonctionnent toujours
3. Vérifier que Time Machine fonctionne toujours
4. Vérifier que traces existantes sont toujours écrites

---

## Structure Fichiers Cible

```
kernel/memory/
├── types.ts                    ✅ Phase 1
├── EventNormalizer.ts          ✅ Phase 1
├── TemporalIndex.ts            ✅ Phase 1
├── SpatialIndex.ts             ✅ Phase 1
├── TypeIndex.ts                ✅ Phase 1
└── MIL.ts                      ✅ Phase 1

kernel/inputs/
├── FileChangeWatcher.ts        ✅ Phase 2 (modification)
├── GitCommitListener.ts        ✅ Phase 2 (modification)
├── IDEActivityListener.ts      ✅ Phase 2 (modification)
└── CursorChatListener.ts       ✅ Phase 5 (nouveau)

kernel/api/
├── UnifiedPromptBuilder.ts     ✅ Phase 3 (modification)
└── TimeMachinePromptBuilder.ts ✅ Phase 4 (modification)

kernel/process/
└── entrypoint.ts               ✅ Phase 2, 3, 4, 5 (modifications)

.reasoning_rl4/memory/
├── events.jsonl                ✅ Phase 1
├── indices/
│   ├── temporal.json           ✅ Phase 1
│   ├── spatial.json            ✅ Phase 1
│   └── type_index.json         ✅ Phase 1
└── seq_state.json              ✅ Phase 1
```

---

## Risques et Mitigations

| Risque | Mitigation |

|--------|------------|

| Scope creep (effet cathédrale) | Règle 1 stricte : seulement besoins directs |

| EpisodeStore mutatif | Règle 2 stricte : append-only uniquement |

| CursorChatListener perception "espionnage" | Règle 3 stricte : opt-in + fallback silencieux |

| Breaking changes | Tous les paramètres MIL optionnels, double écriture |

| Performance (flush fréquent) | Flush périodique 5s, pas synchrone à chaque insert |

---

**FIN DU PLAN MVP**