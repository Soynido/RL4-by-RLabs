import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getGlobalLedger } from '../kernel/rbom/index';
import { ILogger } from '../kernel/core/ILogger';
import { repairJsonlForRuntime, runUpgradeCheck } from '../kernel/bootstrap/UpgradeGuard';

export class RL4Commands {
    private workspaceRoot: string;
    private logger: ILogger | null;

    constructor(workspaceRoot: string, logger?: ILogger | null) {
        this.workspaceRoot = workspaceRoot;
        this.logger = logger || null;
    }

    registerCommands(context: vscode.ExtensionContext) {
        // RL4 core functionality commands
        const openTerminalCommand = vscode.commands.registerCommand(
            'rl4.openTerminal',
            () => this.openRL4Terminal()
        );

        const repairLedgerCommand = vscode.commands.registerCommand(
            'rl4.repairLedger',
            () => this.repairLedger()
        );

        const repairKernelCommand = vscode.commands.registerCommand(
            'rl4.repairKernel',
            () => this.repairKernel()
        );

        // ❌ SUPPRIMÉ : rl4.toggleWebview est déjà enregistré dans extension.ts
        // Ne pas enregistrer ici pour éviter le conflit

        context.subscriptions.push(
            openTerminalCommand,
            repairLedgerCommand,
            repairKernelCommand
        );
    }

    private async openRL4Terminal() {
        try {
            // Check if RL4 terminal already exists
            const existingTerminal = vscode.window.terminals.find(
                terminal => terminal.name === 'RL4 Terminal'
            );

            if (existingTerminal) {
                existingTerminal.show();
                this.logger?.system('Existing RL4 Terminal shown');
            } else {
                // Create new RL4 terminal with proper environment
                const terminal = vscode.window.createTerminal({
                    name: 'RL4 Terminal',
                    cwd: this.workspaceRoot,
                    env: {
                        ...process.env,
                        RL4_ACTIVE: 'true',
                        RL4_ROOT: path.join(this.workspaceRoot, '.reasoning_rl4')
                    }
                });

                terminal.show();

                // Show welcome message
                const timestamp = new Date().toISOString().substring(11, 23);
                terminal.sendText(`echo "[${timestamp}] 🧠 RL4 Terminal Ready"`);

                this.logger?.system('New RL4 Terminal created');
            }
        } catch (error) {
            const errorMsg = `Failed to open RL4 terminal: ${error}`;
            vscode.window.showErrorMessage(errorMsg);
            this.logger?.error(errorMsg);
        }
    }

    private async repairLedger() {
        try {
            const timestamp = new Date().toISOString().substring(11, 23);
            this.logger?.system(`[${timestamp}] 🔧 Starting ledger repair...`);

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Repairing RL4 Ledger',
                    cancellable: false
                },
                async (progress) => {
                    progress.report({ increment: 0, message: 'Repairing ledger files...' });

                    const ledgerDir = path.join(this.workspaceRoot, '.reasoning_rl4', 'ledger');
                    
                    let repairedCount = 0;
                    const filesToRepair = [
                        path.join(ledgerDir, 'rbom.jsonl'),
                        path.join(ledgerDir, 'cycles.jsonl')
                    ];

                    for (const filePath of filesToRepair) {
                        if (fs.existsSync(filePath)) {
                            const repaired = repairJsonlForRuntime(filePath, undefined);
                            if (repaired) {
                                repairedCount++;
                                this.logger?.system(`[${timestamp}] ✅ Repaired: ${path.basename(filePath)}`);
                            }
                        }
                    }

                    progress.report({ increment: 100, message: 'Repair complete' });

                    const message = repairedCount > 0 
                        ? `Ledger repair completed: ${repairedCount} file(s) repaired`
                        : 'Ledger repair completed: No corruption found';
                    
            vscode.window.showInformationMessage(message);
                    this.logger?.success(`[${timestamp}] Ledger repair completed: ${repairedCount} file(s) repaired`);
                }
            );

        } catch (error) {
            const errorMsg = `Ledger repair failed: ${error}`;
            vscode.window.showErrorMessage(errorMsg);
            this.logger?.error(errorMsg);
        }
    }

    private async repairKernel() {
        try {
            const timestamp = new Date().toISOString().substring(11, 23);
            this.logger?.system(`[${timestamp}] 🔧 Starting kernel repair...`);

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Repairing RL4 Kernel',
                    cancellable: false
                },
                async (progress) => {
                    progress.report({ increment: 0, message: 'Running upgrade check...' });

                    const report = runUpgradeCheck(this.workspaceRoot, undefined);

                    progress.report({ increment: 100, message: 'Repair complete' });

                    const message = report.upgradeApplied
                        ? `Kernel repair completed: ${report.repairedFiles.length} file(s) repaired`
                        : 'Kernel repair completed: No issues found';
                    
                    vscode.window.showInformationMessage(message);
                    this.logger?.success(`[${timestamp}] Kernel repair completed: ${report.repairedFiles.join(', ')}`);
                }
            );

        } catch (error) {
            const errorMsg = `Kernel repair failed: ${error}`;
            vscode.window.showErrorMessage(errorMsg);
            this.logger?.error(errorMsg);
        }
    }

}