import React from 'react';
import { ThemePill } from '../ui/ThemePill';

export const Header: React.FC = () => {
  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="logo-icon" width="24" height="24">
            <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div className="header-title">
          <h1>RL4 — Dev Continuity System</h1>
          <p>Single Context Snapshot. Zero Confusion. Full Feedback Loop.</p>
        </div>
      </div>
      <div className="theme-pills">
        <ThemePill theme="ghost" label="Ghost" icon={
          <svg viewBox="0 0 24 24" fill="currentColor" className="theme-icon" width="16" height="16">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
          </svg>
        } />
        <ThemePill theme="mint" label="Mint" icon={
          <svg viewBox="0 0 24 24" fill="currentColor" className="theme-icon" width="16" height="16">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
        } />
        <ThemePill theme="uv" label="UV" icon={
          <svg viewBox="0 0 24 24" fill="currentColor" className="theme-icon" width="16" height="16">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
          </svg>
        } />
      </div>
    </header>
  );
};

