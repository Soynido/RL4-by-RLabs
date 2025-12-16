/**
 * Captured Item Types
 * Used for session capture management
 */

export interface CapturedItem {
    id: string;
    type: 'llm_proposal' | 'file_change' | 'user_action' | 'git_commit' | 'build_event';
    content: string;
    timestamp: string;
    metadata?: Record<string, any>;
}