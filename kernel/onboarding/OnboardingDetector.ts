/**
 * OnboardingDetector - Detect workspace state for adaptive first-time experience
 * 
 * Analyzes Git history, file structure, and activity to determine:
 * - "existing": Project with significant history (recommend reconstruction)
 * - "new": Fresh project (recommend quick setup)
 * - "ambiguous": Unclear state (ask user to clarify)
 * 
 * Part of Phase E6 - Dual-Mode Onboarding
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface WorkspaceState {
    mode: 'existing' | 'new' | 'ambiguous';
    confidence: number; // 0.0-1.0
    evidence: {
        git_commits: number;
        git_age_days: number;
        git_contributors: number;
        files_count: number;
        source_files_count: number; // .ts, .js, .py, .java, etc.
        has_package_json: boolean;
        has_git: boolean;
        recent_activity: boolean; // commits in last 7 days
        first_commit_date: string | null;
        last_commit_date: string | null;
        recent_commits_3_months: number; // commits in last 90 days
    };
    recommendation: string;
    // P5-ONBOARDING: Large project detection + GitHub gate
    isLargeProject: boolean;
    requiresGitHubConnect: boolean;
    largeProjectReason?: string;
    firstUseMode?: 'standard' | 'extended';
    firstUseReasons?: string[];
}

/**
 * Detect workspace state by analyzing Git history and file structure
 */
export async function detectWorkspaceState(workspaceRoot: string): Promise<WorkspaceState> {
    const evidence = {
        git_commits: 0,
        git_age_days: 0,
        git_contributors: 0,
        files_count: 0,
        source_files_count: 0,
        has_package_json: false,
        has_git: false,
        recent_activity: false,
        first_commit_date: null as string | null,
        last_commit_date: null as string | null,
        recent_commits_3_months: 0
    };

    try {
        // Check Git presence
        const gitDir = path.join(workspaceRoot, '.git');
        evidence.has_git = fs.existsSync(gitDir);

        if (evidence.has_git) {
            // Count commits
            try {
                const commitCountOutput = execSync('git rev-list --count HEAD', {
                    cwd: workspaceRoot,
                    encoding: 'utf-8',
                    stdio: ['pipe', 'pipe', 'ignore']
                }).trim();
                evidence.git_commits = parseInt(commitCountOutput, 10) || 0;
            } catch (e) {
                // No commits yet (empty repo)
                evidence.git_commits = 0;
            }

            // Get first commit date
            if (evidence.git_commits > 0) {
                try {
                    const firstCommitDate = execSync('git log --reverse --format=%ai --date=iso | head -1', {
                        cwd: workspaceRoot,
                        encoding: 'utf-8',
                        stdio: ['pipe', 'pipe', 'ignore']
                    }).trim();
                    evidence.first_commit_date = firstCommitDate || null;

                    if (evidence.first_commit_date) {
                        const firstDate = new Date(evidence.first_commit_date);
                        const now = new Date();
                        evidence.git_age_days = Math.floor((now.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
                    }
                } catch (e) {
                    // Ignore error
                }
            }

            // Get last commit date
            if (evidence.git_commits > 0) {
                try {
                    const lastCommitDate = execSync('git log -1 --format=%ai --date=iso', {
                        cwd: workspaceRoot,
                        encoding: 'utf-8',
                        stdio: ['pipe', 'pipe', 'ignore']
                    }).trim();
                    evidence.last_commit_date = lastCommitDate || null;

                    if (evidence.last_commit_date) {
                        const lastDate = new Date(evidence.last_commit_date);
                        const now = new Date();
                        const daysSinceLastCommit = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
                        evidence.recent_activity = daysSinceLastCommit <= 7;
                    }
                } catch (e) {
                    // Ignore error
                }
            }

            // Count contributors
            if (evidence.git_commits > 0) {
                try {
                    const contributorsOutput = execSync('git log --format="%an" | sort -u | wc -l', {
                        cwd: workspaceRoot,
                        encoding: 'utf-8',
                        stdio: ['pipe', 'pipe', 'ignore']
                    }).trim();
                    evidence.git_contributors = parseInt(contributorsOutput, 10) || 1;
                } catch (e) {
                    evidence.git_contributors = 1;
                }
            }

            // Count recent commits (last 3 months)
            if (evidence.git_commits > 0) {
                try {
                    const recentCommitsOutput = execSync('git rev-list --count --since="90 days ago" HEAD', {
                        cwd: workspaceRoot,
                        encoding: 'utf-8',
                        stdio: ['pipe', 'pipe', 'ignore']
                    }).trim();
                    evidence.recent_commits_3_months = parseInt(recentCommitsOutput, 10) || 0;
                } catch (e) {
                    evidence.recent_commits_3_months = 0;
                }
            }
        }

        // Count files (excluding common ignore patterns)
        evidence.files_count = countFiles(workspaceRoot);
        evidence.source_files_count = countSourceFiles(workspaceRoot);
        evidence.has_package_json = fs.existsSync(path.join(workspaceRoot, 'package.json'));

    } catch (error) {
        console.error('OnboardingDetector: Error during detection', error);
    }

    // Determine mode (includes all calculations)
    const mode = determineMode(evidence);
    const recommendation = formatWorkspaceState(mode, evidence);

    // Large project detection
    const { isLargeProject, largeProjectReason } = detectLargeProject(evidence);

    // First use mode detection
    const { firstUseMode, firstUseReasons } = determineFirstUseMode(evidence);

    return {
        mode,
        confidence: calculateConfidence(mode, evidence),
        evidence,
        recommendation,
        isLargeProject,
        requiresGitHubConnect: mode === 'existing' && isLargeProject,
        largeProjectReason: isLargeProject ? largeProjectReason : undefined,
        firstUseMode,
        firstUseReasons: firstUseReasons && firstUseReasons.length > 0 ? firstUseReasons : undefined
    };
}

/**
 * Count total files (excluding common ignore patterns)
 */
function countFiles(root: string): number {
    let count = 0;
    const ignoreDirs = ['.git', 'node_modules', '.reasoning_rl4', '.reasoning', 'dist', 'out', 'build', '.vscode'];
    
    function traverse(dir: string) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (ignoreDirs.includes(entry.name)) {
                    continue;
                }
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    traverse(fullPath);
                } else {
                    count++;
                }
            }
        } catch (e) {
            // Ignore errors
        }
    }
    
    traverse(root);
    return count;
}

/**
 * Count source files only
 */
function countSourceFiles(root: string): number {
    let count = 0;
    const ignoreDirs = ['.git', 'node_modules', '.reasoning_rl4', '.reasoning', 'dist', 'out', 'build', '.vscode', '__pycache__', '.pytest_cache', 'vendor', 'target'];
    const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.rb', '.php', '.cs', '.cpp', '.c', '.h', '.swift', '.kt', '.scala', '.vue', '.svelte'];
    
    function traverse(dir: string) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (ignoreDirs.includes(entry.name)) {
                    continue;
                }
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    traverse(fullPath);
                } else {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (sourceExtensions.includes(ext)) {
                        count++;
                    }
                }
            }
        } catch (e) {
            // Ignore errors
        }
    }
    
    traverse(root);
    return count;
}

/**
 * Determine workspace mode based on evidence
 */
function determineMode(evidence: WorkspaceState['evidence']): 'new' | 'existing' | 'ambiguous' {
    if (!evidence.has_git) {
        return 'new';
    }

    if (evidence.git_commits === 0) {
        return 'new';
    }

    if (evidence.git_commits >= 50 && evidence.files_count >= 20) {
        return 'existing';
    }

    if (evidence.git_commits >= 20 && evidence.files_count >= 10) {
        return 'existing';
    }

    if (evidence.git_commits < 5 && evidence.files_count < 10) {
        return 'new';
    }

    return 'ambiguous';
}

/**
 * Calculate confidence score
 */
function calculateConfidence(mode: string, evidence: WorkspaceState['evidence']): number {
    let confidence = 0.5;

    if (mode === 'existing') {
        if (evidence.git_commits >= 50 && evidence.files_count >= 20) {
            confidence = 0.95;
        } else if (evidence.git_commits >= 20 && evidence.files_count >= 10) {
            confidence = 0.85;
        } else {
            confidence = 0.6;
        }
    } else if (mode === 'new') {
        if (!evidence.has_git) {
            confidence = 0.95;
        } else if (evidence.git_commits === 0) {
            confidence = 0.9;
        } else if (evidence.git_commits < 5 && evidence.files_count < 10) {
            confidence = 0.85;
        } else {
            confidence = 0.6;
        }
    }

    // Boost confidence for recent activity
    if (evidence.recent_activity && mode === 'existing') {
        confidence = Math.min(confidence + 0.05, 1.0);
    }

    // Boost confidence for multiple contributors
    if (evidence.git_contributors > 1 && mode === 'existing') {
        confidence = Math.min(confidence + 0.05, 1.0);
    }

    // Adjust for package.json presence
    if (evidence.has_package_json && evidence.files_count < 5) {
        // New project with boilerplate
        return 0.8;
    }

    return confidence;
}

/**
 * Format workspace state recommendation
 */
function formatWorkspaceState(mode: string, evidence: WorkspaceState['evidence']): string {
    if (mode === 'existing') {
        let message = `I detect an existing project with:\n`;
        message += `  • ${evidence.git_commits} commits`;
        if (evidence.git_age_days > 0) {
            message += ` across ${evidence.git_age_days} days`;
        }
        message += '\n';
        if (evidence.git_contributors > 1) {
            message += `  • ${evidence.git_contributors} contributors\n`;
        }
        message += `  • ${evidence.files_count} files`;
        if (evidence.has_package_json) {
            message += ' (Node.js project)';
        }
        message += '\n';
        if (evidence.recent_activity) {
            message += '  • Recent activity (last 7 days)\n';
        }
        message += '\n';
        message += `Recommendation: ${mode === 'existing' ? 'Reconstruct cognitive history from Git' : 'Start fresh with RL4'}`;
        return message;
    } else if (mode === 'new') {
        let message = `I detect a new project:\n`;
        if (evidence.has_git && evidence.git_commits === 0) {
            message += '  • Git initialized (no commits yet)\n';
        } else if (evidence.has_git) {
            message += `  • ${evidence.git_commits} commits (early stage)\n`;
        } else {
            message += '  • No Git history\n';
        }
        message += `  • ${evidence.files_count} files\n`;
        message += '\n';
        message += 'Recommendation: Start fresh with RL4 from now.';
        return message;
    } else {
        let message = `I detect an ambiguous project state:\n`;
        message += `  • ${evidence.git_commits} commits\n`;
        message += `  • ${evidence.files_count} files\n`;
        message += '\n';
        message += 'Recommendation: You can choose to reconstruct history or start fresh.';
        return message;
    }
}

/**
 * Detect if this is a large project
 */
function detectLargeProject(evidence: WorkspaceState['evidence']): { isLargeProject: boolean; largeProjectReason?: string } {
    const reasons: string[] = [];
    
    if (evidence.recent_commits_3_months > 50) {
        reasons.push(`${evidence.recent_commits_3_months} commits in last 3 months`);
    }
    if (evidence.source_files_count > 100) {
        reasons.push(`${evidence.source_files_count} source files`);
    }
    if (evidence.git_age_days > 180) {
        reasons.push(`${Math.floor(evidence.git_age_days / 30)} months of history`);
    }
    
    return {
        isLargeProject: reasons.length > 0,
        largeProjectReason: reasons.length > 0 ? `Large project detected: ${reasons.join(', ')}` : undefined
    };
}

/**
 * Determine first use mode (standard vs extended)
 */
function determineFirstUseMode(evidence: WorkspaceState['evidence']): { firstUseMode: 'standard' | 'extended'; firstUseReasons?: string[] } {
    const fileCount = evidence.files_count || 0;
    
    if (fileCount > 20) {
        return {
            firstUseMode: 'extended',
            firstUseReasons: [`files_count_excluding_rl4=${fileCount}`]
        };
    }
    
    return {
        firstUseMode: 'standard',
        firstUseReasons: undefined
    };
}
