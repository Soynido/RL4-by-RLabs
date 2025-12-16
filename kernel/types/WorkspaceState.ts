/**
 * Workspace State Types
 * Used for workspace detection and onboarding
 */

export interface WorkspaceState {
    mode: 'first_use' | 'existing' | 'calibrated';
    step: number;
    confidence: number;
    lastSnapshotTime?: number;
    projectType?: string;
}