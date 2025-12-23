import { StoreState, TimeMachineSlice } from '../types';

type SetState = (partial: Partial<StoreState>) => void;
type GetState = () => StoreState;

export function createTimeMachineSlice(set: SetState, _get: GetState): TimeMachineSlice {
  const todayIso = new Date().toISOString().split('T')[0];
  return {
    startDate: '',
    endDate: '',
    minDate: null,
    maxDate: todayIso,
    loading: false,
    timeMachinePrompt: null,
    error: null,
    setStartDate: (v: string) => set({ startDate: v }),
    setEndDate: (v: string) => set({ endDate: v }),
    setMinDate: (v: string | null) => set({ minDate: v }),
    setMaxDate: (v: string) => set({ maxDate: v }),
    setTMLoading: (v: boolean) => set({ loading: v }),
    setTMPrompt: (p: string | null) => set({ timeMachinePrompt: p }),
    setTMError: (e: string | null) => set({ error: e }),
  };
}

