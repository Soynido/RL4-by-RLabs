import React from 'react';
import { Card } from '../ui/Card';

export const DecisionView: React.FC = () => {
  // Temporarily disabled - will be re-enabled with direct IPC in Phase 2
  return (
    <Card padded>
      <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 20px' }}>
        ADR Validation available via VS Code commands.
        <br />
        <small>This view will be re-enabled in a future update.</small>
      </p>
    </Card>
  );

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 95) return 'high';
    if (confidence >= 80) return 'medium';
    return 'low';
  };

  return (
    <div className="decision-view">
      <Card className="decision-controls" padded>
        <div className="time-range-controls">
          <Input
            type="datetime-local"
            label="Start Time"
            value={new Date(startTime).toISOString().slice(0, 16)}
            onChange={(e) => setStartTime(new Date(e.target.value).getTime())}
          />
          <Input
            type="datetime-local"
            label="End Time"
            value={new Date(endTime).toISOString().slice(0, 16)}
            onChange={(e) => setEndTime(new Date(e.target.value).getTime())}
          />
          <Button variant="primary" onClick={loadDecisions} disabled={loading}>
            {loading ? 'Loading...' : 'Load Decisions'}
          </Button>
        </div>
        {error && <div className="error-message">{error}</div>}
      </Card>

      <div className="decision-list">
        <Card className="decision-list-header" padded>
          <h3>Cognitive Decisions ({decisions.length})</h3>
        </Card>

        {decisions.length === 0 && !loading && (
          <Card padded>
            <p>No decisions found in the selected time range.</p>
          </Card>
        )}

        {decisions.map((decision) => (
          <Card
            key={decision.id}
            className={`decision-item ${selectedDecision?.id === decision.id ? 'selected' : ''}`}
            padded
            highlight={getConfidenceColor(decision.confidence_llm)}
            onClick={() => setSelectedDecision(decision)}
          >
            <div className="decision-header">
              <div className="decision-intent">
                <strong>{decision.intent_text || decision.intent}</strong>
                <span className="decision-id">#{decision.id.slice(0, 8)}</span>
              </div>
              <div className="decision-meta">
                <span className={`confidence confidence-${getConfidenceColor(decision.confidence_llm)}`}>
                  {decision.confidence_llm}%
                </span>
                <span className={`gate gate-${decision.confidence_gate}`}>
                  {decision.confidence_gate}
                </span>
                <span className="status">{decision.validation_status}</span>
              </div>
            </div>
            <div className="decision-details">
              <div className="decision-time">{formatDate(decision.timestamp)}</div>
              {decision.chosen_option && (
                <div className="decision-option">
                  <strong>Chosen:</strong> {decision.chosen_option}
                </div>
              )}
              {decision.context_refs.length > 0 && (
                <div className="decision-refs">
                  <strong>Context Refs:</strong> {decision.context_refs.length} references
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {selectedDecision && (
        <Card className="decision-detail" padded highlight="cyan">
          <h4>Decision Details</h4>
          <div className="detail-section">
            <strong>ID:</strong> {selectedDecision.id}
          </div>
          <div className="detail-section">
            <strong>Intent:</strong> {selectedDecision.intent}
          </div>
          <div className="detail-section">
            <strong>Intent Text:</strong> {selectedDecision.intent_text}
          </div>
          <div className="detail-section">
            <strong>Confidence (LLM):</strong> {selectedDecision.confidence_llm}%
          </div>
          <div className="detail-section">
            <strong>Confidence Gate:</strong> {selectedDecision.confidence_gate}
          </div>
          <div className="detail-section">
            <strong>Validation Status:</strong> {selectedDecision.validation_status}
          </div>
          <div className="detail-section">
            <strong>Timestamp:</strong> {formatDate(selectedDecision.timestamp)}
          </div>
          {selectedDecision.chosen_option && (
            <div className="detail-section">
              <strong>Chosen Option:</strong> {selectedDecision.chosen_option}
            </div>
          )}
          {selectedDecision.context_refs.length > 0 && (
            <div className="detail-section">
              <strong>Context References:</strong>
              <ul>
                {selectedDecision.context_refs.map((ref, idx) => (
                  <li key={idx}>{ref}</li>
                ))}
              </ul>
            </div>
          )}
          <Button variant="secondary" onClick={() => setSelectedDecision(null)}>
            Close
          </Button>
        </Card>
      )}
    </div>
  );
};

