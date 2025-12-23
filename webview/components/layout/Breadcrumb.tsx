import React from 'react';

type TabId = 'control' | 'dev' | 'timemachine' | 'insights' | 'about' | 'rebuild';

export interface BreadcrumbProps {
  activeTab: TabId;
}

const breadcrumbs: Record<TabId, string> = {
  control: 'WORK → SNAPSHOT → PR → REPEAT',
  dev: 'TASKS → CAPTURE → PROMOTE',
  timemachine: 'REPLAY → DIAGNOSE → ALIGN',
  insights: 'SIGNALS → RISKS → DECISIONS',
  about: 'SUPPORT → FIX → GO',
  rebuild: 'REBUILD → RESTORE → CONTINUE',
};

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ activeTab }) => {
  return <div className="breadcrumb">{breadcrumbs[activeTab]}</div>;
};

