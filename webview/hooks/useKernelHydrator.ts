import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';

const getVsCodeApi = () => {
  if (window.vscode) return window.vscode;
  if (window.acquireVsCodeApi) {
    window.vscode = window.acquireVsCodeApi();
    return window.vscode;
  }
  return { postMessage: (msg: any) => console.log('[mock postMessage]', msg) };
};

const vscode = getVsCodeApi();

export function useKernelHydrator() {
  const hydrated = useRef(false);
  const setBootPhase = useStore((s) => s.setBootPhase);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    const hydrate = async () => {
      try {
        setBootPhase('detecting');
        vscode.postMessage({ type: 'rl4:getWorkspaceState' });

        setBootPhase('hydrating');
        const calls = [
          'getMode',
          'getInsights',
          'getLocalTasks',
          'getCapturedSession',
          'getAutoTasksCount',
          'status',
        ];
        calls.forEach((c) => vscode.postMessage({ type: `rl4:${c}` }));
      } catch (err) {
        console.error('[Hydrator] Failed:', err);
        setBootPhase('error');
      }
    };

    hydrate();
  }, [setBootPhase]);
}

