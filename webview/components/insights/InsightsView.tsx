import React from 'react';
import { useStore } from '../../state/store';
import { PhaseIndicator } from './PhaseIndicator';
import { InsightCard } from './InsightCard';

export const InsightsView: React.FC = () => {
  const repoDelta = useStore((s) => s.repoDelta);
  const planDrift = useStore((s) => s.planDrift);
  const blindspots = useStore((s) => s.blindspots);

  const getSeverity = (value: number | undefined): 'high' | 'medium' | 'low' => {
    if (!value) return 'low';
    if (value > 50) return 'high';
    if (value > 20) return 'medium';
    return 'low';
  };

  const getSeverityFromLevel = (level?: 'LOW' | 'MEDIUM' | 'HIGH'): 'high' | 'medium' | 'low' => {
    if (!level) return 'low';
    if (level === 'HIGH') return 'high';
    if (level === 'MEDIUM') return 'medium';
    return 'low';
  };

  const totalChanged = repoDelta ? repoDelta.modified + repoDelta.untracked + repoDelta.staged : 0;

  return (
    <div className="insights-view">
      <PhaseIndicator />
      <div className="insights-grid">
        <InsightCard
          title="Repo Delta"
          value={totalChanged}
          severity={getSeverity(totalChanged)}
          description={`${repoDelta?.modified || 0} modified, ${repoDelta?.untracked || 0} untracked, ${repoDelta?.staged || 0} staged`}
          highlight={getSeverity(totalChanged)}
        />
        <InsightCard
          title="Plan Drift"
          value={planDrift?.driftLevel || 'LOW'}
          severity={getSeverityFromLevel(planDrift?.driftLevel)}
          description={planDrift?.recommendations?.[0] || `Updated ${planDrift?.hoursSinceUpdate || 0}h ago`}
          highlight={getSeverityFromLevel(planDrift?.driftLevel)}
        />
        <InsightCard
          title="Blindspots"
          value={blindspots ? blindspots.bursts + blindspots.gaps : 0}
          severity={blindspots && (blindspots.bursts + blindspots.gaps) > 0 ? 'medium' : 'low'}
          description={blindspots?.signals?.[0]?.description || 'No blindspots detected'}
        />
      </div>
    </div>
  );
};

