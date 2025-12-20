import React from 'react';
import { Dropdown, DropdownOption } from '../ui/Dropdown';

export const MODE_OPTIONS: DropdownOption[] = [
  { label: 'Strict — No drift allowed', value: 'strict' },
  { label: 'Flexible — 25% drift OK', value: 'flexible' },
  { label: 'Exploratory — Ideas only', value: 'exploratory' },
  { label: 'Free — R&D partner', value: 'free' },
  { label: 'First Use — Bootstrap', value: 'firstUse' },
];

export interface ModeSelectorProps {
  value: string;
  disabled?: boolean;
  onChange?: (mode: string) => void;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({ value, disabled, onChange }) => {
  return (
    <Dropdown
      options={MODE_OPTIONS}
      value={value}
      onChange={(newValue) => onChange?.(newValue)}
      disabled={disabled}
    />
  );
};

