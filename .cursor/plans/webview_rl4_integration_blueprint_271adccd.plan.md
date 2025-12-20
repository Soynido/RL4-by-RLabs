---
name: WebView RL4 Integration Blueprint
overview: Plan d'integration production-ready de la WebView RL4 couvrant onboarding, tabs, snapshot engine, tasks, insights, time machine, et IPC complet. Version ULTIME avec corrections Risques/Oublis/Hypotheses.
todos:
  - id: phase0-tokens
    content: Extraire les CSS tokens du mockup et creer design-tokens.css
    status: completed
  - id: phase0-structure
    content: Creer l'arborescence complete des composants WebView
    status: completed
  - id: phase0-types
    content: Creer types.ts avec WorkspaceState EXACT signature RL6
    status: completed
  - id: phase1-kernel-handlers
    content: Ajouter les 4 handlers manquants dans entrypoint.ts
    status: completed
  - id: phase1-ipc-wrapper
    content: Creer KernelAPIWrapper cote extension pour typed IPC
    status: completed
  - id: phase1-message-router
    content: Creer messageRouter.ts avec registry handlers central
    status: completed
  - id: phase2-store-slices
    content: Implementer 5 slices Zustand (UI, Workspace, Dev, Insights, TM)
    status: completed
    dependencies:
      - phase0-structure
      - phase0-types
  - id: phase2-event-bus
    content: Implementer EventBus interne pour cross-slice communication
    status: completed
  - id: phase2-hydrator
    content: Implementer KernelStateHydrator pour boot sequence
    status: completed
  - id: phase2-ready-gate
    content: Implementer KernelReadyGate composant loading
    status: completed
  - id: phase3-ui-components
    content: Implementer les composants UI de base (Button, Card, etc)
    status: completed
    dependencies:
      - phase0-tokens
  - id: phase3-layout
    content: Implementer Header, TabNav, FooterStatus, WebViewFrame
    status: completed
    dependencies:
      - phase3-ui-components
  - id: phase3-control
    content: Implementer SnapshotSection, ModeSelector, PromptPreview
    status: completed
    dependencies:
      - phase3-layout
  - id: phase3-dev
    content: Implementer TasksSection, CapturedSession, TrackedItems
    status: completed
    dependencies:
      - phase3-layout
  - id: phase3-insights
    content: Implementer InsightsView et InsightCard
    status: completed
    dependencies:
      - phase3-layout
  - id: phase3-timemachine
    content: Implementer TimeMachineView avec DatePicker et Timeline
    status: completed
    dependencies:
      - phase3-layout
  - id: phase4-onboarding
    content: Implementer OnboardingBanner avec signature RL6 exacte
    status: completed
    dependencies:
      - phase1-kernel-handlers
      - phase0-types
  - id: phase5-refresh-scheduler
    content: Implementer auto-refresh pour Tasks/Insights/AutoTasks
    status: completed
  - id: phase5-error-handling
    content: Implementer gestion erreurs kernel + timeouts IPC
    status: completed
  - id: phase5-theme-sync
    content: Implementer sync theme RL4 avec VSCode color scheme
    status: completed
  - id: phase5-wiring
    content: Connecter tous les composants au store et IPC
    status: completed
    dependencies:
      - phase2-store-slices
      - phase3-control
      - phase3-dev
      - phase3-insights
      - phase3-timemachine
      - phase1-message-router
  - id: phase6-testing
    content: Tester les 10+ scenarios definis dans le plan
    status: completed
    dependencies:
      - phase5-wiring
---

# RL4 WebView Integration Blueprint - VERSION ULTIME

## 1. Resume Synthetique

La WebView RL4 est un panneau lateral React servant d'interface unifiee pour le kernel RL4.

**Fonctions principales** :

- Generer des snapshots contextuels (mode strict/flexible/exploratory/free/firstUse)
- Visualiser l'activite (tasks locales, capturees, RL4)
- Diagnostiquer via Insights (repo delta, plan drift, blindspots)
- Reconstruire l'historique via Time Machine
- Gerer l'onboarding (first-use standard/extended)

**Architecture** : React + Zustand (5 slices) + EventBus + MessageRouter, communication via `postMessage` vers extension host, relaye vers kernel via IPC Node.js.

---

## 2. CORRECTIONS CRITIQUES (Risques identifies)

### CORRECTION A - Signature WorkspaceState EXACTE (RL6)

La signature **REELLE** dans `kernel/onboarding/OnboardingDetector.ts` est :

```typescript
interface WorkspaceState {
    mode: 'existing' | 'new' | 'ambiguous';  // PAS firstUse/extended ici !
    confidence: number;
    evidence: {
        git_commits: number;
        git_age_days: number;
        git_contributors: number;
        files_count: number;
        source_files_count: number;
        has_package_json: boolean;
        has_git: boolean;
        recent_activity: boolean;
        first_commit_date: string | null;
        last_commit_date: string | null;
        recent_commits_3_months: number;
    };
    recommendation: string;
    isLargeProject: boolean;
    requiresGitHubConnect: boolean;
    largeProjectReason?: string;
    firstUseMode?: 'standard' | 'extended';  // NOUVEAU champ RL6
    firstUseReasons?: string[];              // NOUVEAU champ RL6
}
```

**Impact** : Le frontend doit mapper `firstUseMode` (pas `mode`) pour determiner le type d'onboarding.

---

### CORRECTION B - Store Zustand en 5 SLICES (pas monolithique)

```typescript
// state/slices/uiSlice.ts
interface UIState {
  activeTab: 'control' | 'dev' | 'timemachine' | 'insights' | 'about';
  theme: 'ghost' | 'mint' | 'uv';
  kernelReady: boolean;
  bootPhase: 'booting' | 'detecting' | 'hydrating' | 'ready' | 'error';
  safeMode: boolean;
  safeModeReason: string | null;
}

// state/slices/workspaceSlice.ts
interface WorkspaceState {
  workspace: WorkspaceStateFromKernel | null;
  mode: GovernanceMode;
  onboardingComplete: boolean;
  onboardingStep: number;
}

// state/slices/devSlice.ts
interface DevState {
  localTasks: Task[];
  capturedItems: CapturedItem[];
  rl4Tasks: Task[];
  taskFilter: 'all' | 'P0' | 'P1' | 'P2';
  autoTasksCount: number;
}

// state/slices/insightsSlice.ts
interface InsightsState {
  repoDelta: RepoDelta | null;
  planDrift: PlanDrift | null;
  blindspots: Blindspots | null;
  currentPhase: string;
  lastRefresh: number;
}

// state/slices/timeMachineSlice.ts
interface TimeMachineState {
  startDate: string;
  endDate: string;
  minDate: string | null;  // first cycle
  maxDate: string;         // today
  loading: boolean;
  prompt: string | null;
  error: string | null;
}

// state/slices/snapshotSlice.ts
interface SnapshotState {
  loading: boolean;
  prompt: string | null;
  lastSnapshotIso: string | null;
  filesChanged: number;
  success: boolean;
}
```

**Combinaison via `create` avec slices** :

```typescript
// state/store.ts
import { create } from 'zustand';
import { createUISlice } from './slices/uiSlice';
import { createWorkspaceSlice } from './slices/workspaceSlice';
// ...

export const useStore = create<StoreState>()((...a) => ({
  ...createUISlice(...a),
  ...createWorkspaceSlice(...a),
  ...createDevSlice(...a),
  ...createInsightsSlice(...a),
  ...createTimeMachineSlice(...a),
  ...createSnapshotSlice(...a),
}));
```

---

### CORRECTION C - Chat Pane simplifie (PromptPreview)

Le chat-pane du mockup devient **PromptPreview** :

- Read-only textarea affichant le dernier snapshot
- Header avec timestamp
- Bouton "Copy to clipboard"
- PAS de chat interactif
```typescript
// components/control/PromptPreview.tsx
interface PromptPreviewProps {
  prompt: string | null;
  timestamp: string | null;
  onCopy: () => void;
}
```


---

### CORRECTION D - MessageRouter central

```typescript
// handlers/messageRouter.ts
import { useStore } from '../state/store';

type MessageHandler = (payload: any) => void;

const handlers: Record<string, MessageHandler> = {
  // Workspace
  workspaceState: (payload) => {
    useStore.getState().setWorkspace(payload);
  },
  
  // Snapshot
  snapshotGenerated: (payload) => {
    useStore.getState().setSnapshotPrompt(payload.prompt);
    useStore.getState().setSnapshotLoading(false);
    useStore.getState().setSnapshotSuccess(true);
    // Auto-copy to clipboard
    navigator.clipboard?.writeText(payload.prompt);
    // Trigger refresh via EventBus
    eventBus.emit('snapshot:complete');
  },
  
  // Tasks
  localTasks: (payload) => useStore.getState().setLocalTasks(payload.tasks),
  capturedSession: (payload) => useStore.getState().setCapturedItems(payload.items),
  rl4Tasks: (payload) => useStore.getState().setRL4Tasks(payload.tasks),
  
  // Insights
  insightsPayload: (payload) => {
    useStore.getState().setRepoDelta(payload.repoDelta);
    useStore.getState().setPlanDrift(payload.planDrift);
    useStore.getState().setBlindspots(payload.blindspots);
    useStore.getState().setCurrentPhase(payload.phase);
  },
  
  // Time Machine
  timeMachineGenerated: (payload) => {
    if (payload.error) {
      useStore.getState().setTMError(payload.error);
    } else {
      useStore.getState().setTMPrompt(payload.prompt);
    }
    useStore.getState().setTMLoading(false);
  },
  
  // System
  kernelStatus: (payload) => {
    useStore.getState().setKernelReady(true);
    useStore.getState().setBootPhase('ready');
  },
  
  // Errors
  kernelError: (payload) => {
    useStore.getState().setSafeMode(true);
    useStore.getState().setSafeModeReason(payload.message);
    useStore.getState().setBootPhase('error');
  },
  
  'kernel:notReady': (payload) => {
    useStore.getState().setSafeMode(payload.safeMode || false);
    useStore.getState().setSafeModeReason(payload.reason || null);
  },
};

export function dispatchMessage(type: string, payload: any): void {
  const handler = handlers[type];
  if (handler) {
    try {
      handler(payload);
    } catch (err) {
      console.error(`[MessageRouter] Handler failed for ${type}:`, err);
    }
  } else {
    console.warn(`[MessageRouter] Unknown message type: ${type}`);
  }
}
```

**Installation dans App.tsx** :

```typescript
useEffect(() => {
  const listener = (event: MessageEvent) => {
    const { type, payload } = event.data || {};
    if (type) {
      dispatchMessage(type, payload);
    }
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}, []);
```

---

## 3. CORRECTIONS STRUCTURELLES (Oublis)

### CORRECTION E - Auto-Refresh Scheduler

```typescript
// hooks/useAutoRefresh.ts
import { useEffect, useRef } from 'react';
import { eventBus } from '../utils/eventBus';

const REFRESH_INTERVALS = {
  autoTasksCount: 30_000,  // 30s
  insights: 60_000,        // 1min
  tasks: 45_000,           // 45s
};

export function useAutoRefresh() {
  const timersRef = useRef<Record<string, NodeJS.Timer>>({});
  
  useEffect(() => {
    // Setup periodic refreshes
    timersRef.current.autoTasks = setInterval(() => {
      vscode.postMessage({ type: 'rl4:getAutoTasksCount' });
    }, REFRESH_INTERVALS.autoTasksCount);
    
    timersRef.current.insights = setInterval(() => {
      vscode.postMessage({ type: 'rl4:getInsights' });
    }, REFRESH_INTERVALS.insights);
    
    // Refresh on snapshot complete
    const unsubSnapshot = eventBus.on('snapshot:complete', () => {
      vscode.postMessage({ type: 'rl4:getInsights' });
      vscode.postMessage({ type: 'rl4:getLocalTasks' });
      vscode.postMessage({ type: 'rl4:getAutoTasksCount' });
    });
    
    return () => {
      Object.values(timersRef.current).forEach(clearInterval);
      unsubSnapshot();
    };
  }, []);
}
```

---

### CORRECTION F - Gestion Erreurs Kernel

```typescript
// hooks/useKernelIPC.ts
const IPC_TIMEOUT_MS = 10_000;

export function useKernelIPC() {
  const pendingQueries = useRef<Map<string, {
    resolve: (data: any) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }>>(new Map());
  
  const query = useCallback(async <T>(type: string, payload?: any): Promise<T> => {
    const queryId = `${type}-${Date.now()}`;
    
    return new Promise((resolve, reject) => {
      // Setup timeout
      const timer = setTimeout(() => {
        pendingQueries.current.delete(queryId);
        reject(new Error(`IPC timeout: ${type}`));
        useStore.getState().setSafeMode(true);
        useStore.getState().setSafeModeReason(`Kernel not responding (${type})`);
      }, IPC_TIMEOUT_MS);
      
      pendingQueries.current.set(queryId, { resolve, reject, timer });
      
      vscode.postMessage({ type: `rl4:${type}`, payload, queryId });
    });
  }, []);
  
  // Handle responses
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const { queryId, data, error } = event.data || {};
      
      const pending = pendingQueries.current.get(queryId);
      if (pending) {
        clearTimeout(pending.timer);
        pendingQueries.current.delete(queryId);
        
        if (error) {
          pending.reject(new Error(error));
        } else {
          pending.resolve(data);
        }
      }
    };
    
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
  
  return { query };
}
```

---

### CORRECTION G - Sync Theme VSCode

```typescript
// hooks/useVSCodeTheme.ts
export function useVSCodeTheme() {
  const [vscodeTheme, setVscodeTheme] = useState<'dark' | 'light'>('dark');
  
  useEffect(() => {
    // Detect VSCode theme from CSS variables
    const detectTheme = () => {
      const bg = getComputedStyle(document.body)
        .getPropertyValue('--vscode-editor-background')
        .trim();
      
      if (bg) {
        // Parse luminance
        const rgb = bg.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          const luminance = (parseInt(rgb[0]) * 299 + 
                           parseInt(rgb[1]) * 587 + 
                           parseInt(rgb[2]) * 114) / 1000;
          setVscodeTheme(luminance > 128 ? 'light' : 'dark');
        }
      }
    };
    
    detectTheme();
    
    // Watch for theme changes
    const observer = new MutationObserver(detectTheme);
    observer.observe(document.body, { 
      attributes: true, 
      attributeFilter: ['class', 'style'] 
    });
    
    return () => observer.disconnect();
  }, []);
  
  return vscodeTheme;
}

// Dans App.tsx - forcer background opaque
useEffect(() => {
  document.body.style.setProperty('--rl4-bg-override', 
    vscodeTheme === 'dark' ? 'var(--bg-primary)' : '#f5f5f5');
}, [vscodeTheme]);
```

---

## 4. CORRECTIONS ARCHITECTURALES

### CORRECTION H - KernelStateHydrator

```typescript
// hooks/useKernelHydrator.ts
export function useKernelHydrator() {
  const setBootPhase = useStore(s => s.setBootPhase);
  const hydrated = useRef(false);
  
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    
    const hydrate = async () => {
      try {
        setBootPhase('detecting');
        
        // 1. Workspace state (determines onboarding)
        vscode.postMessage({ type: 'rl4:getWorkspaceState' });
        
        setBootPhase('hydrating');
        
        // 2. Parallel hydration
        await Promise.all([
          vscode.postMessage({ type: 'rl4:getMode' }),
          vscode.postMessage({ type: 'rl4:getInsights' }),
          vscode.postMessage({ type: 'rl4:getLocalTasks' }),
          vscode.postMessage({ type: 'rl4:getCapturedSession' }),
          vscode.postMessage({ type: 'rl4:getAutoTasksCount' }),
          vscode.postMessage({ type: 'rl4:status' }),
        ]);
        
        // 3. Ready after first responses arrive
        // (handled by messageRouter -> setKernelReady)
        
      } catch (err) {
        console.error('[Hydrator] Failed:', err);
        setBootPhase('error');
      }
    };
    
    hydrate();
  }, []);
}
```

---

### CORRECTION I - KernelReadyGate

```typescript
// components/KernelReadyGate.tsx
interface KernelReadyGateProps {
  children: React.ReactNode;
}

const BOOT_MESSAGES: Record<string, string> = {
  booting: 'Booting RL4...',
  detecting: 'Detecting workspace...',
  hydrating: 'Loading project state...',
  error: 'Kernel error. Click Repair.',
};

export const KernelReadyGate: React.FC<KernelReadyGateProps> = ({ children }) => {
  const bootPhase = useStore(s => s.bootPhase);
  const safeMode = useStore(s => s.safeMode);
  const safeModeReason = useStore(s => s.safeModeReason);
  
  if (bootPhase === 'ready' && !safeMode) {
    return <>{children}</>;
  }
  
  return (
    <div className="rl4-boot-gate">
      <div className="rl4-boot-spinner" />
      <p className="rl4-boot-message">
        {safeMode ? safeModeReason : BOOT_MESSAGES[bootPhase]}
      </p>
      {(bootPhase === 'error' || safeMode) && (
        <Button 
          variant="primary" 
          onClick={() => vscode.postMessage({ type: 'rl4:resetCodec' })}
        >
          Repair Kernel
        </Button>
      )}
    </div>
  );
};
```

---

### CORRECTION J - EventBus interne

```typescript
// utils/eventBus.ts
type EventCallback = (...args: any[]) => void;

class EventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();
  
  on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }
  
  emit(event: string, ...args: any[]): void {
    this.listeners.get(event)?.forEach(cb => {
      try {
        cb(...args);
      } catch (err) {
        console.error(`[EventBus] Error in ${event} handler:`, err);
      }
    });
  }
  
  off(event: string, callback?: EventCallback): void {
    if (callback) {
      this.listeners.get(event)?.delete(callback);
    } else {
      this.listeners.delete(event);
    }
  }
}

export const eventBus = new EventBus();

// Events:
// - 'snapshot:complete' -> refresh insights, tasks
// - 'task:updated' -> refresh task list
// - 'mode:changed' -> refresh snapshot section
// - 'kernel:error' -> show safe mode
```

---

### CORRECTION K - UI Contract Map (Documentation)

```json
{
  "SnapshotSection": {
    "queries": ["generate_snapshot", "set_mode", "get_mode"],
    "events_in": ["snapshotGenerated", "modeChanged"],
    "events_out": ["rl4:generateSnapshot", "rl4:setMode"]
  },
  "TasksSection": {
    "queries": ["get_local_tasks", "add_local_task", "toggle_local_task"],
    "events_in": ["localTasks", "taskAdded", "taskToggled"],
    "events_out": ["rl4:getLocalTasks", "rl4:addLocalTask", "rl4:toggleLocalTask"]
  },
  "CapturedSession": {
    "queries": ["get_captured_session", "promote_to_rl4"],
    "events_in": ["capturedSession", "promoted"],
    "events_out": ["rl4:getCapturedSession", "rl4:promoteToRL4"]
  },
  "TrackedItems": {
    "queries": ["get_rl4_tasks"],
    "events_in": ["rl4Tasks"],
    "events_out": ["rl4:getRL4Tasks"]
  },
  "InsightsView": {
    "queries": ["get_repo_delta", "get_plan_drift", "get_blindspots", "get_current_phase"],
    "events_in": ["insightsPayload"],
    "events_out": ["rl4:getInsights"]
  },
  "TimeMachineView": {
    "queries": ["build_time_machine_prompt", "get_timeline_range"],
    "events_in": ["timeMachineGenerated", "timelineRange"],
    "events_out": ["rl4:buildTimeMachine", "rl4:getTimelineRange"]
  },
  "OnboardingBanner": {
    "queries": ["get_workspace_state", "mark_onboarding_complete"],
    "events_in": ["workspaceState", "onboardingMarked"],
    "events_out": ["rl4:getWorkspaceState", "rl4:markOnboardingComplete"]
  },
  "AboutView": {
    "queries": ["reset_codec", "export_logs", "get_faq", "get_system_status"],
    "events_in": ["codecReset", "logsExported", "faq", "systemStatus"],
    "events_out": ["rl4:resetCodec", "rl4:exportLogs", "rl4:getFAQ", "rl4:getSystemStatus"]
  }
}
```

---

## 5. Endpoints Kernel - LISTE COMPLETE

### Existants (RL6 entrypoint.ts)

| Handler | Payload | Retour |

|---------|---------|--------|

| `status` | `{}` | `{ uptime, health, timers, queueSize, version }` |

| `get_last_cycle_health` | `{}` | `{ cycleId, success, phases, duration, error? }` |

| `reflect` | `{}` | `CycleResult` |

| `get_mode` | `{}` | `{ mode }` |

| `set_mode` | `{ mode }` | `{ success, mode }` |

| `generate_snapshot` | `{ mode, cycleContext? }` | `{ prompt, metadata }` |

| `get_auto_tasks_count` | `{}` | `{ count }` |

| `get_workspace_state` | `{}` | `WorkspaceState` (signature exacte ci-dessus) |

| `get_local_tasks` | `{}` | `{ tasks: Task[] }` |

| `add_local_task` | `{ task }` | `{ success }` |

| `toggle_local_task` | `{ id }` | `{ success }` |

| `get_captured_session` | `{}` | `{ items: CapturedItem[] }` |

| `promote_to_rl4` | `{}` | `{ success }` |

| `get_rl4_tasks` | `{ filter? }` | `{ tasks: Task[] }` |

| `build_time_machine_prompt` | `{ startIso, endIso }` | `{ prompt, metadata }` |

| `get_repo_delta` | `{}` | `RepoDelta` |

| `get_plan_drift` | `{}` | `PlanDrift` |

| `get_blindspots` | `{}` | `Blindspots` |

| `get_current_phase` | `{}` | `{ phase: string }` |

| `reset_codec` | `{}` | `{ success }` |

| `export_logs` | `{}` | `{ logs }` |

| `get_faq` | `{}` | `{ faq }` |

| `get_system_status` | `{}` | `SystemStatus` |

### A CREER (4 handlers)

| Handler | Payload | Retour | Impl |

|---------|---------|--------|------|

| `get_timeline_range` | `{}` | `{ firstCycleIso, lastCycleIso }` | Lire cycles.jsonl first/last |

| `mark_onboarding_complete` | `{ mode: 'new' \| 'existing' }` | `{ success }` | Write `.onboarding_complete` |

| `reset_onboarding` | `{}` | `{ success }` | Delete `.onboarding_complete` |

| `get_onboarding_status` | `{}` | `{ complete: boolean, mode?, firstUseMode? }` | Read marker + workspace |

**Note** : `get_timeline_range` peut potentiellement utiliser `evidence.first_commit_date` / `evidence.last_commit_date` de WorkspaceState si disponible.

---

## 6. Arborescence WebView COMPLETE (mise a jour)

```
webview/
├── App.tsx                              # Main + KernelReadyGate + message listener
├── index.tsx                            # Entry point
├── index.css                            # Global imports
│
├── components/
│   ├── KernelReadyGate.tsx              # NOUVEAU - Boot loading screen
│   ├── layout/
│   │   ├── WebViewFrame.tsx
│   │   ├── Header.tsx
│   │   ├── TabNav.tsx
│   │   ├── Breadcrumb.tsx
│   │   └── FooterStatus.tsx
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Dropdown.tsx
│   │   ├── Input.tsx
│   │   ├── Tab.tsx
│   │   ├── SeverityPill.tsx
│   │   └── ThemePill.tsx
│   ├── onboarding/
│   │   ├── OnboardingBanner.tsx
│   │   ├── StepIndicator.tsx
│   │   └── HintsList.tsx
│   ├── control/
│   │   ├── SnapshotSection.tsx
│   │   ├── ModeSelector.tsx
│   │   ├── PromptPreview.tsx            # NOUVEAU - remplace Chat Pane
│   │   └── AutoTasksBadge.tsx
│   ├── dev/
│   │   ├── TasksSection.tsx
│   │   ├── CapturedSession.tsx
│   │   ├── TrackedItems.tsx
│   │   ├── TaskItem.tsx
│   │   └── PriorityFilter.tsx
│   ├── timemachine/
│   │   ├── TimeMachineView.tsx
│   │   ├── DatePicker.tsx
│   │   ├── Timeline.tsx
│   │   └── PromptBox.tsx
│   ├── insights/
│   │   ├── InsightsView.tsx
│   │   ├── InsightCard.tsx
│   │   └── PhaseIndicator.tsx
│   └── about/
│       ├── AboutView.tsx
│       ├── SupportCard.tsx
│       └── FAQCard.tsx
│
├── state/
│   ├── store.ts                         # Combined store with slices
│   ├── slices/
│   │   ├── uiSlice.ts                   # NOUVEAU - UI state
│   │   ├── workspaceSlice.ts            # NOUVEAU - Workspace + onboarding
│   │   ├── devSlice.ts                  # NOUVEAU - Tasks
│   │   ├── insightsSlice.ts             # NOUVEAU - Insights
│   │   ├── timeMachineSlice.ts          # NOUVEAU - Time Machine
│   │   └── snapshotSlice.ts             # NOUVEAU - Snapshot
│   ├── types.ts                         # WorkspaceState EXACT signature
│   └── selectors.ts
│
├── hooks/
│   ├── useKernelIPC.ts                  # With timeout + error handling
│   ├── useKernelHydrator.ts             # NOUVEAU - Boot hydration
│   ├── useAutoRefresh.ts                # NOUVEAU - Periodic refresh
│   ├── useVSCodeTheme.ts                # NOUVEAU - Theme sync
│   ├── useSnapshot.ts
│   ├── useTasks.ts
│   ├── useInsights.ts
│   ├── useTimeMachine.ts
│   └── useTheme.ts
│
├── handlers/
│   └── messageRouter.ts                 # NOUVEAU - Central dispatcher
│
├── utils/
│   └── eventBus.ts                      # NOUVEAU - Internal pub/sub
│
├── contracts/
│   └── ui-contract-map.json             # NOUVEAU - Documentation
│
└── styles/
    ├── tokens.css
    ├── animations.css
    ├── layout.css
    └── components.css
```

---

## 7. Schema Runtime COMPLET (ASCII)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                                    USER                                              │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              WEBVIEW (React)                                         │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  KernelReadyGate                                                              │   │
│  │    bootPhase: booting -> detecting -> hydrating -> ready                      │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                             │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  App.tsx                                                                      │   │
│  │    - useKernelHydrator() -> initial data fetch                                │   │
│  │    - useAutoRefresh() -> periodic refresh                                     │   │
│  │    - useEffect(message listener) -> dispatchMessage()                         │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────┐  │
│  │  Control    │  │    Dev      │  │ TimeMachine │  │  Insights   │  │  About   │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └────┬─────┘  │
│         │                │                │                │              │         │
│         └────────────────┴────────────────┴────────────────┴──────────────┘         │
│                                        │                                             │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  Zustand Store (5 slices)                                                     │   │
│  │    ├── uiSlice       (activeTab, theme, bootPhase, safeMode)                  │   │
│  │    ├── workspaceSlice (workspace, mode, onboarding)                           │   │
│  │    ├── devSlice      (tasks, captured, rl4Tasks)                              │   │
│  │    ├── insightsSlice (delta, drift, blindspots, phase)                        │   │
│  │    ├── timeMachineSlice (dates, prompt, loading)                              │   │
│  │    └── snapshotSlice (prompt, loading, success)                               │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                             │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  MessageRouter                                                                │   │
│  │    - handlers: { workspaceState, snapshotGenerated, localTasks, ... }         │   │
│  │    - dispatchMessage(type, payload) -> handlers[type](payload)                │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                             │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  EventBus                                                                     │   │
│  │    - 'snapshot:complete' -> refresh insights, tasks                           │   │
│  │    - 'task:updated' -> refresh task list                                      │   │
│  │    - 'mode:changed' -> UI update                                              │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                             │
│                               vscode.postMessage()                                   │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              EXTENSION HOST                                          │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  RL4WebViewManager                                                            │   │
│  │    - onMessage(type, payload) {                                               │   │
│  │        switch(type) {                                                         │   │
│  │          case 'rl4:generateSnapshot':                                         │   │
│  │            kernelBridge.query('generate_snapshot', payload)                   │   │
│  │              .then(data => webview.postMessage({ type: 'snapshotGenerated' }))│   │
│  │              .catch(err => webview.postMessage({ type: 'kernelError' }))      │   │
│  │        }                                                                      │   │
│  │      }                                                                        │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                             │
│                              kernelBridge.query()                                    │
│                                        │                                             │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  KernelBridge                                                                 │   │
│  │    - spawn('kernel/process/entrypoint.js', workspaceRoot)                     │   │
│  │    - process.send({ type: 'query', query_type, payload })                     │   │
│  │    - process.on('message', handleReply)                                       │   │
│  │    - TIMEOUT: 10s -> reject + notify error                                    │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              KERNEL PROCESS                                          │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  entrypoint.ts -> handleQuery(msg)                                            │   │
│  │    switch(query_type) {                                                       │   │
│  │      'generate_snapshot' -> promptBuilder.generate(mode)                      │   │
│  │      'get_workspace_state' -> detectWorkspaceState(workspaceRoot)             │   │
│  │      'get_repo_delta' -> deltaCalculator.calculateRepoDelta()                 │   │
│  │      'get_timeline_range' -> readCyclesJsonlRange() // A CREER                │   │
│  │      ...                                                                      │   │
│  │    }                                                                          │   │
│  │    process.send({ type: 'query_reply', success: true, data })                 │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                        │                                             │
│                         Read/Write .reasoning_rl4/*                                  │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  Persistence:                                                                 │   │
│  │    traces/kernel.jsonl, file_changes.jsonl, git_commits.jsonl                 │   │
│  │    ledger/cycles.jsonl                                                        │   │
│  │    state/kernel.json, kernel_history.jsonl                                    │   │
│  │    snapshots/*.json                                                           │   │
│  │    governance/Context.RL4, Plan.RL4, Tasks.RL4                                │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Testing Scenarios (12 scenarios)

| # | Scenario | Actions | Attendu |

|---|----------|---------|---------|

| 1 | Boot - New project | Extension activate | KernelReadyGate -> "Booting" -> "Ready", Banner "First Use" |

| 2 | Boot - Existing project | Extension activate | Banner "First Use Extended", 3 steps visibles |

| 3 | Boot - Large project | Extension activate (>100 files) | Banner avec GitHub Connect Gate option |

| 4 | Generate snapshot | Click CTA | Loading -> prompt in PromptPreview -> clipboard copy |

| 5 | Mode change | Select "flexible" | Dropdown update, IPC `set_mode`, mode slice update |

| 6 | Add local task | Type + click Add | Task dans liste, IPC `add_local_task` |

| 7 | Toggle task | Click checkbox | State toggle, IPC `toggle_local_task` |

| 8 | Time Machine | Dates + CTA | Loading -> prompt generated, dates validated |

| 9 | Insights HIGH | Repo delta > 50 files | Card rouge avec glow, severity "HIGH" |

| 10 | Kernel crash | Kill kernel | SafeMode banner, "Repair" CTA visible |

| 11 | IPC timeout | Slow kernel | Error handling, safeMode true, reason displayed |

| 12 | Auto-refresh | Wait 30s | AutoTasks count updated automatiquement |

---

## 9. Checklist Pixel-Perfect (inchange)

### Design Tokens

- [ ] `--bg-primary: #05050A`
- [ ] `--bg-secondary: #090613`
- [ ] `--bg-surface: rgba(255, 255, 255, 0.03)`
- [ ] `--border-default: rgba(255, 255, 255, 0.08)`
- [ ] `--text-primary: #ffffff`
- [ ] `--text-secondary: rgba(255, 255, 255, 0.70)`
- [ ] `--text-muted: rgba(255, 255, 255, 0.40)`
- [ ] `--cta-gradient: linear-gradient(135deg, #a855f7, #7b5dff, #6366f1)`
- [ ] `--success-gradient: linear-gradient(135deg, #10b981, #34d399)`
- [ ] `--severity-high: #f472b6`
- [ ] `--severity-medium: #fbbf24`
- [ ] `--severity-low: #10b981`
- [ ] `--radius-frame: 36px`
- [ ] `--radius-card: 24px`
- [ ] `--radius-button: 16px`
- [ ] `--font-sans: 'Geist'`
- [ ] `--font-mono: 'Geist Mono'`

### Animations

- [ ] `fadeIn` (opacity + translateY)
- [ ] `dropdownIn` (opacity + translateY)
- [ ] `pulse` (opacity oscillation)
- [ ] Tab transition `0.2s ease`

### Components

- [ ] Header: Logo 48px avec gradient + shadow
- [ ] Theme pills: Ghost/Mint/UV avec border active
- [ ] Tabs: 5 tabs avec icones SVG, gradient active (mint)
- [ ] Breadcrumb: uppercase, letter-spacing 0.3em
- [ ] Cards: backdrop-filter blur(20px), inset shadow
- [ ] Severity pills: glow shadows
- [ ] CTA buttons: gradient + shadow 0 25px 60px
- [ ] Dropdown: floating menu avec animation
- [ ] Onboarding banner: gradient background + step indicators
- [ ] Timeline: gradient fill + white dots
- [ ] Footer status: checkmark icon + text
- [ ] KernelReadyGate: spinner + message + repair CTA

---

## 10. Resume Execution

### Fichiers a CREER (WebView React)

- 40+ composants React
- 6 slices Zustand
- 1 messageRouter
- 1 eventBus
- 5 hooks specifiques
- 4 fichiers CSS

### Fichiers a MODIFIER (Kernel)

- `entrypoint.ts` : +4 handlers (`get_timeline_range`, `mark_onboarding_complete`, `reset_onboarding`, `get_onboarding_status`)

### Fichiers a CREER (Extension)

- `RL4WebViewManager.ts` : Message routing WebView <-> Kernel
- `webview/index.html` : HTML host pour React

### Ordre d'execution recommande

1. Phase 0 : Tokens + Types + Structure
2. Phase 1 : Kernel handlers + Message Router
3. Phase 2 : Store slices + EventBus + Hydrator + ReadyGate
4. Phase 3 : UI Components (tous)
5. Phase 4 : Onboarding (avec signature exacte)
6. Phase 5 : Refresh + Errors + Theme + Wiring final
7. Phase 6 : Tests des 12 scenarios

---

**Ce plan est maintenant COMPLET et peut etre execute dans Cursor sans erreurs d'architecture.**