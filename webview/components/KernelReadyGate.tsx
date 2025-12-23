import React from 'react';
import { useStore } from '../state/store';
import { Button } from './ui/Button';

const BOOT_MESSAGES: Record<string, string> = {
  booting: 'Booting RL4...',
  detecting: 'Detecting workspace...',
  hydrating: 'Loading project state...',
  error: 'Kernel error. Click Repair.',
};

const getVsCodeApi = () => {
  if (window.vscode) return window.vscode;
  if (window.acquireVsCodeApi) {
    window.vscode = window.acquireVsCodeApi();
    return window.vscode;
  }
  return { postMessage: (msg: any) => console.log('[mock postMessage]', msg) };
};

const vscode = getVsCodeApi();

export interface KernelReadyGateProps {
  children: React.ReactNode;
}

export const KernelReadyGate: React.FC<KernelReadyGateProps> = ({ children }) => {
  const bootPhase = useStore((s) => s.bootPhase);
  const safeMode = useStore((s) => s.safeMode);
  const safeModeReason = useStore((s) => s.safeModeReason);

  // TEMPORARILY BYPASS GATE FOR TESTING
  console.log('[KernelReadyGate] Boot phase:', bootPhase, 'Safe mode:', safeMode);
  return <>{children}</>;

  if (bootPhase === 'ready' && !safeMode) {
    return <>{children}</>;
  }

  return (
    <div className="rl4-boot-gate">
      <div className="rl4-boot-spinner" />
      <p className="rl4-boot-message">
        {safeMode ? safeModeReason || 'Safe Mode Active' : BOOT_MESSAGES[bootPhase] || 'Initializing...'}
      </p>
      {(bootPhase === 'error' || safeMode) && (
        <Button
          variant="primary"
          onClick={() => vscode.postMessage({ type: 'rl4:resetCodec' })}
        >
          Repair Kernel
        </Button>
      )}
    </div>
  );
};

