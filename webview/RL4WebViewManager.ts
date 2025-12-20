import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { KernelAPI } from '../kernel/KernelAPI';

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
    if (this.panel) {
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

    // Load HTML from out/webview (built location)
    let htmlPath = path.join(this.context.extensionPath, 'out', 'webview', 'index.html');
    if (!fs.existsSync(htmlPath)) {
      // Fallback to source location for development
      htmlPath = path.join(this.context.extensionPath, 'webview', 'index.html');
      if (!fs.existsSync(htmlPath)) {
        this.panel.webview.html = '<html><body><h1>Error: index.html not found</h1><p>Please rebuild the extension.</p></body></html>';
        return;
      }
    }
    
    let html = fs.readFileSync(htmlPath, 'utf-8');

    // Replace script src with webview URI
    const webviewJsPath = path.join(this.context.extensionPath, 'out', 'webview', 'webview.js');
    const webviewUri = this.panel.webview.asWebviewUri(
      vscode.Uri.file(webviewJsPath)
    );
    
    // Debug: log paths
    console.log(`[RL4WebViewManager] HTML path: ${htmlPath}`);
    console.log(`[RL4WebViewManager] Webview JS path: ${webviewJsPath}`);
    console.log(`[RL4WebViewManager] Webview URI: ${webviewUri.toString()}`);
    console.log(`[RL4WebViewManager] File exists: ${fs.existsSync(webviewJsPath)}`);
    
    html = html.replace('./webview.js', webviewUri.toString());

    this.panel.webview.html = html;

    // Handle messages from WebView
    this.panel.webview.onDidReceiveMessage(async (message) => {
      const { type, payload, queryId } = message;

      try {
        let response: any;

        switch (type) {
          case 'rl4:getWorkspaceState':
            response = await this.kernelAPI.getWorkspaceState();
            break;
          case 'rl4:getMode':
            response = await this.kernelAPI.getMode();
            break;
          case 'rl4:setMode':
            response = await this.kernelAPI.setMode(payload.mode);
            break;
          case 'rl4:generateSnapshot':
            response = await this.kernelAPI.generateSnapshot(payload.mode || 'flexible');
            break;
          case 'rl4:getAutoTasksCount':
            response = await this.kernelAPI.getAutoTasksCount();
            break;
          case 'rl4:getLocalTasks':
            response = await this.kernelAPI.getLocalTasks();
            break;
          case 'rl4:addLocalTask':
            // KernelAPI.addLocalTask expects a string (task title)
            const taskTitle = typeof payload.task === 'string' ? payload.task : payload.task?.title || '';
            response = await this.kernelAPI.addLocalTask(taskTitle);
            break;
          case 'rl4:toggleLocalTask':
            response = await this.kernelAPI.toggleLocalTask(payload.id);
            break;
          case 'rl4:getCapturedSession':
            response = await this.kernelAPI.getCapturedSession();
            break;
          case 'rl4:promoteToRL4':
            response = await this.kernelAPI.promoteToRL4();
            break;
          case 'rl4:getRL4Tasks':
            response = await this.kernelAPI.getRL4Tasks(payload.filter);
            break;
          case 'rl4:getInsights':
            response = {
              repoDelta: await this.kernelAPI.getRepoDelta(),
              planDrift: await this.kernelAPI.getPlanDrift(),
              blindspots: await this.kernelAPI.getBlindspots(),
              phase: await this.kernelAPI.getCurrentPhase(),
            };
            break;
          case 'rl4:buildTimeMachine':
            response = await this.kernelAPI.buildTimeMachinePrompt(payload.startIso, payload.endIso);
            break;
          case 'rl4:getTimelineRange':
            response = await this.kernelAPI.getTimelineRange();
            break;
          case 'rl4:markOnboardingComplete':
            response = await this.kernelAPI.markOnboardingComplete(payload.mode);
            break;
          case 'rl4:resetCodec':
            response = await this.kernelAPI.resetCodec();
            break;
          case 'rl4:exportLogs':
            response = await this.kernelAPI.exportLogs();
            break;
          case 'rl4:status':
            response = await this.kernelAPI.status();
            break;
          default:
            console.warn(`[RL4WebViewManager] Unknown message type: ${type}`);
            return;
        }

        // Send response back to WebView
        this.panel?.webview.postMessage({
          type: type.replace('rl4:', ''),
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
