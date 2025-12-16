import * as fs from 'fs';
import * as path from 'path';
import { CognitiveLogger } from '../core/CognitiveLogger';
import { DiagnosticsArtifactsGuard } from './DiagnosticsArtifactsGuard';

export interface UpgradeReport {
    repairedFiles: string[];
    historyTouched: boolean;
    coreReset: boolean;
    upgradeApplied: boolean;
    existingArtifactsTouched: boolean;
}

interface JsonlRepairResult {
    touched: boolean;
    corrupted: boolean;
    created: boolean;
}

const ensureDir = (dirPath: string) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

const minimalPlan = () => `---
version: 4.0
updated: '${new Date().toISOString()}'
confidence: 0.50
---
# Plan — Auto Recovery

P4-UX recovered automatically.
`;

const minimalTasks = () => `# Tasks — Auto Recovery

## Active (P4-UX)
- [ ] Recovery placeholder @rl4:id=RECOVERY-P4
  - Auto-generated during upgrade.
`;

const minimalContext = () => `---
updated: '${new Date().toISOString()}'
state: "p4-ux-recovery"
---
kpis_llm:
  status: "unknown"
kpis_kernel:
  status: "unknown"
`;

const writeTextIfNeeded = (filePath: string, generator: () => string): boolean => {
    try {
        if (!fs.existsSync(filePath)) {
            ensureDir(path.dirname(filePath));
            fs.writeFileSync(filePath, generator(), 'utf-8');
            return true;
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        if (content.trim().length === 0) {
            fs.writeFileSync(filePath, generator(), 'utf-8');
            return true;
        }
        return false;
    } catch {
        fs.writeFileSync(filePath, generator(), 'utf-8');
        return true;
    }
};

const writeJsonIfNeeded = <T>(filePath: string, generator: () => T): boolean => {
    try {
        if (!fs.existsSync(filePath)) {
            ensureDir(path.dirname(filePath));
            fs.writeFileSync(filePath, JSON.stringify(generator(), null, 2), 'utf-8');
            return true;
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        JSON.parse(content);
        return false;
    } catch {
        fs.writeFileSync(filePath, JSON.stringify(generator(), null, 2), 'utf-8');
        return true;
    }
};

const repairJsonlFile = (filePath: string, logger?: CognitiveLogger): JsonlRepairResult => {
    ensureDir(path.dirname(filePath));
    const existed = fs.existsSync(filePath);
    if (!existed) {
        fs.writeFileSync(filePath, '', 'utf-8');
        return { touched: true, corrupted: false, created: true };
    }
    let modified = false;
    let corrupted = false;
    while (true) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim().length > 0);
        let parseErrorIndex: number | null = null;
        for (let i = 0; i < lines.length; i++) {
            try {
                JSON.parse(lines[i]);
            } catch {
                parseErrorIndex = i;
                break;
            }
        }
        if (parseErrorIndex === null) {
            return { touched: modified, corrupted, created: false };
        }
        if (lines.length === 0) {
            fs.writeFileSync(filePath, '', 'utf-8');
            return { touched: true, corrupted: true, created: false };
        }
        lines.splice(parseErrorIndex, 1);
        fs.writeFileSync(filePath, lines.length ? lines.join('\n') + '\n' : '', 'utf-8');
        modified = true;
        corrupted = true;
        logger?.warning(`[Upgrade] Truncated corrupt JSONL (${path.basename(filePath)})`);
    }
};

const governancePath = (workspaceRoot: string, fileName: string) =>
    path.join(workspaceRoot, '.reasoning_rl4', 'governance', fileName);

const ensureDevTasks = (filePath: string, report: UpgradeReport) => {
    try {
        if (!fs.existsSync(filePath)) {
            ensureDir(path.dirname(filePath));
            fs.writeFileSync(
                filePath,
                JSON.stringify({ version: 1, tasks: [], history: [] }, null, 2),
                'utf-8'
            );
            report.repairedFiles.push(path.join('dev', 'dev-tasks.json'));
            return;
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.history)) {
            throw new Error('invalid dev tasks structure');
        }
    } catch {
        fs.writeFileSync(
            filePath,
            JSON.stringify({ version: 1, tasks: [], history: [] }, null, 2),
            'utf-8'
        );
        report.repairedFiles.push(path.join('dev', 'dev-tasks.json'));
    }
};

const migrateLegacyDevTasksIfNeeded = (rl4Path: string, canonicalPath: string, report: UpgradeReport, logger?: CognitiveLogger) => {
    const legacyPath = path.join(rl4Path, 'dev-tasks.json');
    if (!fs.existsSync(legacyPath)) {
        return;
    }
    ensureDir(path.dirname(canonicalPath));
    if (!fs.existsSync(canonicalPath)) {
        fs.renameSync(legacyPath, canonicalPath);
        logger?.system('[Upgrade] Migrated legacy dev-tasks.json into dev/dev-tasks.json');
        report.repairedFiles.push(path.join('dev', 'dev-tasks.json'));
    } else {
        const backupName = `dev-tasks.${Date.now()}.legacy.json`;
        const backupPath = path.join(rl4Path, backupName);
        fs.renameSync(legacyPath, backupPath);
        logger?.warning(`[Upgrade] Found duplicate legacy dev-tasks.json — backed up as ${backupName}`);
        report.repairedFiles.push(backupName);
    }
};

export function runUpgradeCheck(workspaceRoot: string, logger?: CognitiveLogger): UpgradeReport {
    const report: UpgradeReport = {
        repairedFiles: [],
        historyTouched: false,
        coreReset: false,
        upgradeApplied: false,
        existingArtifactsTouched: false
    };
    const rl4Path = path.join(workspaceRoot, '.reasoning_rl4');
    ensureDir(rl4Path);

    const preExistingArtifacts = new Set<string>();
    const trackExisting = (relative: string) => {
        const absolute = path.join(rl4Path, relative);
        if (fs.existsSync(absolute)) {
            preExistingArtifacts.add(relative);
        }
    };

    const planPath = governancePath(workspaceRoot, 'Plan.RL4');
    trackExisting('governance/Plan.RL4');
    if (writeTextIfNeeded(planPath, minimalPlan)) {
        report.repairedFiles.push('Plan.RL4');
        report.coreReset = true;
    }
    const tasksPath = governancePath(workspaceRoot, 'Tasks.RL4');
    trackExisting('governance/Tasks.RL4');
    if (writeTextIfNeeded(tasksPath, minimalTasks)) {
        report.repairedFiles.push('Tasks.RL4');
        report.coreReset = true;
    }
    const contextPath = governancePath(workspaceRoot, 'Context.RL4');
    trackExisting('governance/Context.RL4');
    const contextChanged = writeTextIfNeeded(contextPath, minimalContext);
    if (contextChanged) {
        report.repairedFiles.push('Context.RL4');
        report.coreReset = true;
    }

    const diagnosticsGuard = new DiagnosticsArtifactsGuard(workspaceRoot);
    const created = diagnosticsGuard.ensureArtifactsSync();
    if (created.length > 0) {
        report.repairedFiles.push(...created);
    }

    const cycleMetricsRelative = path.join('diagnostics', 'metrics', 'cycle-metrics.jsonl');
    const cycleMetricsPath = path.join(rl4Path, cycleMetricsRelative);
    trackExisting(cycleMetricsRelative);
    const cycleRepair = repairJsonlFile(cycleMetricsPath, logger);
    if (cycleRepair.touched) {
        report.repairedFiles.push(cycleMetricsRelative);
    }
    const llmMetricsRelative = path.join('diagnostics', 'metrics', 'llm-metrics.jsonl');
    const llmMetricsPath = path.join(rl4Path, llmMetricsRelative);
    trackExisting(llmMetricsRelative);
    const llmRepair = repairJsonlFile(llmMetricsPath, logger);
    if (llmRepair.touched) {
        report.repairedFiles.push(llmMetricsRelative);
    }

    const historyRelative = path.join('dev', 'dev-actions.jsonl');
    const historyPath = path.join(rl4Path, historyRelative);
    ensureDir(path.dirname(historyPath));
    const historyExisted = fs.existsSync(historyPath);
    const historyRepair = repairJsonlFile(historyPath, logger);
    if (historyRepair.touched) {
        report.repairedFiles.push(historyRelative);
    }
    if (historyExisted && historyRepair.corrupted) {
        report.historyTouched = true;
    }

    const devTasksRelative = path.join('dev', 'dev-tasks.json');
    const devTasksPath = path.join(rl4Path, devTasksRelative);
    trackExisting(devTasksRelative);
    migrateLegacyDevTasksIfNeeded(rl4Path, devTasksPath, report, logger);
    ensureDir(path.dirname(devTasksPath));
    ensureDevTasks(devTasksPath, report);

    if (report.coreReset) {
        fs.writeFileSync(contextPath, minimalContext(), 'utf-8');
        if (!report.repairedFiles.includes('Context.RL4')) {
            report.repairedFiles.push('Context.RL4');
        }
    }

    report.repairedFiles = Array.from(new Set(report.repairedFiles));
    report.upgradeApplied = report.repairedFiles.length > 0;
    report.existingArtifactsTouched = report.repairedFiles.some(file => preExistingArtifacts.has(file));

    if (report.upgradeApplied) {
        logger?.system(`🛠️ Upgrade applied (${report.repairedFiles.join(', ')})`);
    }

    return report;
}

export function repairJsonlForRuntime(filePath: string, logger?: CognitiveLogger): boolean {
    return repairJsonlFile(filePath, logger).touched;
}
