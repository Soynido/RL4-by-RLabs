import React from 'react';
import { useStore } from '../../state/store';
import { Card } from '../ui/Card';

export const PhaseIndicator: React.FC = () => {
  const currentPhase = useStore((s) => s.currentPhase);

  return (
    <Card className="phase-indicator" highlight="cyan">
      <div className="phase-content">
        <span className="phase-label">PHASE:</span>
        <span className="phase-value">{currentPhase || 'UNKNOWN'}</span>
      </div>
    </Card>
  );
};

