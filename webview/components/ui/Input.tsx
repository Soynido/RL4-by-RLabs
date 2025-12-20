import React from 'react';

export interface InputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  type?: 'text' | 'date';
  min?: string;
  max?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const Input: React.FC<InputProps> = ({
  value,
  onChange,
  placeholder,
  disabled = false,
  className = '',
  type = 'text',
  min,
  max,
  onKeyDown,
}) => {
  return (
    <input
      type={type}
      className={`input ${className}`}
      value={value || ''}
      onChange={(e) => onChange?.(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      min={min}
      max={max}
    />
  );
};

