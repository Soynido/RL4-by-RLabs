import React from 'react';
import { useStore } from '../../state/store';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ModeSelector } from './ModeSelector';
import { useSnapshot } from '../../hooks/useSnapshot';

const getVsCodeApi = () => {
  if (window.vscode) return window.vscode;
  if (window.acquireVsCodeApi) {
    window.vscode = window.acquireVsCodeApi();
    return window.vscode;
  }
  return { postMessage: (msg: any) => console.log('[mock postMessage]', msg) };
};

const vscode = getVsCodeApi();

export const SnapshotSection: React.FC = () => {
  const mode = useStore((s) => s.mode);
  const loading = useStore((s) => s.loading);
  const lastSnapshotIso = useStore((s) => s.lastSnapshotIso);
  const filesChanged = useStore((s) => s.filesChanged);
  const { generateSnapshot } = useSnapshot();

  const handleModeChange = (newMode: string) => {
    vscode.postMessage({ type: 'rl4:setMode', payload: { mode: newMode } });
  };

  const handleGenerate = () => {
    generateSnapshot(mode);
  };

  return (
    <Card className="snapshot-section" padded>
      <div className="snapshot-header">
        <h2>Snapshot Engine</h2>
        <ModeSelector value={mode} onChange={handleModeChange} disabled={loading} />
      </div>
      <div className="snapshot-info">
        {lastSnapshotIso && (
          <p className="snapshot-meta">
            Last snapshot: {new Date(lastSnapshotIso).toLocaleString()}
          </p>
        )}
        {filesChanged !== undefined && filesChanged > 0 && (
          <p className="snapshot-meta">
            {filesChanged} file{filesChanged !== 1 ? 's' : ''} changed since last snapshot
          </p>
        )}
      </div>
      <Button
        variant="primary"
        block
        onClick={handleGenerate}
        disabled={loading}
      >
        {loading ? 'Generating...' : 'Generate Snapshot'}
      </Button>
    </Card>
  );
};

