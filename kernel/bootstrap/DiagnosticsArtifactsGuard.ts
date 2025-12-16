import * as fs from 'fs';
import * as path from 'path';

/**
 * DiagnosticsArtifactsGuard
 * 
 * Ensures all required diagnostic artifacts exist.
 * Creates missing files with minimal valid structure.
 */
export class DiagnosticsArtifactsGuard {
    private workspaceRoot: string;
    private rl4Path: string;
    
    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.rl4Path = path.join(workspaceRoot, '.reasoning_rl4');
    }
    
    /**
     * Ensure all diagnostic artifacts exist (synchronous)
     * Returns list of created files
     */
    ensureArtifactsSync(): string[] {
        const created: string[] = [];
        
        // Ensure base directories
        const dirs = [
            path.join(this.rl4Path, 'diagnostics'),
            path.join(this.rl4Path, 'diagnostics', 'metrics'),
            path.join(this.rl4Path, 'diagnostics', 'codec')
        ];
        
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
        
        // Ensure cycle-metrics.jsonl
        const cycleMetricsPath = path.join(this.rl4Path, 'diagnostics', 'metrics', 'cycle-metrics.jsonl');
        if (!fs.existsSync(cycleMetricsPath)) {
            fs.writeFileSync(cycleMetricsPath, '', 'utf-8');
            created.push('diagnostics/metrics/cycle-metrics.jsonl');
        }
        
        // Ensure llm-metrics.jsonl
        const llmMetricsPath = path.join(this.rl4Path, 'diagnostics', 'metrics', 'llm-metrics.jsonl');
        if (!fs.existsSync(llmMetricsPath)) {
            fs.writeFileSync(llmMetricsPath, '', 'utf-8');
            created.push('diagnostics/metrics/llm-metrics.jsonl');
        }
        
        // Ensure health.jsonl
        const healthPath = path.join(this.rl4Path, 'diagnostics', 'health.jsonl');
        if (!fs.existsSync(healthPath)) {
            fs.writeFileSync(healthPath, '', 'utf-8');
            created.push('diagnostics/health.jsonl');
        }
        
        // Ensure codec/latest.json
        const codecLatestPath = path.join(this.rl4Path, 'diagnostics', 'codec', 'latest.json');
        if (!fs.existsSync(codecLatestPath)) {
            const defaultCodec = {
                version: '1.0.0',
                generated_at: new Date().toISOString(),
                status: 'unknown'
            };
            fs.writeFileSync(codecLatestPath, JSON.stringify(defaultCodec, null, 2), 'utf-8');
            created.push('diagnostics/codec/latest.json');
        }
        
        return created;
    }
}
