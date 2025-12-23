import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { KernelAPI } from './kernel/KernelAPI';

/**
 * RL4WebViewManager - Manages the RL4 Dashboard WebView panel
 * Handles message routing between WebView and Kernel via KernelAPI
 */
export class RL4WebViewManager {
  private panel: vscode.WebviewPanel | null = null;
  private kernelAPI: KernelAPI;

  constructor(
    private readonly context: vscode.ExtensionContext,
    kernelAPI: KernelAPI
  ) {
    this.kernelAPI = kernelAPI;
  }

  public show() {
    console.warn('🚨 RL4WebViewManager.show() called!!!');
    console.warn('🚨 Timestamp:', new Date().toISOString());

    // Close any existing RL4 webview panels
    const tabs = vscode.window.tabGroups.all.flatMap(g => g.tabs);
    const rl4Tabs = tabs.filter(tab =>
      tab.input instanceof vscode.TabInputWebview &&
      tab.input.viewType === 'rl4Dashboard'
    );
    for (const tab of rl4Tabs) {
      vscode.window.tabGroups.close(tab);
    }

    if (this.panel) {
      console.warn('🚨 Existing panel found, revealing...');
      this.panel.reveal(vscode.ViewColumn.Active);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'rl4Dashboard',
      'RL4 Dashboard',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, 'out', 'webview')),
        ],
      }
    );

    // Generate HTML with proper CSP and script loading
    const webviewJsPath = path.join(this.context.extensionPath, 'out', 'webview', 'webview.js');
    const webviewUri = this.panel.webview.asWebviewUri(
      vscode.Uri.file(webviewJsPath)
    );

    // Generate unique build ID for cache busting
    const buildId = Date.now().toString();

    // Read extension version from package.json
    let rl4Version = '0.1.0';
    try {
      const pkgPath = path.join(this.context.extensionPath, 'package.json');
      const pkgContent = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);
      rl4Version = pkg?.version ?? '0.1.0';
    } catch (e) {
      console.error('[RL4WebViewManager] Failed to read version:', e);
    }

    console.log(`[RL4WebViewManager] SHOW CALLED - Creating webview...`);
    console.log(`[RL4WebViewManager] JS file exists: ${fs.existsSync(webviewJsPath)} at ${webviewJsPath}`);
    console.log(`[RL4WebViewManager] Webview URI: ${webviewUri.toString()}`);

    // Generate HTML that loads webview.js with proper CSP
    const cspSource = this.panel.webview.cspSource;
    const fontCdn = 'https://cdn.jsdelivr.net';
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${cspSource} 'unsafe-inline' 'unsafe-eval'; style-src ${cspSource} 'unsafe-inline' ${fontCdn}; font-src ${cspSource} ${fontCdn};">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
  <meta http-equiv="Expires" content="0" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1.2.0/dist/fonts/geist-sans/style.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1.2.0/dist/fonts/geist-mono/style.min.css">
  <title>RL4 Dashboard</title>
  <style>
    body {
      margin: 0;
      padding: 40px 20px;
      font-family: var(--font-sans, 'Geist', 'Inter', system-ui, sans-serif);
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      overflow: hidden;
    }
    #root {
      width: 100%;
      height: 100vh;
      overflow: auto;
    }
    /* Fallback loading screen */
    .rl4-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      flex-direction: column;
      gap: 20px;
    }
    .rl4-loading-spinner {
      width: 40px;
      height: 40px;
      border: 4px solid rgba(255, 255, 255, 0.1);
      border-top-color: var(--vscode-textLink-foreground, #007acc);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div id="root">
    <div class="rl4-loading">
      <div class="rl4-loading-spinner"></div>
      <p>Booting RL4...</p>
    </div>
  </div>
  <script>
    console.log("[RL4 WebView] Initializing...");
    if (typeof acquireVsCodeApi === 'function') {
      window.vscode = acquireVsCodeApi();
      console.log("[RL4 WebView] ✅ VS Code API acquired");
    } else {
      window.vscode = { postMessage: (msg) => console.log('[mock]', msg) };
    }
  </script>
  <script src="${webviewUri}" defer></script>
</body>
</html>`;

    console.log(`[RL4WebViewManager] Setting HTML to webview panel...`);
    this.panel.webview.html = html;
    console.log(`[RL4WebViewManager] HTML SET SUCCESSFULLY - Version ${rl4Version}`);

    // Handle messages from WebView
    this.panel.webview.onDidReceiveMessage(async (message) => {
      const { type, payload, queryId } = message;

      try {
        let response: any;
        let responseType: string;

        switch (type) {
          case 'rl4:getWorkspaceState':
            response = await this.kernelAPI.getWorkspaceState();
            responseType = 'workspaceState';
            break;
          case 'rl4:getMode':
            const mode = await this.kernelAPI.getMode();
            response = { mode };
            responseType = 'modeChanged';
            break;
          case 'rl4:setMode':
            await this.kernelAPI.setMode(payload.mode);
            response = { mode: payload.mode };
            responseType = 'modeChanged';
            break;
          case 'rl4:generateSnapshot':
            response = await this.kernelAPI.generateSnapshot(payload.mode || 'flexible');
            responseType = 'snapshotGenerated';
            break;
          case 'rl4:getAutoTasksCount':
            const count = await this.kernelAPI.getAutoTasksCount();
            response = { count };
            responseType = 'autoTasksCount';
            break;
          case 'rl4:getLocalTasks':
            const tasks = await this.kernelAPI.getLocalTasks();
            response = { tasks };
            responseType = 'localTasks';
            break;
          case 'rl4:addLocalTask':
            // KernelAPI.addLocalTask expects a string (task title)
            const taskTitle = typeof payload.task === 'string' ? payload.task : payload.task?.title || '';
            await this.kernelAPI.addLocalTask(taskTitle);
            // Refresh tasks after adding
            const updatedTasks = await this.kernelAPI.getLocalTasks();
            response = { tasks: updatedTasks };
            responseType = 'localTasks';
            break;
          case 'rl4:toggleLocalTask':
            await this.kernelAPI.toggleLocalTask(payload.id);
            // Refresh tasks after toggling
            const toggledTasks = await this.kernelAPI.getLocalTasks();
            response = { tasks: toggledTasks };
            responseType = 'localTasks';
            break;
          case 'rl4:getCapturedSession':
            const items = await this.kernelAPI.getCapturedSession();
            response = { items };
            responseType = 'capturedSession';
            break;
          case 'rl4:promoteToRL4':
            await this.kernelAPI.promoteToRL4();
            // Refresh captured session after promotion
            const promotedItems = await this.kernelAPI.getCapturedSession();
            response = { items: promotedItems };
            responseType = 'capturedSession';
            break;
          case 'rl4:getRL4Tasks':
            const rl4Tasks = await this.kernelAPI.getRL4Tasks(payload.filter);
            response = { tasks: rl4Tasks };
            responseType = 'rl4Tasks';
            break;
          case 'rl4:getInsights':
            response = {
              repoDelta: await this.kernelAPI.getRepoDelta(),
              planDrift: await this.kernelAPI.getPlanDrift(),
              blindspots: await this.kernelAPI.getBlindspots(),
              phase: await this.kernelAPI.getCurrentPhase(),
            };
            responseType = 'insightsPayload';
            break;
          case 'rl4:buildTimeMachine':
            response = await this.kernelAPI.buildTimeMachinePrompt(payload.startIso, payload.endIso);
            responseType = 'timeMachineGenerated';
            break;
          case 'rl4:getTimelineRange':
            response = await this.kernelAPI.getTimelineRange();
            responseType = 'timelineRange';
            break;
          case 'rl4:markOnboardingComplete':
            await this.kernelAPI.markOnboardingComplete(payload.mode);
            response = {};
            responseType = 'onboardingMarked';
            break;
          case 'rl4:resetCodec':
            response = await this.kernelAPI.resetCodec();
            responseType = 'kernelStatus';
            break;
          case 'rl4:exportLogs':
            response = await this.kernelAPI.exportLogs();
            responseType = 'kernelStatus';
            break;
          case 'rl4:status':
            response = await this.kernelAPI.status();
            responseType = 'kernelStatus';
            break;
          default:
            console.warn(`[RL4WebViewManager] Unknown message type: ${type}`);
            return;
        }

        // Send response back to WebView
        this.panel?.webview.postMessage({
          type: responseType,
          payload: response,
          queryId,
        });
      } catch (error: any) {
        // Send error back to WebView
        this.panel?.webview.postMessage({
          type: 'kernelError',
          payload: {
            message: error.message || 'Unknown error',
            stack: error.stack,
          },
          queryId,
        });
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = null;
    });
  }

  public dispose() {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
  }
}

