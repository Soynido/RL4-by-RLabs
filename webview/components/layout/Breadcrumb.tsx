import React from 'react';

type TabId = 'control' | 'dev' | 'timemachine' | 'insights' | 'about';

export interface BreadcrumbProps {
  activeTab: TabId;
}

const breadcrumbs: Record<TabId, string> = {
  control: 'WORK → SNAPSHOT → PR → REPEAT',
  dev: 'TASKS → CAPTURE → PROMOTE',
  timemachine: 'REPLAY → DIAGNOSE → ALIGN',
  insights: 'SIGNALS → RISKS → DECISIONS',
  about: 'SUPPORT → FIX → GO',
};

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ activeTab }) => {
  return <div className="breadcrumb">{breadcrumbs[activeTab]}</div>;
};

