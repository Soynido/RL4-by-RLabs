import React from 'react';

export interface TimelineProps {
  startDate: string;
  endDate: string;
  minDate: string | null;
  maxDate: string;
}

export const Timeline: React.FC<TimelineProps> = ({ startDate, endDate, minDate, maxDate }) => {
  return (
    <div className="timeline">
      <div className="timeline-track">
        <div className="timeline-range" style={{ left: '0%', width: '100%' }} />
        <div className="timeline-start" />
        <div className="timeline-end" />
      </div>
      <div className="timeline-labels">
        <span>{minDate ? new Date(minDate).toLocaleDateString() : 'Start'}</span>
        <span>{new Date(maxDate).toLocaleDateString()}</span>
      </div>
    </div>
  );
};

