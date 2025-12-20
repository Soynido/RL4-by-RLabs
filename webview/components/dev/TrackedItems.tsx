import React from 'react';
import { useStore } from '../../state/store';
import { Card } from '../ui/Card';
import { TaskItem } from './TaskItem';

export const TrackedItems: React.FC = () => {
  const rl4Tasks = useStore((s) => s.rl4Tasks);

  return (
    <Card className="tracked-items" padded>
      <div className="tracked-header">
        <h2>Tracked Items (RL4 Tasks)</h2>
      </div>
      <div className="tracked-list">
        {rl4Tasks.length === 0 ? (
          <p className="tracked-empty">No RL4 tasks tracked</p>
        ) : (
          rl4Tasks.map((task) => (
            <TaskItem key={task.id} {...task} />
          ))
        )}
      </div>
    </Card>
  );
};

