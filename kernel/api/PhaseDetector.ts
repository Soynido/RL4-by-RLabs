/**
 * PhaseDetector - Project Phase Detection
 *
 * Reads phase from Context.RL4.phase
 * Simplified version for v1 - no complex heuristics
 */

import * as fs from 'fs';
import * as path from 'path';
import { ILogger } from '../core/ILogger';

export class PhaseDetector {
    private contextPath: string;

    constructor(
        private workspaceRoot: string,
        private logger?: ILogger
    ) {
        this.contextPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'governance', 'Context.RL4');
    }

    /**
     * Detect current project phase
     * Reads Context.RL4.phase if present, otherwise returns "UNKNOWN"
     */
    async detectCurrentPhase(): Promise<string> {
        try {
            if (!fs.existsSync(this.contextPath)) {
                this.logger?.system('[PhaseDetector] Context.RL4 not found, returning UNKNOWN');
                return 'UNKNOWN';
            }

            const content = fs.readFileSync(this.contextPath, 'utf8');

            // Extract phase from context
            const phaseMatch = content.match(/phase:\s*"([^"]+)"/i);
            if (phaseMatch) {
                const phase = phaseMatch[1].toUpperCase();
                this.logger?.system(`[PhaseDetector] Found phase: ${phase}`);
                return phase;
            }

            // Try alternative format
            const altPhaseMatch = content.match(/phase:\s*'([^']+)'/i);
            if (altPhaseMatch) {
                const phase = altPhaseMatch[1].toUpperCase();
                this.logger?.system(`[PhaseDetector] Found phase (alt format): ${phase}`);
                return phase;
            }

            this.logger?.system('[PhaseDetector] No phase found in Context.RL4, returning UNKNOWN');
            return 'UNKNOWN';

        } catch (error) {
            this.logger?.error(`[PhaseDetector] Failed to read Context.RL4: ${error}`);
            return 'UNKNOWN';
        }
    }

    /**
     * Get full context state for debugging
     */
    async getContextState(): Promise<{
        exists: boolean;
        content?: string;
        phase?: string;
        lastModified?: string;
    }> {
        try {
            const exists = fs.existsSync(this.contextPath);

            if (!exists) {
                return { exists: false };
            }

            const content = fs.readFileSync(this.contextPath, 'utf8');
            const stats = fs.statSync(this.contextPath);

            const phase = await this.detectCurrentPhase();

            return {
                exists: true,
                content,
                phase,
                lastModified: stats.mtime.toISOString()
            };

        } catch (error) {
            this.logger?.error(`[PhaseDetector] Failed to get context state: ${error}`);
            return { exists: false };
        }
    }
}