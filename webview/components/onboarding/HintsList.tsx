import React from 'react';

export interface HintsListProps {
  hints: string[];
}

export const HintsList: React.FC<HintsListProps> = ({ hints }) => {
  return (
    <ul className="hints-list">
      {hints.map((hint, index) => (
        <li key={index}>{hint}</li>
      ))}
    </ul>
  );
};

