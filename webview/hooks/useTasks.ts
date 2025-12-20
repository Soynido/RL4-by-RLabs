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

export function useTasks() {
  const addTask = (title: string) => {
    // KernelAPI.addLocalTask expects a string, not an object
    vscode.postMessage({
      type: 'rl4:addLocalTask',
      payload: { task: title },
    });
  };

  const toggleTask = (id: string, _completed: boolean) => {
    // KernelAPI.toggleLocalTask only needs the id
    vscode.postMessage({
      type: 'rl4:toggleLocalTask',
      payload: { id },
    });
  };

  return {
    addTask,
    toggleTask,
  };
}

