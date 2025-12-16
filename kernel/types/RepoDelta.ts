/**
 * Repository Delta Types
 * Used for repo delta analysis in Insights tab
 */

export interface RepoDelta {
    totalFiles: number;
    modified: number;
    untracked: number;
    staged: number;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    lastSnapshotTime?: number;
}