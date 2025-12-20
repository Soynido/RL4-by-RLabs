import * as fs from 'fs';
import * as path from 'path';

export interface NormalizationReport {
    actions_performed: string[];
    warnings: string[];
    issues_fixed: number;
}

/**
 * DataNormalizer (lightweight)
 * - Placeholder to keep scheduler dependencies satisfied
 * - Performs conservative checks only
 */
export class DataNormalizer {
    constructor(private workspaceRoot: string) {}

    async normalize(): Promise<NormalizationReport> {
        const actions: string[] = [];
        const warnings: string[] = [];

        // Ensure cache directory exists
        try {
            const cacheDir = path.join(this.workspaceRoot, '.reasoning_rl4', 'cache');
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
                actions.push('created cache directory');
            }
        } catch (error) {
            warnings.push(`Failed to ensure cache directory: ${error}`);
        }

        return {
            actions_performed: actions,
            warnings,
            issues_fixed: actions.length,
        };
    }
}


