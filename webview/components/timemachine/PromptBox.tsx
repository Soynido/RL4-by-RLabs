import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

export interface PromptBoxProps {
  prompt: string | null;
  loading: boolean;
  error: string | null;
}

export const PromptBox: React.FC<PromptBoxProps> = ({ prompt, loading, error }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (prompt) {
      try {
        await navigator.clipboard.writeText(prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  if (loading) {
    return (
      <Card className="prompt-box loading">
        <p>Generating Time Machine prompt...</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="prompt-box error">
        <p>Error: {error}</p>
      </Card>
    );
  }

  if (!prompt) {
    return (
      <Card className="prompt-box empty">
        <p>Select a date range and click "Build Time Machine Prompt" to generate.</p>
      </Card>
    );
  }

  return (
    <Card className="prompt-box" padded>
      <div className="prompt-header">
        <h3>Time Machine Prompt</h3>
        <Button variant="secondary" onClick={handleCopy}>
          {copied ? '✓ Copied!' : 'Copy'}
        </Button>
      </div>
      <textarea className="prompt-textarea" value={prompt} readOnly rows={20} />
    </Card>
  );
};

