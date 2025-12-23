import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/animations.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/components-extended.css';

// Get VS Code API
declare global {
  interface Window {
    vscode?: {
      postMessage: (message: any) => void;
    };
    acquireVsCodeApi?: () => {
      postMessage: (message: any) => void;
    };
    __RL4_VERSION?: string;
    __RL4_BUILD_ID?: string;
  }
}

// Log RL4 version info if available
if (window.__RL4_VERSION) {
  console.log(`[RL4 Frontend] Loading version ${window.__RL4_VERSION} (build ${window.__RL4_BUILD_ID})`);
}

// Get VS Code API
const getVsCodeApi = () => {
  if (window.vscode) return window.vscode;
  if (window.acquireVsCodeApi) {
    window.vscode = window.acquireVsCodeApi();
    return window.vscode;
  }
  return { postMessage: (msg: any) => console.log('[mock postMessage]', msg) };
};

// Initialize VS Code API
getVsCodeApi();

// Render React app
const root = document.getElementById('root');
if (root) {
  try {
    ReactDOM.createRoot(root).render(<App />);
    console.log('[RL4 Frontend] React app mounted successfully');
  } catch (error: any) {
    console.error('[RL4 Frontend] Failed to mount React app:', error);
    root.innerHTML = `
      <div style="padding: 20px; color: #ff6b6b; font-family: monospace;">
        <h2>❌ React Mount Error</h2>
        <p>Failed to render RL4 app:</p>
        <pre>${error}</pre>
      </div>
    `;
  }
} else {
  console.error('[RL4 Frontend] Root element not found');
}

