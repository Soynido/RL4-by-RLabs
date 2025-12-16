/******************************************************************************************
 * TaskExtractor.ts — Extract Tasks from Snapshot Data
 *
 * Converts task snapshots into timeline events and decisions
 ******************************************************************************************/

import { SnapshotData, TaskSnapshot, TaskItem } from '../types/SnapshotData';
import { TimelineEvent, Decision } from '../types/PromptContext';

export interface TaskExtractionResult {
  events: TimelineEvent[];
  decisions: Decision[];
}

export class TaskExtractor {

  /**
   * Extract task-related timeline events and decisions
   */
  static extract(snapshot: SnapshotData): TaskExtractionResult {
    const events: TimelineEvent[] = [];
    const decisions: Decision[] = [];
    let eventId = 1;
    let decisionId = 1;

    // Process current tasks
    for (const task of snapshot.tasks.current) {
      // Create task start event
      events.push({
        id: eventId++,
        time: task.createdAt,
        type: 'query',
        ptr: `TASK:${task.id}`
      });

      // Create status reflection if task has been updated
      if (task.updatedAt > task.createdAt) {
        events.push({
          id: eventId++,
          time: task.updatedAt,
          type: 'reflection',
          ptr: `TASK:${task.id}:updated`
        });
      }

      // Create decision for high priority tasks
      if (task.priority === 'high' || task.priority === 'critical') {
        decisions.push({
          id: decisionId++,
          type: 'accept',
          weight: this.mapPriorityToWeight(task.priority),
          inputs: [eventId - 2, eventId - 1] // Reference the task events
        });
      }
    }

    // Process completed tasks
    for (const task of snapshot.tasks.completed) {
      // Create completion event
      events.push({
        id: eventId++,
        time: task.updatedAt,
        type: 'response',
        ptr: `TASK:${task.id}:completed`
      });

      // Create decision about task quality/duration
      const duration = task.updatedAt - task.createdAt;
      const decisionType = duration > 7 * 24 * 60 * 60 * 1000 ? // More than a week
        'modify' : 'accept';

      decisions.push({
        id: decisionId++,
        type: decisionType,
        weight: 800, // High weight for completed tasks
        inputs: [eventId - 1]
      });
    }

    // Process blocked tasks
    for (const task of snapshot.tasks.blocked) {
      events.push({
        id: eventId++,
        time: task.updatedAt,
        type: 'decision',
        ptr: `TASK:${task.id}:blocked`
      });

      decisions.push({
        id: decisionId++,
        type: 'defer',
        weight: 600, // Medium weight for blocked tasks
        inputs: [eventId - 1]
      });
    }

    // Sort events by time
    events.sort((a, b) => a.time - b.time);

    // Reassign sequential IDs after sorting
    events.forEach((event, index) => {
      event.id = index + 1;
    });

    return { events, decisions };
  }

  /**
   * Get task statistics for context
   */
  static getTaskStats(snapshot: SnapshotData): {
    total: number;
    completed: number;
    inProgress: number;
    blocked: number;
    overdue: number;
  } {
    const now = Date.now();
    const overdue = snapshot.tasks.current.filter(t =>
      t.dueAt && t.dueAt < now
    ).length;

    return {
      total: snapshot.tasks.current.length + snapshot.tasks.completed.length,
      completed: snapshot.tasks.completed.length,
      inProgress: snapshot.tasks.current.length,
      blocked: snapshot.tasks.blocked.length,
      overdue
    };
  }

  /**
   * Identify task patterns and insights
   */
  static identifyPatterns(snapshot: SnapshotData): string[] {
    const patterns: string[] = [];

    // High blocking rate
    const blockRate = snapshot.tasks.blocked.length /
      (snapshot.tasks.current.length || 1);
    if (blockRate > 0.3) {
      patterns.push('high-blocking-rate');
    }

    // Many overdue tasks
    const overdueCount = snapshot.tasks.current.filter(t =>
      t.dueAt && t.dueAt < Date.now()
    ).length;
    if (overdueCount > 3) {
      patterns.push('many-overdue-tasks');
    }

    // Task completion rate
    const completionRate = snapshot.tasks.completed.length /
      (snapshot.tasks.completed.length + snapshot.tasks.current.length || 1);
    if (completionRate > 0.8) {
      patterns.push('high-completion-rate');
    } else if (completionRate < 0.3) {
      patterns.push('low-completion-rate');
    }

    // Task concentration
    const highPriorityCount = snapshot.tasks.current.filter(t =>
      t.priority === 'high' || t.priority === 'critical'
    ).length;
    if (highPriorityCount > 5) {
      patterns.push('many-high-priority-tasks');
    }

    // Task age distribution
    const now = Date.now();
    const oldTasks = snapshot.tasks.current.filter(t =>
      now - t.createdAt > 7 * 24 * 60 * 60 * 1000 // Older than a week
    ).length;
    if (oldTasks > 3) {
      patterns.push('many-stale-tasks');
    }

    return patterns;
  }

  private static mapPriorityToWeight(priority: string): number {
    switch (priority) {
      case 'critical': return 999;
      case 'high': return 800;
      case 'medium': return 600;
      case 'low': return 400;
      default: return 500;
    }
  }
}