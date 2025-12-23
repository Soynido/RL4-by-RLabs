import React from 'react';
import { useStore } from '../../state/store';
import { Card } from '../ui/Card';

export const AutoTasksBadge: React.FC = () => {
  const autoTasksCount = useStore((s) => s.autoTasksCount);

  if (autoTasksCount === 0) {
    return null;
  }

  return (
    <Card className="auto-tasks-badge" highlight="cyan">
      <div className="badge-content">
        <span className="badge-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="badge-icon-svg">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        </span>
        <span className="badge-text">
          {autoTasksCount} auto-task{autoTasksCount !== 1 ? 's' : ''} detected
        </span>
      </div>
    </Card>
  );
};

