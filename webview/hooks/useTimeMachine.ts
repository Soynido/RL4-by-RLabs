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

export function useTimeMachine() {
  const startDate = useStore((s) => s.startDate);
  const endDate = useStore((s) => s.endDate);
  const loading = useStore((s) => s.loading);
  const setTMLoading = useStore((s) => s.setTMLoading);
  const setStartDate = useStore((s) => s.setStartDate);
  const setEndDate = useStore((s) => s.setEndDate);

  const buildPrompt = (start: string, end: string) => {
    setTMLoading(true);
    vscode.postMessage({
      type: 'rl4:buildTimeMachine',
      payload: { startIso: start, endIso: end },
    });
  };

  const loadTimelineRange = () => {
    vscode.postMessage({ type: 'rl4:getTimelineRange' });
  };

  return {
    buildPrompt,
    loadTimelineRange,
  };
}

