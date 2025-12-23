import React, { useEffect } from 'react';
import { useStore } from '../../state/store';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { DatePicker } from './DatePicker';
import { Timeline } from './Timeline';
import { PromptBox } from './PromptBox';
import { useTimeMachine } from '../../hooks/useTimeMachine';

export const TimeMachineView: React.FC = () => {
  const startDate = useStore((s) => s.startDate);
  const endDate = useStore((s) => s.endDate);
  const minDate = useStore((s) => s.minDate);
  const maxDate = useStore((s) => s.maxDate);
  const loading = useStore((s) => s.loading);
  const prompt = useStore((s) => s.timeMachinePrompt);
  const error = useStore((s) => s.error);
  const { buildPrompt, loadTimelineRange } = useTimeMachine();

  useEffect(() => {
    loadTimelineRange();
  }, [loadTimelineRange]);

  const handleBuild = () => {
    if (startDate && endDate) {
      buildPrompt(startDate, endDate);
    }
  };

  return (
    <div className="timemachine-view">
      <Card className="timemachine-controls" padded>
        <div className="date-pickers">
          <DatePicker
            label="Start Date"
            value={startDate}
            onChange={(value) => useStore.getState().setStartDate(value)}
            min={minDate || undefined}
            max={endDate || maxDate}
          />
          <DatePicker
            label="End Date"
            value={endDate}
            onChange={(value) => useStore.getState().setEndDate(value)}
            min={startDate || minDate || undefined}
            max={maxDate}
          />
        </div>
        <Button variant="primary" onClick={handleBuild} disabled={!startDate || !endDate || loading} block>
          {loading ? 'Building...' : 'Build Time Machine Prompt'}
        </Button>
      </Card>
      {minDate && <Timeline startDate={startDate} endDate={endDate} minDate={minDate} maxDate={maxDate} />}
      <PromptBox prompt={prompt} loading={loading} error={error} />
    </div>
  );
};

