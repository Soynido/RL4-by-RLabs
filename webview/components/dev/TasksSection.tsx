import React, { useState } from 'react';
import { useStore } from '../../state/store';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card } from '../ui/Card';
import { TaskItem } from './TaskItem';
import { PriorityFilter, PriorityFilterValue } from './PriorityFilter';
import { useTasks } from '../../hooks/useTasks';

const getVsCodeApi = () => {
  if (window.vscode) return window.vscode;
  if (window.acquireVsCodeApi) {
    window.vscode = window.acquireVsCodeApi();
    return window.vscode;
  }
  return { postMessage: (msg: any) => console.log('[mock postMessage]', msg) };
};

const vscode = getVsCodeApi();

export const TasksSection: React.FC = () => {
  const localTasks = useStore((s) => s.localTasks);
  const taskFilter = useStore((s) => s.taskFilter);
  const { addTask, toggleTask } = useTasks();
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const filteredTasks = taskFilter === 'all'
    ? localTasks
    : localTasks.filter((t) => t.priority === taskFilter);

  const handleAddTask = () => {
    if (newTaskTitle.trim()) {
      addTask(newTaskTitle.trim());
      setNewTaskTitle('');
    }
  };

  const handleToggle = (id: string, completed: boolean) => {
    toggleTask(id, completed);
  };

  const handleFilterChange = (filter: PriorityFilterValue) => {
    useStore.getState().setTaskFilter(filter);
  };

  return (
    <Card className="tasks-section" padded>
      <div className="tasks-header">
        <h2>Local Tasks</h2>
        <PriorityFilter value={taskFilter} onChange={handleFilterChange} />
      </div>
      <div className="tasks-input">
        <Input
          value={newTaskTitle}
          onChange={setNewTaskTitle}
          placeholder="Add a new task..."
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleAddTask();
            }
          }}
        />
        <Button variant="primary" onClick={handleAddTask} disabled={!newTaskTitle.trim()}>
          Add
        </Button>
      </div>
      <div className="tasks-list">
        {filteredTasks.length === 0 ? (
          <p className="tasks-empty">No tasks found</p>
        ) : (
          filteredTasks.map((task) => (
            <TaskItem key={task.id} {...task} onToggle={handleToggle} />
          ))
        )}
      </div>
    </Card>
  );
};

