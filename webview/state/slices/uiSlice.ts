import { StoreState, UISlice } from '../types';

type SetState = (partial: Partial<StoreState>) => void;
type GetState = () => StoreState;

export function createUISlice(set: SetState, _get: GetState): UISlice {
  return {
    activeTab: 'control',
    theme: 'ghost',
    kernelReady: false,
    bootPhase: 'booting',
    safeMode: false,
    safeModeReason: null,
    setActiveTab: (tab) => set({ activeTab: tab }),
    setTheme: (theme) => set({ theme }),
    setKernelReady: (ready) => set({ kernelReady: ready }),
    setBootPhase: (phase) => set({ bootPhase: phase }),
    setSafeMode: (safe) => set({ safeMode: safe }),
    setSafeModeReason: (reason) => set({ safeModeReason: reason }),
  };
}

