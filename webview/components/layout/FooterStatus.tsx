import React from 'react';
import { useStore } from '../../state/store';

export const FooterStatus: React.FC = () => {
  const safeMode = useStore((s) => s.safeMode);
  const safeModeReason = useStore((s) => s.safeModeReason);

  if (safeMode) {
    return (
      <div className="footer-status footer-status--warning">
        <div className="footer-status__badge">
          <svg className="footer-status__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="footer-status__text">Safe Mode</span>
        </div>
        {safeModeReason && (
          <span className="footer-status__reason">{safeModeReason}</span>
        )}
      </div>
    );
  }

  return (
    <div className="footer-status footer-status--success">
      <svg className="footer-status__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
        <path d="M20 6L9 17l-5-5" />
      </svg>
      <span className="footer-status__text">RL4 Ready</span>
    </div>
  );
};

