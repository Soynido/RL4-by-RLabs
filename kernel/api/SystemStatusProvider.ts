/**
 * SystemStatusProvider - System Status and Support
 *
 * Provides system health status, logs export, and FAQ support
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { SystemStatus, FAQItem } from '../types/SystemStatus';
import { ILogger } from '../core/ILogger';

export class SystemStatusProvider {
    constructor(
        private workspaceRoot: string,
        private logger?: ILogger
    ) {}

    /**
     * Reset codec - No-op as codecs are stateless in RL6
     */
    async resetCodec(): Promise<void> {
        // No-op: codecs are stateless in RL6
        // Documented as no-op to prevent confusion
        this.logger?.system('[SystemStatusProvider] Codec reset called (no-op - codecs are stateless)');
        return;
    }

    /**
     * Export logs for support
     */
    async exportLogs(): Promise<string> {
        try {
            const rl4Path = path.join(this.workspaceRoot, '.reasoning_rl4');

            if (!fs.existsSync(rl4Path)) {
                return 'No RL4 directory found';
            }

            const logFiles = await this.collectLogFiles(rl4Path);

            if (logFiles.length === 0) {
                return 'No log files found';
            }

            const logContent: string[] = [];

            for (const logFile of logFiles) {
                const relativePath = path.relative(rl4Path, logFile);
                const content = fs.readFileSync(logFile, 'utf8');

                logContent.push(`=== ${relativePath} ===`);
                logContent.push(content);
                logContent.push('\n');
            }

            const header = [
                `=== RL4 LOGS EXPORT ===`,
                `Generated: ${new Date().toISOString()}`,
                `Workspace: ${this.workspaceRoot}`,
                `Total log files: ${logFiles.length}`,
                `===\n\n`
            ];

            return header.concat(logContent).join('');

        } catch (error) {
            this.logger?.error(`[SystemStatusProvider] Failed to export logs: ${error}`);
            return `Error exporting logs: ${error}`;
        }
    }

    /**
     * Get FAQ items for About tab
     */
    async getFAQ(): Promise<FAQItem[]> {
        // Static FAQ items based on RL6 documentation
        return [
            {
                question: "How do I reset the codec?",
                answer: "Use the Reset Codec button in About tab or run 'rl4 codec:reset' from the command palette. RL4 keeps everything local.",
                category: "codec"
            },
            {
                question: "Can I export logs?",
                answer: "Yes - Use the Export Logs button in About tab or open the logs folder and drag the latest bundle into your ticket.",
                category: "logs"
            },
            {
                question: "What do the severity colors mean?",
                answer: "HIGH (red): Immediate attention needed. MEDIUM (yellow): Plan attention recommended. LOW (green): Normal operation.",
                category: "general"
            },
            {
                question: "How do AutoTasks work?",
                answer: "AutoTasks are automatically detected from LLM proposals and IDE actions. Promote them to RL4 to track them formally.",
                category: "general"
            },
            {
                question: "What is Time Machine?",
                answer: "Time Machine creates historical prompts for any date range, helping you understand what happened and why.",
                category: "general"
            },
            {
                question: "How often should I generate snapshots?",
                answer: "Generate snapshots when starting work, after major changes, or every 1-2 hours. RL6 will remind you if it's been too long.",
                category: "troubleshooting"
            },
            {
                question: "Why does my plan show drift?",
                answer: "Plan drift occurs when tracked work diverges from documented plans. Review and realign when drift is MEDIUM or HIGH.",
                category: "troubleshooting"
            },
            {
                question: "Are my files sent anywhere?",
                answer: "No. RL6 is 100% local. All data stays in your .reasoning_rl4 folder. No data leaves your workspace.",
                category: "general"
            }
        ];
    }

    /**
     * Get system status for About tab
     */
    async getSystemStatus(): Promise<SystemStatus> {
        try {
            const rl4Path = path.join(this.workspaceRoot, '.reasoning_rl4');
            const diagnosticsPath = path.join(rl4Path, 'diagnostics');

            return {
                gitDeltaFixed: await this.checkGitDeltaFixed(rl4Path),
                codecReady: true, // Always ready - codecs are stateless
                diagnosticsReady: fs.existsSync(diagnosticsPath) && fs.existsSync(path.join(diagnosticsPath, 'health.jsonl')),
                lastCheck: new Date().toISOString(),
                version: '1.0.0'
            };

        } catch (error) {
            this.logger?.error(`[SystemStatusProvider] Failed to get system status: ${error}`);

            return {
                gitDeltaFixed: false,
                codecReady: false,
                diagnosticsReady: false,
                lastCheck: new Date().toISOString(),
                version: '1.0.0'
            };
        }
    }

    private async collectLogFiles(rl4Path: string): Promise<string[]> {
        const patterns = [
            path.join(rl4Path, 'traces', '*.jsonl'),
            path.join(rl4Path, 'ledger', '*.jsonl'),
            path.join(rl4Path, 'diagnostics', '**/*.jsonl'),
            path.join(rl4Path, 'logs', '*.log')
        ];

        const logFiles: string[] = [];

        for (const pattern of patterns) {
            try {
                const files = await new Promise<string[]>((resolve, reject) => {
                    glob(pattern, { nodir: true }, (err, files) => {
                        if (err) reject(err);
                        else resolve(files);
                    });
                });

                logFiles.push(...files);
            } catch (error) {
                // Continue with other patterns if one fails
                this.logger?.warning(`[SystemStatusProvider] Failed to glob pattern ${pattern}: ${error}`);
            }
        }

        // Sort by modification time (newest first)
        logFiles.sort((a, b) => {
            const statA = fs.statSync(a);
            const statB = fs.statSync(b);
            return statB.mtime.getTime() - statA.mtime.getTime();
        });

        return logFiles;
    }

    private async checkGitDeltaFixed(rl4Path: string): Promise<boolean> {
        try {
            // Check if there's a recent health report indicating git delta was fixed
            const healthPath = path.join(rl4Path, 'diagnostics', 'health.jsonl');

            if (!fs.existsSync(healthPath)) {
                return false;
            }

            const lines = fs.readFileSync(healthPath, 'utf8').split('\n').filter(line => line.trim());

            if (lines.length === 0) {
                return false;
            }

            // Check last health entry
            const lastLine = lines[lines.length - 1];
            const healthEntry = JSON.parse(lastLine);

            // Look for git delta fixes in recent entries
            const recentEntries = lines.slice(-5); // Last 5 entries

            return recentEntries.some(line => {
                try {
                    const entry = JSON.parse(line);
                    return entry.events?.some((event: any) =>
                        event.type === 'git_delta_fixed' ||
                        event.message?.includes('git delta')
                    );
                } catch {
                    return false;
                }
            });

        } catch (error) {
            this.logger?.warning(`[SystemStatusProvider] Failed to check git delta status: ${error}`);
            return false;
        }
    }
}