/**
 * AnomalyDetector - Simplified Anomaly Detection
 *
 * Provides basic anomaly detection for RL6
 */

import * as fs from 'fs';
import * as path from 'path';
import { AppendOnlyWriter } from '../AppendOnlyWriter';
import { ILogger } from '../core/ILogger';

export interface Anomaly {
    id: string;
    type: string;
    severity: number;
    description: string;
    pointers: string[];
}

export interface Blindspots {
    bursts: number;
    gaps: number;
    samples: number;
    signals: string[];
}

export class AnomalyDetector {
    constructor(
        private workspaceRoot: string,
        private appendWriter: AppendOnlyWriter,
        private logger?: ILogger
    ) {}

    /**
     * Detect blindspots in activity
     */
    async detectBlindspots(): Promise<Blindspots> {
        try {
            const rl4Path = path.join(this.workspaceRoot, '.reasoning_rl4');
            const tracesPath = path.join(rl4Path, 'traces');

            if (!fs.existsSync(tracesPath)) {
                return {
                    bursts: 0,
                    gaps: 0,
                    samples: 0,
                    signals: ['No traces directory found']
                };
            }

            // Simple analysis of trace files
            const traceFiles = fs.readdirSync(tracesPath).filter(f => f.endsWith('.jsonl'));
            let totalEvents = 0;
            let bursts = 0;
            let gaps = 0;

            for (const traceFile of traceFiles) {
                const filePath = path.join(tracesPath, traceFile);
                const content = fs.readFileSync(filePath, 'utf8');
                const lines = content.split('\n').filter(line => line.trim());
                totalEvents += lines.length;

                // Simple burst detection: more than 100 events in a file
                if (lines.length > 100) {
                    bursts++;
                }

                // Simple gap detection: empty lines (simplified)
                const emptyLines = content.split('\n').filter(line => !line.trim()).length;
                if (emptyLines > lines.length * 0.5) {
                    gaps++;
                }
            }

            const signals: string[] = [];
            if (bursts > 0) signals.push(`${bursts} files with high activity bursts`);
            if (gaps > 0) signals.push(`${gaps} files with activity gaps`);
            if (totalEvents < 50) signals.push('Low overall activity detected');

            return {
                bursts,
                gaps,
                samples: traceFiles.length,
                signals
            };

        } catch (error) {
            this.logger?.error(`[AnomalyDetector] Failed to detect blindspots: ${error}`);
            return {
                bursts: 0,
                gaps: 0,
                samples: 0,
                signals: [`Error: ${error}`]
            };
        }
    }

    /**
     * Legacy method for compatibility
     * Returns empty anomalies list (not implemented in simplified version)
     */
    detect(events?: any[]): Anomaly[] {
        return [];
    }
}