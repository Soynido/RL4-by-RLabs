import React from 'react';

export interface TabProps {
  children?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
}

export const Tab: React.FC<TabProps> = ({ children, active = false, onClick, icon }) => {
  return (
    <button
      type="button"
      className={`tab ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      {icon && <span className="tab-icon">{icon}</span>}
      {children}
    </button>
  );
};

