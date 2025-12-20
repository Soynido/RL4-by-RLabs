/**
 * Minimal IPC wrapper used by the WebView to standardize messages sent to the
 * extension host. This is a lightweight façade; the actual routing is handled
 * by the extension side.
 */
export class KernelAPIWrapper {
  send(type: string, payload?: any) {
    window?.vscode?.postMessage({ type, payload });
  }

  generateSnapshot(mode: string) {
    this.send('rl4:generateSnapshot', { mode });
  }

  setMode(mode: string) {
    this.send('rl4:setMode', { mode });
  }

  getWorkspaceState() {
    this.send('rl4:getWorkspaceState');
  }

  getLocalTasks() {
    this.send('rl4:getLocalTasks');
  }

  addLocalTask(task: any) {
    this.send('rl4:addLocalTask', { task });
  }

  toggleLocalTask(id: string) {
    this.send('rl4:toggleLocalTask', { id });
  }

  getInsights() {
    this.send('rl4:getInsights');
  }

  buildTimeMachine(startIso: string, endIso: string) {
    this.send('rl4:buildTimeMachine', { startIso, endIso });
  }
}

