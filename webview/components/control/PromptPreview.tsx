import React, { useState } from 'react';
import { useStore } from '../../state/store';
import { Button } from '../ui/Button';

export const PromptPreview: React.FC = () => {
  const prompt = useStore((s) => s.snapshotPrompt);
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
      <div className="chat-pane">
        <div className="chat-body">
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 20px' }}>
            No snapshot generated yet. Click "Generate Snapshot" to create one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-pane">
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="agent-badge">Agent</span>
          <span className="model-name">RL4 Snapshot</span>
        </div>
        <span className="chat-secure">Local • Secure</span>
      </div>
      <div className="chat-body">
        <div className="chat-bubble agent">
        {lastSnapshotIso && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Generated: {new Date(lastSnapshotIso).toLocaleString()}
            </div>
        )}
          <pre style={{ 
            margin: 0, 
            whiteSpace: 'pre-wrap', 
            wordBreak: 'break-word',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            lineHeight: '1.5'
          }}>
            {prompt}
          </pre>
        </div>
      </div>
      <div className="chat-footer">
        <input 
          type="text" 
          className="chat-input" 
          placeholder="› Paste snapshot context here..."
        readOnly
          value={prompt.substring(0, 100) + (prompt.length > 100 ? '...' : '')}
      />
        <button 
          className="chat-send"
          onClick={handleCopy}
        >
          {copied ? '✓ Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
};

