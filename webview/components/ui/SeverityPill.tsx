import React from 'react';

export interface SeverityPillProps {
  severity: 'high' | 'medium' | 'low';
  className?: string;
}

export const SeverityPill: React.FC<SeverityPillProps> = ({ severity, className = '' }) => {
  return (
    <span className={`severity-pill ${severity} ${className}`}>
      {severity.toUpperCase()}
    </span>
  );
};

