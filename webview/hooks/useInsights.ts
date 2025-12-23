const getVsCodeApi = () => {
  if (window.vscode) return window.vscode;
  if (window.acquireVsCodeApi) {
    window.vscode = window.acquireVsCodeApi();
    return window.vscode;
  }
  return { postMessage: (msg: any) => console.log('[mock postMessage]', msg) };
};

const vscode = getVsCodeApi();

export function useInsights() {
  const refreshInsights = async () => {
    try {
      vscode.postMessage({ type: 'rl4:getInsights', payload: {} });
    } catch (error) {
      console.warn('[useInsights] Failed to refresh insights:', error);
    }
  };

  return {
    refreshInsights,
  };
}

