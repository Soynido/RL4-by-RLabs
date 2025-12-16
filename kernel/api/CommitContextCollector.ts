/**
 * CommitContextCollector - Collects comprehensive context for git commits
 *
 * Module 9310 - Real-time commit context aggregation
 *
 * Collects all relevant data for commit generation:
 * - Git diff and file changes
 * - Recent commit history
 * - Active ADRs and decisions
 * - RL4 cognitive context
 * - Timeline and activity patterns
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface CommitContext {
    workspaceRoot: string;
    timestamp: string;
    diffStat?: string;
    diffContent?: string;
    filesChanged: string[];
    insertions: number;
    deletions: number;
    netChange: number;
    recentCommits: CommitInfo[];
    activeADRs: ADRInfo[];
    detectedPattern?: PatternInfo;
    timelineContext: TimelineItem[];
    githubRemote: string;
    defaultBranch: string;
}

export interface CommitInfo {
    hash: string;
    author: string;
    date: string;
    message: string;
}

export interface ADRInfo {
    id: string;
    title: string;
    status: string;
}

export interface PatternInfo {
    type: string;
    confidence: number;
    indicators: string[];
}

export interface TimelineItem {
    file: string;
    edits: number;
}

export class CommitContextCollector {
    constructor(private workspaceRoot: string) {}

    /**
     * Collect comprehensive commit context
     */
    async collectContext(): Promise<CommitContext> {
        const timestamp = new Date().toISOString();

        // Collect git information
        const gitInfo = await this.collectGitInfo();

        // Collect RL4 context
        const rl4Context = await this.collectRL4Context();

        // Get git remotes and branches
        const { githubRemote, defaultBranch } = await this.getGitConfig();

        return {
            workspaceRoot: this.workspaceRoot,
            timestamp,
            ...gitInfo,
            ...rl4Context,
            githubRemote,
            defaultBranch
        };
    }

    private async collectGitInfo(): Promise<{
        diffStat?: string;
        diffContent?: string;
        filesChanged: string[];
        insertions: number;
        deletions: number;
        netChange: number;
        recentCommits: CommitInfo[];
    }> {
        try {
            // Get diff stat
            const diffStat = execSync('git diff --stat', {
                cwd: this.workspaceRoot,
                encoding: 'utf8'
            }).trim();

            // Get file names
            const diffFiles = execSync('git diff --name-only', {
                cwd: this.workspaceRoot,
                encoding: 'utf8'
            }).trim();

            const filesChanged = diffFiles ? diffFiles.split('\n').filter(f => f.trim()) : [];

            // Get diff content (limited)
            const diffContent = execSync('git diff', {
                cwd: this.workspaceRoot,
                encoding: 'utf8'
            }).trim();

            // Parse insertions/deletions from diff stat
            const statMatch = diffStat.match(/(\d+) insertion(?:s)?\(+\)/);
            const insertions = statMatch ? parseInt(statMatch[1]) : 0;

            const delMatch = diffStat.match(/(\d+) deletion(?:s)?\(-\)/);
            const deletions = delMatch ? parseInt(delMatch[1]) : 0;

            const netChange = insertions - deletions;

            // Get recent commits
            const recentLog = execSync('git log --oneline -5', {
                cwd: this.workspaceRoot,
                encoding: 'utf8'
            }).trim();

            const recentCommits = recentLog ? recentLog.split('\n').map(line => {
                const parts = line.split(' ');
                const hash = parts[0];
                const message = parts.slice(1).join(' ');

                try {
                    const commitInfo = execSync(`git show --format="%an|%ad" --no-patch ${hash}`, {
                        cwd: this.workspaceRoot,
                        encoding: 'utf8'
                    }).trim();

                    const [author, date] = commitInfo.split('|');

                    return { hash, author, date, message };
                } catch {
                    return { hash, author: 'Unknown', date: 'Unknown', message };
                }
            }) : [];

            return {
                diffStat: diffStat || undefined,
                diffContent: diffContent ? this.truncateDiff(diffContent) : undefined,
                filesChanged,
                insertions,
                deletions,
                netChange,
                recentCommits
            };

        } catch (error) {
            // Return empty context if git commands fail
            return {
                filesChanged: [],
                insertions: 0,
                deletions: 0,
                netChange: 0,
                recentCommits: []
            };
        }
    }

    private async collectRL4Context(): Promise<{
        activeADRs: ADRInfo[];
        detectedPattern?: PatternInfo;
        timelineContext: TimelineItem[];
    }> {
        const rl4Path = path.join(this.workspaceRoot, '.reasoning_rl4');

        // Collect active ADRs
        const activeADRs = await this.collectActiveADRs(rl4Path);

        // Detect patterns
        const detectedPattern = await this.detectPattern(rl4Path);

        // Collect timeline context
        const timelineContext = await this.collectTimelineContext(rl4Path);

        return {
            activeADRs,
            detectedPattern,
            timelineContext
        };
    }

    private async collectActiveADRs(rl4Path: string): Promise<ADRInfo[]> {
        const adrs: ADRInfo[] = [];
        const adrsPath = path.join(rl4Path, 'adrs', 'auto');

        if (!fs.existsSync(adrsPath)) {
            return adrs;
        }

        try {
            const files = fs.readdirSync(adrsPath).filter(f => f.endsWith('.json'));

            for (const file of files.slice(0, 10)) { // Limit to 10 ADRs
                try {
                    const content = JSON.parse(fs.readFileSync(path.join(adrsPath, file), 'utf8'));
                    adrs.push({
                        id: content.id || file.replace('.json', ''),
                        title: content.title || 'Untitled ADR',
                        status: content.status || 'proposed'
                    });
                } catch {
                    // Skip invalid files
                }
            }
        } catch {
            // Ignore errors
        }

        return adrs;
    }

    private async detectPattern(rl4Path: string): Promise<PatternInfo | undefined> {
        // Simple pattern detection based on file changes
        try {
            const patternsPath = path.join(rl4Path, 'patterns.json');

            if (fs.existsSync(patternsPath)) {
                const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'));

                if (patterns.length > 0) {
                    const latestPattern = patterns[patterns.length - 1];

                    return {
                        type: latestPattern.type || 'unknown',
                        confidence: latestPattern.confidence || 0.5,
                        indicators: latestPattern.indicators || []
                    };
                }
            }
        } catch {
            // Ignore errors
        }

        return undefined;
    }

    private async collectTimelineContext(rl4Path: string): Promise<TimelineItem[]> {
        const timelineContext: TimelineItem[] = [];
        const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);

        try {
            // Check recent file modifications in .reasoning_rl4
            const recentFiles = this.findRecentFiles(rl4Path, twoHoursAgo);

            for (const file of recentFiles.slice(0, 20)) { // Limit to 20 files
                timelineContext.push({
                    file: path.relative(rl4Path, file),
                    edits: 1 // Simplified - just count as one edit
                });
            }
        } catch {
            // Ignore errors
        }

        return timelineContext;
    }

    private findRecentFiles(dir: string, since: number): string[] {
        const recentFiles: string[] = [];

        if (!fs.existsSync(dir)) {
            return recentFiles;
        }

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    recentFiles.push(...this.findRecentFiles(fullPath, since));
                } else if (entry.isFile()) {
                    const stats = fs.statSync(fullPath);

                    if (stats.mtime.getTime() > since) {
                        recentFiles.push(fullPath);
                    }
                }
            }
        } catch {
            // Ignore errors
        }

        return recentFiles;
    }

    private async getGitConfig(): Promise<{
        githubRemote: string;
        defaultBranch: string;
    }> {
        try {
            // Get remote URL
            const remoteUrl = execSync('git remote get-url origin', {
                cwd: this.workspaceRoot,
                encoding: 'utf8'
            }).trim();

            // Extract remote name (remove .git and convert to ssh format if needed)
            const githubRemote = remoteUrl
                .replace(/\.git$/, '')
                .replace(/^https:\/\/github\.com\//, 'git@github.com:')
                .replace(/^git@github\.com:/, 'git@github.com:');

            // Get default branch
            const defaultBranch = execSync('git symbolic-ref refs/remotes/origin/HEAD | sed \'s@^refs/remotes/origin/@@\'', {
                cwd: this.workspaceRoot,
                encoding: 'utf8'
            }).trim() || 'main';

            return { githubRemote, defaultBranch };

        } catch {
            // Fallback values
            return {
                githubRemote: 'origin',
                defaultBranch: 'main'
            };
        }
    }

    private truncateDiff(diff: string): string {
        const lines = diff.split('\n');

        if (lines.length <= 100) {
            return diff;
        }

        // Take first 100 lines
        const truncated = lines.slice(0, 100).join('\n');
        return truncated + '\n... (diff truncated)';
    }
}