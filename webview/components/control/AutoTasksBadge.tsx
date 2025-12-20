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
        <span className="badge-icon">⚡</span>
        <span className="badge-text">
          {autoTasksCount} auto-task{autoTasksCount !== 1 ? 's' : ''} detected
        </span>
      </div>
    </Card>
  );
};

