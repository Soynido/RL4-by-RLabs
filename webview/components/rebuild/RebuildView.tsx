import React, { useState } from 'react';
import { useStore } from '../../state/store';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

const getVsCodeApi = () => {
  if (window.vscode) return window.vscode;
  if (window.acquireVsCodeApi) {
    window.vscode = window.acquireVsCodeApi();
    return window.vscode;
  }
  return { postMessage: (msg: any) => console.log('[mock postMessage]', msg) };
};

const vscode = getVsCodeApi();

export const RebuildView: React.FC = () => {
  const rebuildResult = useStore((s) => s.rebuildResult);
  const [loading, setLoading] = useState(false);

  const handleRebuild = async () => {
    setLoading(true);
    vscode.postMessage({ type: 'rl4:rebuildCache' });
    // Result will be set via messageRouter
    setTimeout(() => setLoading(false), 2000);
  };

  return (
    <div className="rebuild-view">
      <Card padded highlight="cyan">
        <h2>Rebuild Cache Index</h2>
        <p>Rebuild the RL4 cache index from scratch. This is useful if the index is corrupted or missing.</p>
        <div style={{ marginTop: '24px' }}>
          <Button
            variant="primary"
            onClick={handleRebuild}
            disabled={loading}
            block
          >
            {loading ? 'Rebuilding...' : 'Rebuild Cache'}
          </Button>
        </div>
        {rebuildResult && (
          <div style={{ marginTop: '24px', padding: '16px', background: 'var(--bg-surface)', borderRadius: '8px' }}>
            {rebuildResult.success ? (
              <div>
                <p style={{ color: 'var(--text-primary)', margin: 0 }}>
                  ✅ Cache rebuilt successfully
                </p>
                {rebuildResult.cyclesIndexed !== undefined && (
                  <p style={{ color: 'var(--text-secondary)', margin: '8px 0 0 0', fontSize: '14px' }}>
                    {rebuildResult.cyclesIndexed} cycles indexed
                  </p>
                )}
              </div>
            ) : (
              <p style={{ color: 'var(--text-primary)', margin: 0 }}>
                ❌ Rebuild failed. Check the kernel logs for details.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};
