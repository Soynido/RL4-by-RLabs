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
  const tmStartDate = useStore((s) => s.tmStartDate);
  const tmEndDate = useStore((s) => s.tmEndDate);
  const tmLoading = useStore((s) => s.tmLoading);
  const setTMLoading = useStore((s) => s.setTMLoading);
  const setTMStartDate = useStore((s) => s.setTMStartDate);
  const setTMEndDate = useStore((s) => s.setTMEndDate);

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

