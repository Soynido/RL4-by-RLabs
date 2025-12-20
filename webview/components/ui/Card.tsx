import React from 'react';

export interface CardProps {
  children?: React.ReactNode;
  className?: string;
  padded?: boolean;
  highlight?: 'high' | 'medium' | 'low' | 'cyan';
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padded = false,
  highlight,
}) => {
  const baseClass = 'card';
  const paddedClass = padded ? 'card-padded' : '';
  const highlightClass = highlight ? `highlight-${highlight}` : '';

  return (
    <div className={`${baseClass} ${paddedClass} ${highlightClass} ${className}`.trim()}>
      {children}
    </div>
  );
};

