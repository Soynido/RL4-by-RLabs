import React from 'react';
import { Card } from '../ui/Card';

export const SupportCard: React.FC = () => {
  return (
    <Card className="support-card" padded>
      <h3>Support</h3>
      <p>For issues, questions, or contributions, visit our repository.</p>
      <ul>
        <li>GitHub: github.com/rlabs/rl4</li>
        <li>Documentation: docs.rl4.dev</li>
        <li>Discord: discord.gg/rl4</li>
      </ul>
    </Card>
  );
};

