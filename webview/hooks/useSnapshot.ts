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

export function useSnapshot() {
  const prompt = useStore((s) => s.snapshotPrompt);
  const loading = useStore((s) => s.loading);
  const lastSnapshotIso = useStore((s) => s.lastSnapshotIso);
  const filesChanged = useStore((s) => s.filesChanged);
  const success = useStore((s) => s.success);
  const setSnapshotLoading = useStore((s) => s.setSnapshotLoading);

  const generateSnapshot = (mode: string) => {
    setSnapshotLoading(true);
    vscode.postMessage({ type: 'rl4:generateSnapshot', payload: { mode } });
  };

  return {
    generateSnapshot,
  };
}

