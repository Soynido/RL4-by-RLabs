import * as path from 'path';
import * as fs from 'fs';

/**
 * RulesInstaller - RL6
 *
 * Installs RL4 governance rules in the workspace for LLM calibration.
 * These rules are invariant and ensure LLM behaves according to RL4 governance.
 */

export interface RuleInstallationResult {
    success: boolean;
    rulesInstalled: string[];
    errors: string[];
}

export class RulesInstaller {

    constructor(private workspaceRoot: string) {}

    /**
     * Install RL4 rules in .cursor/rules directory
     */
    async installRules(): Promise<RuleInstallationResult> {
        const result: RuleInstallationResult = {
            success: false,
            rulesInstalled: [],
            errors: []
        };

        try {
            // Create .cursor/rules directory
            const rulesDir = path.join(this.workspaceRoot, '.cursor', 'rules');
            await fs.promises.mkdir(rulesDir, { recursive: true });

            // Install Agent System rules (highest priority)
            const systemRuleResult = await this.installRule(
                'RL4.Agent.System.mdc',
                path.join(__dirname, '..', 'rules', 'RL4.Agent.System.mdc'),
                rulesDir
            );

            if (systemRuleResult) {
                result.rulesInstalled.push('RL4.Agent.System.mdc');
            } else {
                result.errors.push('Failed to install RL4.Agent.System.mdc');
            }

            // Install Core governance rules (high priority)
            const coreRuleResult = await this.installRule(
                'RL4.Core.mdc',
                path.join(__dirname, '..', 'rules', 'RL4.Core.mdc'),
                rulesDir
            );

            if (coreRuleResult) {
                result.rulesInstalled.push('RL4.Core.mdc');
            } else {
                result.errors.push('Failed to install RL4.Core.mdc');
            }

            result.success = result.rulesInstalled.length === 2 && result.errors.length === 0;

        } catch (error: any) {
            result.errors.push(`Installation failed: ${error.message}`);
            result.success = false;
        }

        return result;
    }

    /**
     * Install single rule file
     */
    private async installRule(
        ruleName: string,
        sourcePath: string,
        targetDir: string
    ): Promise<boolean> {
        try {
            const targetPath = path.join(targetDir, ruleName);

            // Check if source exists
            if (!fs.existsSync(sourcePath)) {
                console.error(`[RulesInstaller] Source rule not found: ${sourcePath}`);
                return false;
            }

            // Copy rule file
            const sourceContent = await fs.promises.readFile(sourcePath, 'utf8');
            await fs.promises.writeFile(targetPath, sourceContent, 'utf8');

            console.log(`[RulesInstaller] Installed rule: ${ruleName}`);
            return true;

        } catch (error: any) {
            console.error(`[RulesInstaller] Failed to install ${ruleName}:`, error.message);
            return false;
        }
    }

    /**
     * Verify rules are properly installed
     */
    async verifyInstallation(): Promise<{ installed: string[]; missing: string[] }> {
        const rulesDir = path.join(this.workspaceRoot, '.cursor', 'rules');
        const expectedRules = ['RL4.Agent.System.mdc', 'RL4.Core.mdc'];

        const installed: string[] = [];
        const missing: string[] = [];

        for (const rule of expectedRules) {
            const rulePath = path.join(rulesDir, rule);
            if (fs.existsSync(rulePath)) {
                installed.push(rule);
            } else {
                missing.push(rule);
            }
        }

        return { installed, missing };
    }

    /**
     * Check if rules need update (source newer than target)
     */
    async needsUpdate(): Promise<boolean> {
        try {
            const rulesDir = path.join(this.workspaceRoot, '.cursor', 'rules');
            const sourceDir = path.join(__dirname, '..', 'rules');

            for (const rule of ['RL4.Agent.System.mdc', 'RL4.Core.mdc']) {
                const sourcePath = path.join(sourceDir, rule);
                const targetPath = path.join(rulesDir, rule);

                if (!fs.existsSync(targetPath)) {
                    return true; // Needs installation
                }

                if (fs.existsSync(sourcePath)) {
                    const sourceStats = await fs.promises.stat(sourcePath);
                    const targetStats = await fs.promises.stat(targetPath);

                    if (sourceStats.mtime > targetStats.mtime) {
                        return true; // Needs update
                    }
                }
            }

            return false; // Up to date
        } catch (error) {
            console.error('[RulesInstaller] Error checking update status:', error);
            return true; // Err on side of caution
        }
    }
}