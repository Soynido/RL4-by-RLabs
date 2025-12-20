import React from 'react';
import { Button } from '../ui/Button';

export type PriorityFilterValue = 'all' | 'P0' | 'P1' | 'P2';

export interface PriorityFilterProps {
  value: PriorityFilterValue;
  onChange: (value: PriorityFilterValue) => void;
}

export const PriorityFilter: React.FC<PriorityFilterProps> = ({ value, onChange }) => {
  const options: Array<{ value: PriorityFilterValue; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'P0', label: 'P0' },
    { value: 'P1', label: 'P1' },
    { value: 'P2', label: 'P2' },
  ];

  return (
    <div className="priority-filter">
      {options.map((opt) => (
        <Button
          key={opt.value}
          variant={value === opt.value ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
};

