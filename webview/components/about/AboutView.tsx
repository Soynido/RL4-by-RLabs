import React from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { SupportCard } from './SupportCard';
import { FAQCard } from './FAQCard';

const getVsCodeApi = () => {
  if (window.vscode) return window.vscode;
  if (window.acquireVsCodeApi) {
    window.vscode = window.acquireVsCodeApi();
    return window.vscode;
  }
  return { postMessage: (msg: any) => console.log('[mock postMessage]', msg) };
};

const vscode = getVsCodeApi();

export const AboutView: React.FC = () => {
  const handleRepair = () => {
    vscode.postMessage({ type: 'rl4:resetCodec' });
  };

  const handleExportLogs = () => {
    vscode.postMessage({ type: 'rl4:exportLogs' });
  };

  return (
    <div className="about-view">
      <Card className="about-main" padded>
        <h2>RL4 — Dev Continuity System</h2>
        <p>Version 0.1.0</p>
        <p>Single Context Snapshot. Zero Confusion. Full Feedback Loop.</p>
        <div className="about-actions">
          <Button variant="primary" onClick={handleRepair}>
            Repair Kernel
          </Button>
          <Button variant="secondary" onClick={handleExportLogs}>
            Export Logs
          </Button>
        </div>
      </Card>
      <SupportCard />
      <FAQCard />
    </div>
  );
};

