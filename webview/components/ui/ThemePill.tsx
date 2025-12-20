import React from 'react';
import { useStore } from '../../state/store';

export interface ThemePillProps {
  theme: 'ghost' | 'mint' | 'uv';
  label: string;
  icon: string;
}

export const ThemePill: React.FC<ThemePillProps> = ({ theme, label, icon }) => {
  const currentTheme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  return (
    <button
      type="button"
      className={`theme-pill ${theme} ${currentTheme === theme ? 'active' : ''}`}
      onClick={() => setTheme(theme)}
    >
      {icon} {label}
    </button>
  );
};

