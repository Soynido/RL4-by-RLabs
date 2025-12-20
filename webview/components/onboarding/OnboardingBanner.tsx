import React from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { StepIndicator } from './StepIndicator';
import { HintsList } from './HintsList';

export interface OnboardingBannerProps {
  mode: 'standard' | 'extended';
  onDismiss: () => void;
}

const STANDARD_HINTS = [
  'RL4 will track all IDE activity automatically',
  'Generate snapshots to calibrate your LLM',
  'Use Time Machine to reconstruct project history',
];

const EXTENDED_HINTS = [
  'RL4 detected an existing project with Git history',
  'You can reconstruct past activity or start fresh',
  'Large projects may require GitHub Connect for full history',
];

export const OnboardingBanner: React.FC<OnboardingBannerProps> = ({ mode, onDismiss }) => {
  const isExtended = mode === 'extended';
  const hints = isExtended ? EXTENDED_HINTS : STANDARD_HINTS;

  return (
    <Card className="onboarding-banner" highlight="cyan">
      <div className="onboarding-header">
        <h2>{isExtended ? 'First Use Extended' : 'First Use'}</h2>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
      <StepIndicator currentStep={1} totalSteps={3} />
      <div className="onboarding-content">
        <p className="onboarding-description">
          {isExtended
            ? 'Welcome to RL4! This workspace has existing history. Choose how to proceed:'
            : 'Welcome to RL4! Your cognitive co-pilot that remembers everything.'}
        </p>
        <HintsList hints={hints} />
      </div>
    </Card>
  );
};

