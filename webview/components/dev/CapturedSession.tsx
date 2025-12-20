import React from 'react';
import { useStore } from '../../state/store';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { CapturedItem } from '../../state/types';

const getVsCodeApi = () => {
  if (window.vscode) return window.vscode;
  if (window.acquireVsCodeApi) {
    window.vscode = window.acquireVsCodeApi();
    return window.vscode;
  }
  return { postMessage: (msg: any) => console.log('[mock postMessage]', msg) };
};

const vscode = getVsCodeApi();

export const CapturedSession: React.FC = () => {
  const capturedItems = useStore((s) => s.capturedItems);

  const handlePromote = () => {
    vscode.postMessage({ type: 'rl4:promoteToRL4' });
  };

  return (
    <Card className="captured-session" padded>
      <div className="captured-header">
        <h2>Captured Session</h2>
        <Button variant="primary" size="sm" onClick={handlePromote} disabled={capturedItems.length === 0}>
          Promote to RL4
        </Button>
      </div>
      <div className="captured-list">
        {capturedItems.length === 0 ? (
          <p className="captured-empty">No items captured yet</p>
        ) : (
          capturedItems.map((item: CapturedItem, index: number) => (
            <div key={item.id || `item-${index}`} className="captured-item">
              <span className="captured-title">{item.title || item.description || 'Untitled'}</span>
              {item.description && <span className="captured-description">{item.description}</span>}
            </div>
          ))
        )}
      </div>
    </Card>
  );
};

