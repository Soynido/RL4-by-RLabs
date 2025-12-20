import {
  StoreState,
} from './types';
import { createUISlice } from './slices/uiSlice';
import { createWorkspaceSlice } from './slices/workspaceSlice';
import { createDevSlice } from './slices/devSlice';
import { createInsightsSlice } from './slices/insightsSlice';
import { createTimeMachineSlice } from './slices/timeMachineSlice';
import { createSnapshotSlice } from './slices/snapshotSlice';

type PartialState = Partial<StoreState> | ((state: StoreState) => Partial<StoreState>);

const state: StoreState = {} as StoreState;

const setState = (partial: PartialState) => {
  const next = typeof partial === 'function' ? (partial as any)(state) : partial;
  Object.assign(state, next);
};

const getState = () => state;

// Initialize slices (order matters only for defaults)
Object.assign(
  state,
  createUISlice(setState, getState),
  createWorkspaceSlice(setState, getState),
  createDevSlice(setState, getState),
  createInsightsSlice(setState, getState),
  createTimeMachineSlice(setState, getState),
  createSnapshotSlice(setState, getState),
);

// Minimal hook-compatible API
type Selector<T> = (state: StoreState) => T;

export const useStore: any = Object.assign(
  (selector?: Selector<any>) => (selector ? selector(state) : state),
  {
    getState,
    setState,
  }
);

