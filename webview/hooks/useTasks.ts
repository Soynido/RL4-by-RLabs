const getVsCodeApi = () => {
  if (window.vscode) return window.vscode;
  if (window.acquireVsCodeApi) {
    window.vscode = window.acquireVsCodeApi();
    return window.vscode;
  }
  return { postMessage: (msg: any) => console.log('[mock postMessage]', msg) };
};

const vscode = getVsCodeApi();

export function useTasks() {
  const addTask = async (title: string) => {
    try {
      vscode.postMessage({ type: 'rl4:addLocalTask', payload: { task: title } });
    } catch (error) {
      console.warn('[useTasks] Failed to add task:', error);
    }
  };

  const toggleTask = async (id: string, _completed: boolean) => {
    try {
      vscode.postMessage({ type: 'rl4:toggleLocalTask', payload: { id } });
    } catch (error) {
      console.warn('[useTasks] Failed to toggle task:', error);
    }
  };

  return {
    addTask,
    toggleTask,
  };
}

