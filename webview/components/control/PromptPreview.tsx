import React, { useState } from 'react';
import { useStore } from '../../state/store';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

export const PromptPreview: React.FC = () => {
  const prompt = useStore((s) => s.prompt);
  const lastSnapshotIso = useStore((s) => s.lastSnapshotIso);
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

  if (!prompt) {
    return (
      <Card className="prompt-preview empty">
        <p>No snapshot generated yet. Click "Generate Snapshot" to create one.</p>
      </Card>
    );
  }

  return (
    <Card className="prompt-preview" padded>
      <div className="prompt-header">
        <h3>Snapshot Prompt</h3>
        {lastSnapshotIso && (
          <span className="prompt-timestamp">
            {new Date(lastSnapshotIso).toLocaleString()}
          </span>
        )}
      </div>
      <textarea
        className="prompt-textarea"
        value={prompt}
        readOnly
        rows={15}
      />
      <Button variant="secondary" onClick={handleCopy} block>
        {copied ? '✓ Copied!' : 'Copy to Clipboard'}
      </Button>
    </Card>
  );
};

