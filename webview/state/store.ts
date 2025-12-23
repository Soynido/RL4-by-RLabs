import { useState, useEffect, useRef } from 'react';
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

// Subscription system for reactivity
type Listener = () => void;
const listeners = new Set<Listener>();

const notifyListeners = () => {
  listeners.forEach((listener) => listener());
};

const setState = (partial: PartialState) => {
  const next = typeof partial === 'function' ? (partial as any)(state) : partial;
  Object.assign(state, next);
  notifyListeners();
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

// Reactive hook-compatible API
type Selector<T> = (state: StoreState) => T;

type UseStoreHook = {
  <T = StoreState>(selector?: Selector<T>): T;
  getState: () => StoreState;
  setState: (partial: PartialState) => void;
};

const useStoreImpl = <T = StoreState>(selector?: Selector<T>): T => {
  const [, forceUpdate] = useState({});
  const selectorRef = useRef(selector);
  const valueRef = useRef<T>(selector ? selector(state) : (state as any));

  selectorRef.current = selector;

  useEffect(() => {
    const listener = () => {
      const newValue = selectorRef.current ? selectorRef.current(state) : (state as any);
      if (newValue !== valueRef.current) {
        valueRef.current = newValue;
        forceUpdate({});
      }
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return valueRef.current;
};

// Attach getState and setState to useStore for backward compatibility
export const useStore = useStoreImpl as UseStoreHook;
(useStore as any).getState = getState;
(useStore as any).setState = setState;

