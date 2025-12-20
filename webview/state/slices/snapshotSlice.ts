import { SnapshotSlice, StoreState } from '../types';

type SetState = (partial: Partial<StoreState>) => void;
type GetState = () => StoreState;

export function createSnapshotSlice(set: SetState, _get: GetState): SnapshotSlice {
  return {
    loading: false,
    prompt: null,
    lastSnapshotIso: null,
    filesChanged: 0,
    success: false,
    setSnapshotLoading: (v: boolean) => set({ loading: v }),
    setSnapshotPrompt: (p: string | null) => set({ prompt: p }),
    setLastSnapshotIso: (iso: string | null) => set({ lastSnapshotIso: iso }),
    setFilesChanged: (n: number) => set({ filesChanged: n }),
    setSnapshotSuccess: (v: boolean) => set({ success: v }),
  };
}

