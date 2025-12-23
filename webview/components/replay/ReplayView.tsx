import React from 'react';
import { Card } from '../ui/Card';

export const ReplayView: React.FC = () => {
  // Temporarily disabled - will be re-enabled with direct IPC in Phase 2
  return (
    <Card padded>
      <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 20px' }}>
        Replay Trajectory coming soon.
        <br />
        <small>This feature will be available in a future update.</small>
      </p>
    </Card>
  );

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatHash = (hash: string) => {
    return `${hash.slice(0, 16)}...${hash.slice(-8)}`;
  };

  return (
    <div className="replay-view">
      <Card className="replay-controls" padded>
        <h3>Replay Cognitive Trajectory</h3>
        <div className="replay-inputs">
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
          <Input
            type="text"
            label="Anchor Event ID (optional)"
            value={anchorEventId}
            onChange={(e) => setAnchorEventId(e.target.value)}
            placeholder="event-id-123"
          />
          <Button variant="primary" onClick={handleReplay} disabled={loading} block>
            {loading ? 'Replaying...' : 'Replay Trajectory'}
          </Button>
        </div>
        {error && <div className="error-message">{error}</div>}
      </Card>

      {replayResult && (
        <>
          <Card className="replay-summary" padded highlight="cyan">
            <h4>Replay Summary</h4>
            <div className="summary-stats">
              <div className="stat">
                <strong>Events:</strong> {replayResult.events.length}
              </div>
              <div className="stat">
                <strong>Decisions:</strong> {replayResult.decisions.length}
              </div>
              <div className="stat">
                <strong>Replay Hash:</strong>
                <code className="hash-code" title={replayResult.hash}>
                  {formatHash(replayResult.hash)}
                </code>
              </div>
              <div className="stat">
                <strong>Replay Time:</strong> {formatDate(replayResult.timestamp)}
              </div>
            </div>
          </Card>

          <Card className="replay-timeline" padded>
            <h4>Timeline</h4>
            <div className="timeline-container">
              {replayResult.events.map((event, idx) => (
                <div key={event.id} className="timeline-event">
                  <div className="event-marker" />
                  <div className="event-content">
                    <div className="event-header">
                      <span className="event-type">{event.type}</span>
                      <span className="event-time">{formatDate(event.timestamp)}</span>
                    </div>
                    <div className="event-details">
                      <span className="event-id">#{event.id.slice(0, 8)}</span>
                      <span className="event-source">{event.source}</span>
                      <span className="event-category">{event.category}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="replay-decisions" padded>
            <h4>Decisions ({replayResult.decisions.length})</h4>
            {replayResult.decisions.length === 0 ? (
              <p>No decisions in this trajectory.</p>
            ) : (
              <div className="decisions-list">
                {replayResult.decisions.map((decision) => (
                  <div key={decision.id} className="decision-item">
                    <div className="decision-header">
                      <strong>{decision.intent}</strong>
                      <span className="decision-time">{formatDate(decision.timestamp)}</span>
                    </div>
                    <div className="decision-meta">
                      <span className="confidence">{decision.confidence_llm}%</span>
                      <span className={`gate gate-${decision.confidence_gate}`}>
                        {decision.confidence_gate}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

