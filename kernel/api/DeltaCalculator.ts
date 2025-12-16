/**
 * DeltaCalculator - Repository Delta Analysis
 *
 * Calculates repository delta since last snapshot for Insights tab
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { RepoDelta } from '../types/RepoDelta';
import { ILogger } from '../core/ILogger';

export class DeltaCalculator {
    constructor(
        private workspaceRoot: string,
        private logger?: ILogger
    ) {}

    /**
     * Calculate repository delta since last snapshot
     */
    async calculateRepoDelta(): Promise<RepoDelta> {
        try {
            const lastSnapshotTime = this.getLastSnapshotTime();

            // Get git status and stats
            const gitStatus = this.getGitStatus();
            const gitDiff = this.getGitDiffStats();

            // Calculate severity based on volume
            const severity = this.calculateSeverity(gitStatus, gitDiff);

            return {
                totalFiles: gitStatus.totalFiles,
                modified: gitStatus.modified,
                untracked: gitStatus.untracked,
                staged: gitStatus.staged,
                severity,
                lastSnapshotTime
            };

        } catch (error) {
            this.logger?.error(`[DeltaCalculator] Failed to calculate repo delta: ${error}`);

            // Return empty delta on error
            return {
                totalFiles: 0,
                modified: 0,
                untracked: 0,
                staged: 0,
                severity: 'LOW'
            };
        }
    }

    private getLastSnapshotTime(): number | undefined {
        try {
            const snapshotsPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'snapshots');
            if (!fs.existsSync(snapshotsPath)) {
                return undefined;
            }

            const files = fs.readdirSync(snapshotsPath)
                .filter(f => f.endsWith('.json'))
                .map(f => path.join(snapshotsPath, f));

            if (files.length === 0) {
                return undefined;
            }

            // Get most recent snapshot file
            const latestFile = files.reduce((latest, current) => {
                const latestStat = fs.statSync(latest);
                const currentStat = fs.statSync(current);
                return currentStat.mtime > latestStat.mtime ? current : latest;
            });

            return fs.statSync(latestFile).mtime.getTime();

        } catch (error) {
            return undefined;
        }
    }

    private getGitStatus(): {
        totalFiles: number;
        modified: number;
        untracked: number;
        staged: number;
    } {
        try {
            const status = execSync('git status --porcelain', {
                cwd: this.workspaceRoot,
                encoding: 'utf8'
            }).trim();

            const lines = status.split('\n').filter(line => line.trim());

            let modified = 0;
            let untracked = 0;
            let staged = 0;

            for (const line of lines) {
                const statusCode = line.substring(0, 2);

                if (statusCode.includes('M')) modified++;
                if (statusCode.includes('A')) staged++;
                if (statusCode.includes('??')) untracked++;
                // Modified and staged counts both M and A
            }

            return {
                totalFiles: lines.length,
                modified,
                untracked,
                staged
            };

        } catch (error) {
            return {
                totalFiles: 0,
                modified: 0,
                untracked: 0,
                staged: 0
            };
        }
    }

    private getGitDiffStats(): {
        insertions: number;
        deletions: number;
        files: number;
    } {
        try {
            const diffStat = execSync('git diff --stat', {
                cwd: this.workspaceRoot,
                encoding: 'utf8'
            }).trim();

            if (!diffStat) {
                return { insertions: 0, deletions: 0, files: 0 };
            }

            // Parse git diff --stat output
            const lines = diffStat.split('\n');
            const summaryLine = lines[lines.length - 1];

            // Extract numbers from summary like " 5 files changed, 120 insertions(+), 30 deletions(-)"
            const filesMatch = summaryLine.match(/(\d+)\s+files?\s+changed/);
            const insertionsMatch = summaryLine.match(/(\d+)\s+insertions?\(\+\)/);
            const deletionsMatch = summaryLine.match(/(\d+)\s+deletions?\(-\)/);

            return {
                files: filesMatch ? parseInt(filesMatch[1]) : 0,
                insertions: insertionsMatch ? parseInt(insertionsMatch[1]) : 0,
                deletions: deletionsMatch ? parseInt(deletionsMatch[1]) : 0
            };

        } catch (error) {
            return { insertions: 0, deletions: 0, files: 0 };
        }
    }

    private calculateSeverity(status: any, diff: any): 'HIGH' | 'MEDIUM' | 'LOW' {
        // Severity calculation based on volume and time since last snapshot
        const totalChanges = status.totalFiles;
        const lineChanges = diff.insertions + diff.deletions;
        const lastSnapshotTime = this.getLastSnapshotTime();
        const hoursSinceSnapshot = lastSnapshotTime
            ? (Date.now() - lastSnapshotTime) / (1000 * 60 * 60)
            : 24; // Assume 24 hours if no snapshot

        // High severity: many changes OR recent snapshot with many changes
        if (totalChanges > 50 || lineChanges > 500 || (hoursSinceSnapshot < 2 && totalChanges > 20)) {
            return 'HIGH';
        }

        // Medium severity: moderate changes
        if (totalChanges > 10 || lineChanges > 100) {
            return 'MEDIUM';
        }

        return 'LOW';
    }
}