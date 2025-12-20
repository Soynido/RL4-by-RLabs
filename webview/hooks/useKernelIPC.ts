import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../state/store';

const IPC_TIMEOUT_MS = 10_000;

type Pending = {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timer: any;
};

export function useKernelIPC() {
  const pendingQueries = useRef<Map<string, Pending>>(new Map());

  const query = useCallback(async <T>(type: string, payload?: any): Promise<T> => {
    const queryId = `${type}-${Date.now()}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingQueries.current.delete(queryId);
        reject(new Error(`IPC timeout: ${type}`));
        useStore.getState().setSafeMode(true);
        useStore.getState().setSafeModeReason(`Kernel not responding (${type})`);
      }, IPC_TIMEOUT_MS);

      pendingQueries.current.set(queryId, { resolve, reject, timer });
      window?.vscode?.postMessage({ type: `rl4:${type}`, payload, queryId });
    });
  }, []);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const { queryId, data, error } = (event.data || {}) as any;
      const pending = queryId ? pendingQueries.current.get(queryId) : null;
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

