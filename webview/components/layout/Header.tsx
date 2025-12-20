import React from 'react';
import { ThemePill } from '../ui/ThemePill';

export const Header: React.FC = () => {
  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">🧠</div>
        <div className="header-title">
          <h1>RL4 — Dev Continuity System</h1>
          <p>Single Context Snapshot. Zero Confusion. Full Feedback Loop.</p>
        </div>
      </div>
      <div className="theme-pills">
        <ThemePill theme="ghost" label="Ghost" icon="👻" />
        <ThemePill theme="mint" label="Mint" icon="🌿" />
        <ThemePill theme="uv" label="UV" icon="🔮" />
      </div>
    </header>
  );
};

