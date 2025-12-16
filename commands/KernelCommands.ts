import * as vscode from 'vscode';
import { KernelAPI } from '../kernel/KernelAPI';

export class KernelCommands {
    private kernelAPI: KernelAPI;
    private outputChannel: vscode.OutputChannel;

    constructor(kernelAPI: KernelAPI) {
        this.kernelAPI = kernelAPI;
        this.outputChannel = vscode.window.createOutputChannel('RL4 Kernel');
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
            this.outputChannel.appendLine(`[STATUS] ${new Date().toISOString()}`);
            this.outputChannel.appendLine(message);
        } catch (error) {
            const errorMsg = `Failed to get kernel status: ${error}`;
            vscode.window.showErrorMessage(errorMsg);
            this.outputChannel.appendLine(`[ERROR] ${errorMsg}`);
        }
    }

    private async showKernelReflection() {
        try {
            const cycleHealth = await this.kernelAPI.getLastCycleHealth();
            if (cycleHealth && cycleHealth.cycleId > 0) {
                const message = `Last Cycle #${cycleHealth.cycleId}: ${cycleHealth.duration}ms, ${cycleHealth.phases.length} phases, ${cycleHealth.success ? 'Success' : 'Failed'}`;
                vscode.window.showInformationMessage(message);
                this.outputChannel.appendLine(`[REFLECT] ${new Date().toISOString()}`);
                this.outputChannel.appendLine(message);
            } else {
                vscode.window.showInformationMessage('No cycle data available');
            }
        } catch (error) {
            const errorMsg = `Failed to get kernel reflection: ${error}`;
            vscode.window.showErrorMessage(errorMsg);
            this.outputChannel.appendLine(`[ERROR] ${errorMsg}`);
        }
    }

    private async flushKernel() {
        try {
            await this.kernelAPI.flush();
            vscode.window.showInformationMessage('Kernel flushed successfully');
            this.outputChannel.appendLine(`[FLUSH] ${new Date().toISOString()} - Kernel flushed`);
        } catch (error) {
            const errorMsg = `Failed to flush kernel: ${error}`;
            vscode.window.showErrorMessage(errorMsg);
            this.outputChannel.appendLine(`[ERROR] ${errorMsg}`);
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
            this.outputChannel.appendLine(`[WHEREAMI] ${new Date().toISOString()}`);
            this.outputChannel.appendLine(message);
        } catch (error) {
            const errorMsg = `Failed to get kernel location: ${error}`;
            vscode.window.showErrorMessage(errorMsg);
            this.outputChannel.appendLine(`[ERROR] ${errorMsg}`);
        }
    }
}