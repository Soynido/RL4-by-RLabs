/**
 * Tracked Task Item Types
 * Used for RL4 tracked tasks with filtering
 */

export interface TrackedTaskItem {
    id: string;
    title: string;
    completed: boolean;
    priority: 'P0' | 'P1' | 'P2';
    tracked: boolean;
    timestamp?: string;
    metadata?: Record<string, any>;
}