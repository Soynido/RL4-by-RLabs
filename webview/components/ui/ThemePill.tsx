import React from 'react';
import { useStore } from '../../state/store';

const getVsCodeApi = () => {
  if (window.vscode) return window.vscode;
  if (window.acquireVsCodeApi) {
    window.vscode = window.acquireVsCodeApi();
    return window.vscode;
  }
  return { postMessage: (msg: any) => console.log('[mock postMessage]', msg) };
};

const vscode = getVsCodeApi();

export interface ThemePillProps {
  theme: 'ghost' | 'mint' | 'uv';
  label: string;
  icon: React.ReactNode;
}

export const ThemePill: React.FC<ThemePillProps> = ({ theme, label, icon }) => {
  const currentTheme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  // #region agent log
  React.useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/09f2ae51-802d-4435-8f6e-9f9d34ac2bd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ThemePill.tsx:render',message:'ThemePill rendered',data:{theme,currentTheme,hasVscode:!!window.vscode},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  }, [theme, currentTheme]);
  // #endregion

  const handleClick = () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/09f2ae51-802d-4435-8f6e-9f9d34ac2bd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ThemePill.tsx:handleClick',message:'ThemePill clicked',data:{theme,currentTheme,hasVscode:!!window.vscode},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    try {
      // Remove local setTheme - let IPC response handle it to avoid double update
      if (window.vscode && window.vscode.postMessage) {
        vscode.postMessage({ type: 'rl4:setTheme', payload: { theme } });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/09f2ae51-802d-4435-8f6e-9f9d34ac2bd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ThemePill.tsx:handleClick',message:'vscode.postMessage called',data:{theme},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
      } else {
        // Fallback: update locally if vscode API not available
        setTheme(theme);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/09f2ae51-802d-4435-8f6e-9f9d34ac2bd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ThemePill.tsx:handleClick',message:'vscode.postMessage not available, using local setTheme',data:{hasVscode:!!window.vscode},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
      }
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/09f2ae51-802d-4435-8f6e-9f9d34ac2bd6',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ThemePill.tsx:handleClick',message:'handleClick error',data:{error:String(err)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
    }
  };

  return (
    <button
      type="button"
      className={`theme-pill ${theme} ${currentTheme === theme ? 'active' : ''}`}
      onClick={handleClick}
    >
      {icon} {label}
    </button>
  );
};

