import { useStore } from '../state/store';
import { eventBus } from '../utils/eventBus';

type MessageHandler = (payload: any) => void;

const handlers: Record<string, MessageHandler> = {
  // Workspace / onboarding
  workspaceState: (payload) => {
    useStore.getState().setWorkspace(payload || null);
  },
  onboardingMarked: (_payload) => {
    useStore.getState().setOnboardingComplete(true);
  },

  // Snapshot
  snapshotGenerated: (payload) => {
    useStore.getState().setSnapshotPrompt(payload?.prompt || null);
    useStore.getState().setSnapshotLoading(false);
    useStore.getState().setSnapshotSuccess(true);
    if (payload?.metadata?.timestamp) {
      useStore.getState().setLastSnapshotIso(payload.metadata.timestamp);
    }
    try {
      if (payload?.prompt && navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(String(payload.prompt)).catch(() => {});
      }
    } catch (_e) {
      // ignore clipboard errors
    }
    eventBus.emit('snapshot:complete');
  },

  // Mode / status
  modeChanged: (payload) => {
    if (payload?.mode) {
      useStore.getState().setMode(payload.mode);
      eventBus.emit('mode:changed', payload.mode);
    }
  },
  themeChanged: (payload) => {
    if (payload?.theme) {
      useStore.getState().setTheme(payload.theme);
    }
  },
  kernelStatus: (_payload) => {
    useStore.getState().setKernelReady(true);
    useStore.getState().setBootPhase('ready');
  },
  kernelError: (payload) => {
    useStore.getState().setSafeMode(true);
    useStore.getState().setSafeModeReason(payload?.message || 'Kernel error');
    useStore.getState().setBootPhase('error');
  },
  'kernel:notReady': (payload) => {
    useStore.getState().setSafeMode(payload?.safeMode || false);
    useStore.getState().setSafeModeReason(payload?.reason || null);
  },

  // Tasks
  localTasks: (payload) => useStore.getState().setLocalTasks(payload?.tasks || []),
  capturedSession: (payload) => useStore.getState().setCapturedItems(payload?.items || []),
  rl4Tasks: (payload) => useStore.getState().setRL4Tasks(payload?.tasks || []),
  autoTasksCount: (payload) => {
    if (typeof payload?.count === 'number') {
      useStore.getState().setAutoTasksCount(payload.count);
    }
  },

  // Insights
  insightsPayload: (payload) => {
    useStore.getState().setRepoDelta(payload?.repoDelta || payload || null);
    useStore.getState().setPlanDrift(payload?.planDrift || null);
    useStore.getState().setBlindspots(payload?.blindspots || null);
    if (payload?.phase) {
      useStore.getState().setCurrentPhase(payload.phase);
    }
    useStore.getState().setInsightsRefreshed();
  },

  // Time Machine
  timeMachineGenerated: (payload) => {
    if (payload?.error) {
      useStore.getState().setTMError(payload.error);
      useStore.getState().setTMPrompt(null);
    } else {
      useStore.getState().setTMError(null);
      useStore.getState().setTMPrompt(payload?.prompt || null);
    }
    useStore.getState().setTMLoading(false);
  },
  timelineRange: (payload) => {
    if (payload?.firstCycleIso) useStore.getState().setMinDate(payload.firstCycleIso);
    if (payload?.lastCycleIso) useStore.getState().setMaxDate(payload.lastCycleIso);
  },

  // Onboarding
  onboardingHints: (payload) => {
    useStore.getState().setOnboardingHints(payload?.hints || []);
  },

  // Rebuild
  rebuildComplete: (payload) => {
    // Store rebuild result for UI feedback
    useStore.getState().setRebuildResult(payload);
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
