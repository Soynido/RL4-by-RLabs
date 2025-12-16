/******************************************************************************************
 * IntentExtractor.ts — Extract User Intent from Snapshot Data
 *
 * Analyzes snapshot data to determine user's primary intent and goals
 ******************************************************************************************/

import { SnapshotData } from '../types/SnapshotData';
import { Topic } from '../types/PromptContext';

export interface IntentResult {
  primary: string;
  secondary: string[];
  confidence: number;
  evidence: string[];
}

export class IntentExtractor {

  /**
   * Extract user intent from snapshot data
   */
  static extract(snapshot: SnapshotData): IntentResult {
    const evidence: string[] = [];
    let intentType = 'general';
    let confidence = 0.5;

    // Analyze tasks for intent signals
    if (snapshot.tasks.current.length > 0) {
      const highPriorityTasks = snapshot.tasks.current.filter(t =>
        t.priority === 'high' || t.priority === 'critical'
      );

      if (highPriorityTasks.length > 0) {
        const task = highPriorityTasks[0];
        evidence.push(`High priority task: ${task.title}`);
        intentType = this.classifyTaskIntent(task);
        confidence += 0.2;
      }
    }

    // Analyze recent commits for patterns
    const recentCommits = snapshot.history.commits
      .filter(c => Date.now() - c.timestamp < 24 * 60 * 60 * 1000); // Last 24h

    if (recentCommits.length > 0) {
      const commitTypes = recentCommits.map(c => c.type);
      const typeCounts = commitTypes.reduce((acc, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const dominantType = Object.entries(typeCounts)
        .sort(([,a], [,b]) => b - a)[0][0];

      evidence.push(`Recent activity pattern: ${dominantType}`);

      switch (dominantType) {
        case 'feature':
          intentType = 'development';
          confidence += 0.15;
          break;
        case 'fix':
          intentType = 'debugging';
          confidence += 0.15;
          break;
        case 'refactor':
          intentType = 'maintenance';
          confidence += 0.1;
          break;
      }
    }

    // Analyze code changes
    const workingSetSize = snapshot.workingSet.length;
    if (workingSetSize > 5) {
      evidence.push(`Large working set: ${workingSetSize} files`);
      intentType = 'bulk-changes';
      confidence += 0.1;
    } else if (workingSetSize === 1) {
      const file = snapshot.workingSet[0];
      evidence.push(`Focused on single file: ${file}`);
      intentType = 'focused-development';
      confidence += 0.1;
    }

    // Analyze anomalies
    const criticalIssues = snapshot.anomalies.issues.filter(a => a.severity === 'critical');
    if (criticalIssues.length > 0) {
      evidence.push(`Critical issues detected: ${criticalIssues.length}`);
      intentType = 'bug-fixing';
      confidence += 0.2;
    }

    // Analyze goals
    if (snapshot.goals.length > 0) {
      evidence.push(`Explicit goals: ${snapshot.goals.join(', ')}`);
      const goalKeywords = snapshot.goals.join(' ').toLowerCase();

      if (goalKeywords.includes('test') || goalKeywords.includes('testing')) {
        intentType = 'testing';
        confidence += 0.15;
      } else if (goalKeywords.includes('deploy') || goalKeywords.includes('release')) {
        intentType = 'deployment';
        confidence += 0.15;
      } else if (goalKeywords.includes('refactor') || goalKeywords.includes('cleanup')) {
        intentType = 'refactoring';
        confidence += 0.15;
      }
    }

    confidence = Math.min(confidence, 1.0);

    return {
      primary: intentType,
      secondary: this.getSecondaryIntents(snapshot, intentType),
      confidence,
      evidence
    };
  }

  /**
   * Convert intent result to topics for PromptContext
   */
  static toTopics(intent: IntentResult): Topic[] {
    const topics: Topic[] = [];

    // Primary intent
    topics.push({
      id: 1,
      name: `primary-intent-${intent.primary}`,
      weight: Math.floor(intent.confidence * 999),
      refs: []
    });

    // Secondary intents
    intent.secondary.forEach((secondary, index) => {
      topics.push({
        id: index + 2,
        name: `secondary-intent-${secondary}`,
        weight: Math.floor((1 - intent.confidence) * 500),
        refs: [1] // Reference primary intent
      });
    });

    return topics;
  }

  private static classifyTaskIntent(task: any): string {
    const title = task.title.toLowerCase();
    const desc = task.description?.toLowerCase() || '';
    const text = `${title} ${desc}`;

    if (text.includes('bug') || text.includes('fix') || text.includes('error')) {
      return 'bug-fixing';
    }
    if (text.includes('test') || text.includes('testing') || text.includes('spec')) {
      return 'testing';
    }
    if (text.includes('refactor') || text.includes('cleanup') || text.includes('reorganize')) {
      return 'refactoring';
    }
    if (text.includes('deploy') || text.includes('release') || text.includes('publish')) {
      return 'deployment';
    }
    if (text.includes('feature') || text.includes('implement') || text.includes('add')) {
      return 'development';
    }
    if (text.includes('review') || text.includes('audit') || text.includes('check')) {
      return 'review';
    }

    return 'general';
  }

  private static getSecondaryIntents(snapshot: SnapshotData, primary: string): string[] {
    const secondary: string[] = [];

    // Always include current work as secondary
    if (snapshot.workingSet.length > 0 && primary !== 'focused-development') {
      secondary.push('focused-development');
    }

    // Include testing if tests exist
    const testFiles = snapshot.code.files.filter(f =>
      f.path.includes('test') || f.path.includes('spec')
    );
    if (testFiles.length > 0 && primary !== 'testing') {
      secondary.push('testing');
    }

    // Include maintenance if many files
    if (snapshot.code.files.length > 50 && primary !== 'maintenance') {
      secondary.push('maintenance');
    }

    // Include collaboration if many commits
    if (snapshot.history.commits.length > 10 && primary !== 'collaboration') {
      secondary.push('collaboration');
    }

    return secondary.slice(0, 3); // Limit to 3 secondary intents
  }
}