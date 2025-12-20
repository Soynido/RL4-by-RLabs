import { GovernanceMode, StoreState, WorkspaceSlice, WorkspaceStateFromKernel } from '../types';

type SetState = (partial: Partial<StoreState>) => void;
type GetState = () => StoreState;

export function createWorkspaceSlice(set: SetState, _get: GetState): WorkspaceSlice {
  return {
    workspace: null,
    mode: 'strict',
    onboardingComplete: false,
    onboardingStep: 0,
    setWorkspace: (ws: WorkspaceStateFromKernel | null) => set({ workspace: ws }),
    setMode: (mode: GovernanceMode) => set({ mode }),
    setOnboardingComplete: (complete: boolean) => set({ onboardingComplete: complete }),
    setOnboardingStep: (step: number) => set({ onboardingStep: step }),
  };
}

