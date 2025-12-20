import React from 'react';
import { Card } from '../ui/Card';

export const FAQCard: React.FC = () => {
  return (
    <Card className="faq-card" padded>
      <h3>FAQ</h3>
      <div className="faq-list">
        <div className="faq-item">
          <strong>What is RL4?</strong>
          <p>RL4 is a local-first cognitive operating system for your IDE that tracks all activity and generates contextual snapshots.</p>
        </div>
        <div className="faq-item">
          <strong>How does snapshot generation work?</strong>
          <p>Snapshots capture the current state of your project, including governance files, recent changes, and context. They're used to calibrate your LLM.</p>
        </div>
        <div className="faq-item">
          <strong>What is Time Machine?</strong>
          <p>Time Machine allows you to reconstruct project history between two dates, generating prompts that help diagnose issues or understand past decisions.</p>
        </div>
      </div>
    </Card>
  );
};

