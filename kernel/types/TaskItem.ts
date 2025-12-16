/**
 * Task Item Types
 * Used for local task management
 */

export interface TaskItem {
    id: string;
    title: string;
    completed: boolean;
    timestamp?: string;
    priority?: 'P0' | 'P1' | 'P2';
}