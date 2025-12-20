import * as vscode from 'vscode';
import { KernelAPI } from '../kernel/KernelAPI';
import { ILogger } from '../kernel/core/ILogger';

export class KernelCommands {
    private kernelAPI: KernelAPI;
    private logger: ILogger | null;

    constructor(kernelAPI: KernelAPI, logger?: ILogger | null) {
        this.kernelAPI = kernelAPI;
        this.logger = logger || null;
    }

    registerCommands(context: vscode.ExtensionContext) {
        // Kernel status and monitoring commands
        const statusCommand = vscode.commands.registerCommand(
            'reasoning.kernel.status',
            () => this.showKernelStatus()
        );

        const reflectCommand = vscode.commands.registerCommand(
            'reasoning.kernel.reflect',
            () => this.showKernelReflection()
        );

        const flushCommand = vscode.commands.registerCommand(
            'reasoning.kernel.flush',
            () => this.flushKernel()
        );

        const whereamiCommand = vscode.commands.registerCommand(
            'reasoning.kernel.whereami',
            () => this.showKernelLocation()
        );

        context.subscriptions.push(
            statusCommand,
            reflectCommand,
            flushCommand,
            whereamiCommand
        );
    }

    private async showKernelStatus() {
        try {
            const status = await this.kernelAPI.status();
            const message = `
RL4 Kernel Status:
Running: ${status.running ? 'Yes' : 'No'}
Uptime: ${Math.floor(status.uptime / 60)}min
Timers: ${status.timers}
Queue Size: ${status.queueSize}
Version: ${status.version}
            `.trim();

            vscode.window.showInformationMessage(message);
            this.logger?.system(`Kernel Status: ${message}`);
        } catch (error) {
            const errorMsg = `Failed to get kernel status: ${error}`;
            vscode.window.showErrorMessage(errorMsg);
            this.logger?.error(errorMsg);
        }
    }

    private async showKernelReflection() {
        try {
            const cycleHealth = await this.kernelAPI.getLastCycleHealth();
            if (cycleHealth && cycleHealth.cycleId > 0) {
                const message = `Last Cycle #${cycleHealth.cycleId}: ${cycleHealth.duration}ms, ${cycleHealth.phases.length} phases, ${cycleHealth.success ? 'Success' : 'Failed'}`;
                vscode.window.showInformationMessage(message);
                this.logger?.system(`Kernel Reflection: ${message}`);
            } else {
                vscode.window.showInformationMessage('No cycle data available');
            }
        } catch (error) {
            const errorMsg = `Failed to get kernel reflection: ${error}`;
            vscode.window.showErrorMessage(errorMsg);
            this.logger?.error(errorMsg);
        }
    }

    private async flushKernel() {
        try {
            await this.kernelAPI.flush();
            vscode.window.showInformationMessage('Kernel flushed successfully');
            this.logger?.system('Kernel flushed successfully');
        } catch (error) {
            const errorMsg = `Failed to flush kernel: ${error}`;
            vscode.window.showErrorMessage(errorMsg);
            this.logger?.error(errorMsg);
        }
    }

    private async showKernelLocation() {
        try {
            const status = await this.kernelAPI.status();
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'Unknown';
            const message = `
Kernel Location:
Workspace: ${workspaceRoot}
RL4 Path: ${workspaceRoot}/.reasoning_rl4
Status: ${status.running ? 'Running' : 'Offline'}
            `.trim();

            vscode.window.showInformationMessage(message);
            this.logger?.system(`Kernel Location: ${message}`);
        } catch (error) {
            const errorMsg = `Failed to get kernel location: ${error}`;
            vscode.window.showErrorMessage(errorMsg);
            this.logger?.error(errorMsg);
        }
    }
}