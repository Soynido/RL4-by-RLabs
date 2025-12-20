import { useEffect, useRef } from 'react';
import { eventBus } from '../utils/eventBus';

const getVsCodeApi = () => {
  if (window.vscode) return window.vscode;
  if (window.acquireVsCodeApi) {
    window.vscode = window.acquireVsCodeApi();
    return window.vscode;
  }
  return { postMessage: (msg: any) => console.log('[mock postMessage]', msg) };
};

const vscode = getVsCodeApi();

const REFRESH_INTERVALS = {
  autoTasksCount: 30_000,
  insights: 60_000,
  tasks: 45_000,
};

export function useAutoRefresh() {
  const timersRef = useRef<Record<string, any>>({});

  useEffect(() => {
    timersRef.current.autoTasks = setInterval(() => {
      vscode.postMessage({ type: 'rl4:getAutoTasksCount' });
    }, REFRESH_INTERVALS.autoTasksCount);

    timersRef.current.insights = setInterval(() => {
      vscode.postMessage({ type: 'rl4:getInsights' });
    }, REFRESH_INTERVALS.insights);

    const unsubSnapshot = eventBus.on('snapshot:complete', () => {
      vscode.postMessage({ type: 'rl4:getInsights' });
      vscode.postMessage({ type: 'rl4:getLocalTasks' });
      vscode.postMessage({ type: 'rl4:getAutoTasksCount' });
    });

    return () => {
      Object.values(timersRef.current).forEach(clearInterval);
      unsubSnapshot();
    };
  }, []);
}

