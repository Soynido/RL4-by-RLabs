import React from 'react';
import { Tab } from '../ui/Tab';

type TabId = 'control' | 'dev' | 'timemachine' | 'insights' | 'about';

export interface TabNavProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  {
    id: 'control',
    label: 'Control',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5" />
      </svg>
    ),
  },
  {
    id: 'dev',
    label: 'Dev',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </svg>
    ),
  },
  {
    id: 'timemachine',
    label: '🚀 Time Machine',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12,6 12,12 16,14" />
      </svg>
    ),
  },
  {
    id: 'insights',
    label: 'Insights',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    id: 'about',
    label: 'About',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
];

export const TabNav: React.FC<TabNavProps> = ({ active, onChange }) => {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <Tab key={tab.id} active={active === tab.id} onClick={() => onChange(tab.id)} icon={tab.icon}>
          {tab.label}
        </Tab>
      ))}
    </div>
  );
};

