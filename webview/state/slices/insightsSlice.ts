import { Blindspots, InsightsSlice, PlanDrift, RepoDelta, StoreState } from '../types';

type SetState = (partial: Partial<StoreState>) => void;
type GetState = () => StoreState;

export function createInsightsSlice(set: SetState, _get: GetState): InsightsSlice {
  return {
    repoDelta: null,
    planDrift: null,
    blindspots: null,
    currentPhase: 'UNKNOWN',
    lastRefresh: 0,
    setRepoDelta: (delta: RepoDelta | null) => set({ repoDelta: delta }),
    setPlanDrift: (drift: PlanDrift | null) => set({ planDrift: drift }),
    setBlindspots: (b: Blindspots | null) => set({ blindspots: b }),
    setCurrentPhase: (phase: string) => set({ currentPhase: phase }),
    setInsightsRefreshed: () => set({ lastRefresh: Date.now() }),
  };
}

