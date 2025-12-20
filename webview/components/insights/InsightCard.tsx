import React from 'react';
import { Card } from '../ui/Card';
import { SeverityPill } from '../ui/SeverityPill';

export interface InsightCardProps {
  title: string;
  value: string | number;
  severity?: 'high' | 'medium' | 'low';
  description?: string;
  highlight?: 'high' | 'medium' | 'low' | 'cyan';
}

export const InsightCard: React.FC<InsightCardProps> = ({
  title,
  value,
  severity,
  description,
  highlight,
}) => {
  return (
    <Card className="insight-card" highlight={highlight}>
      <div className="insight-header">
        <h3>{title}</h3>
        {severity && <SeverityPill severity={severity} />}
      </div>
      <div className="insight-value">{value}</div>
      {description && <p className="insight-description">{description}</p>}
    </Card>
  );
};

