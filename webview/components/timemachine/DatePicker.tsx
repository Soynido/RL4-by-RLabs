import React from 'react';
import { Input } from '../ui/Input';

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  label?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, min, max, label }) => {
  return (
    <div className="date-picker">
      {label && <label>{label}</label>}
      <Input type="date" value={value} onChange={onChange} min={min} max={max} />
    </div>
  );
};

