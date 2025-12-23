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

  // Helper function to refresh data with error handling
  const refreshData = (dataType: string) => {
    try {
      const messageType = `rl4:${dataType}`;
      vscode.postMessage({ type: messageType, payload: {} });
    } catch (error) {
      console.warn(`[AutoRefresh] Failed to refresh ${dataType}:`, error);
    }
  };

  useEffect(() => {
    timersRef.current.autoTasks = setInterval(() => {
      refreshData('getAutoTasksCount');
    }, REFRESH_INTERVALS.autoTasksCount);

    timersRef.current.insights = setInterval(() => {
      refreshData('getInsights');
    }, REFRESH_INTERVALS.insights);

    const unsubSnapshot = eventBus.on('snapshot:complete', () => {
      // Refresh all relevant data after snapshot
      refreshData('getInsights');
      refreshData('getLocalTasks');
      refreshData('getAutoTasksCount');
    });

    return () => {
      Object.values(timersRef.current).forEach(clearInterval);
      unsubSnapshot();
    };
  }, []);
}

