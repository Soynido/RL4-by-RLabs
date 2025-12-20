import { CapturedItem, DevSlice, StoreState, Task } from '../types';

type SetState = (partial: Partial<StoreState>) => void;
type GetState = () => StoreState;

export function createDevSlice(set: SetState, _get: GetState): DevSlice {
  return {
    localTasks: [],
    capturedItems: [],
    rl4Tasks: [],
    taskFilter: 'all',
    autoTasksCount: 0,
    setLocalTasks: (tasks: Task[]) => set({ localTasks: tasks }),
    setCapturedItems: (items: CapturedItem[]) => set({ capturedItems: items }),
    setRL4Tasks: (tasks: Task[]) => set({ rl4Tasks: tasks }),
    setTaskFilter: (filter) => set({ taskFilter: filter }),
    setAutoTasksCount: (count) => set({ autoTasksCount: count }),
  };
}

