import React from 'react';
import { useStore } from '../../state/store';

export const FooterStatus: React.FC = () => {
  const kernelReady = useStore((s) => s.kernelReady);
  const safeMode = useStore((s) => s.safeMode);

  if (safeMode) {
    return (
      <div className="footer-status">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>Safe Mode Active — Kernel repair required</span>
      </div>
    );
  }

  return (
    <div className="footer-status">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22,4 12,14.01 9,11.01" />
      </svg>
      <span>You're good to go — RL4 stays self-supported.</span>
    </div>
  );
};

