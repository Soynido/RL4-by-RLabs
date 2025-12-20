import React from 'react';
import { Task } from '../../state/types';
import { Button } from '../ui/Button';

export interface TaskItemProps extends Task {
  onToggle?: (id: string, completed: boolean) => void;
  onDelete?: (id: string) => void;
  onPromote?: (id: string) => void;
  onOpenCanon?: (id: string) => void;
}

export const TaskItem: React.FC<TaskItemProps> = ({
  id,
  title,
  completed,
  priority,
  onToggle,
  onDelete,
  onPromote,
  onOpenCanon,
}) => {
  return (
    <div className={`task-item ${completed ? 'completed' : ''} priority-${priority}`}>
      <div className="task-checkbox">
        <input
          type="checkbox"
          checked={completed}
          onChange={(e) => onToggle?.(id, e.target.checked)}
        />
      </div>
      <div className="task-content">
        <span className="task-title">{title}</span>
        <span className={`task-priority priority-${priority}`}>{priority}</span>
      </div>
      <div className="task-actions">
        {onPromote && (
          <Button variant="ghost" size="sm" onClick={() => onPromote(id)}>
            Promote
          </Button>
        )}
        {onOpenCanon && (
          <Button variant="ghost" size="sm" onClick={() => onOpenCanon(id)}>
            Open
          </Button>
        )}
        {onDelete && (
          <Button variant="ghost" size="sm" onClick={() => onDelete(id)}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
};

