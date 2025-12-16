import * as vscode from 'vscode';
import * as path from 'path';
import { KernelAPI } from './kernel/KernelAPI';
import { KernelCommands } from './commands/KernelCommands';
import { RL4Commands } from './commands/RL4Commands';
import { ADRValidationCommands } from './commands/ADRValidationCommands';
import { RL4ActivityBarProvider } from './RL4ActivityBarProvider';
import { KernelBridge } from './kernel/process/KernelBridge';
import { detectWorkspaceState } from './kernel/onboarding/OnboardingDetector';
import { loadKernelConfig } from './kernel/config';
import { runUpgradeCheck } from './kernel/bootstrap/UpgradeGuard';
import { IDEActivityListener } from './kernel/inputs/IDEActivityListener';
import { BuildMetricsListener } from './kernel/inputs/BuildMetricsListener';
import { CognitiveLogger } from './kernel/core/CognitiveLogger';
import { AppendOnlyWriter } from './kernel/AppendOnlyWriter';
import { CommitPromptGenerator } from './kernel/api/CommitPromptGenerator';
import { SnapshotReminder } from './kernel/api/SnapshotReminder';
import { TimeMachinePromptBuilder } from './kernel/api/TimeMachinePromptBuilder';

/**
 * RL4 Extension Main Entry Point
 *
 * This is the main activation entry point for the Reasoning Layer 4 VSIX extension.
 * It coordinates:
 * - Kernel process lifecycle management
 * - VS Code command registration
 * - Activity bar integration
 * - Extension context management
 */

let kernelAPI: KernelAPI;
let kernelBridge: KernelBridge;
let activityBarProvider: RL4ActivityBarProvider | null = null;
let outputChannel: vscode.OutputChannel;
let ideActivityListener: IDEActivityListener | null = null;
let buildMetricsListener: BuildMetricsListener | null = null;

export async function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('RL4 Extension');
    
    // Afficher l'output channel automatiquement
    outputChannel.show(true);
    
    outputChannel.appendLine(`[${new Date().toISOString()}] RL4 Extension activating...`);

    try {
        // Get workspace root
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            outputChannel.appendLine(`[${new Date().toISOString()}] ⚠️ No workspace folder found - extension will activate when workspace is opened`);
            vscode.window.showWarningMessage('RL4 Extension: Please open a workspace folder to activate the kernel');
            return;
        }

        outputChannel.appendLine(`[${new Date().toISOString()}] Workspace root: ${workspaceRoot}`);

        // Step 1: Detect workspace state (OnboardingDetector)
        outputChannel.appendLine(`[${new Date().toISOString()}] 🔍 Detecting workspace state...`);
        const workspaceState = await detectWorkspaceState(workspaceRoot);
        outputChannel.appendLine(`[${new Date().toISOString()}] Workspace mode: ${workspaceState.mode} (confidence: ${workspaceState.confidence})`);
        outputChannel.appendLine(`[${new Date().toISOString()}] ${workspaceState.recommendation}`);

        // Step 2: Load kernel configuration
        outputChannel.appendLine(`[${new Date().toISOString()}] ⚙️ Loading kernel configuration...`);
        const kernelConfig = loadKernelConfig(workspaceRoot);
        outputChannel.appendLine(`[${new Date().toISOString()}] Kernel config loaded (cycle interval: ${kernelConfig.cognitive_cycle_interval_ms}ms)`);

        // Step 3: Run upgrade check (repair artifacts)
        outputChannel.appendLine(`[${new Date().toISOString()}] 🛠️ Running upgrade check...`);
        const logger = new CognitiveLogger(workspaceRoot, 'normal');
        const upgradeReport = runUpgradeCheck(workspaceRoot, logger);
        if (upgradeReport.upgradeApplied) {
            outputChannel.appendLine(`[${new Date().toISOString()}] ✅ Upgrade applied: ${upgradeReport.repairedFiles.join(', ')}`);
        } else {
            outputChannel.appendLine(`[${new Date().toISOString()}] ✅ No upgrade needed`);
        }

        // Step 4: Initialize kernel bridge and API
        kernelBridge = new KernelBridge(context.extensionPath, logger);
        kernelAPI = new KernelAPI(kernelBridge, logger, workspaceRoot);

        // Step 5: Start kernel process via bridge
        await kernelBridge.start();
        
        // Step 6: Initialize status bar
        initializeStatusBar(context);

        // Step 7: Initialize IDE Activity Listener
        outputChannel.appendLine(`[${new Date().toISOString()}] 👁️ Initializing IDE Activity Listener...`);
        const tracesDir = path.join(workspaceRoot, '.reasoning_rl4', 'traces');
        const ideActivityWriter = new AppendOnlyWriter(path.join(tracesDir, 'ide_activity.jsonl'));
        await ideActivityWriter.init();
        ideActivityListener = new IDEActivityListener(workspaceRoot, ideActivityWriter, outputChannel);
        await ideActivityListener.start();
        context.subscriptions.push({
            dispose: () => {
                ideActivityListener?.dispose();
                ideActivityListener?.stop();
            }
        });

        // Step 8: Initialize Build Metrics Listener
        outputChannel.appendLine(`[${new Date().toISOString()}] 🔨 Initializing Build Metrics Listener...`);
        const buildMetricsWriter = new AppendOnlyWriter(path.join(tracesDir, 'build_metrics.jsonl'));
        await buildMetricsWriter.init();
        buildMetricsListener = new BuildMetricsListener(workspaceRoot, buildMetricsWriter, outputChannel);
        await buildMetricsListener.start();
        context.subscriptions.push({
            dispose: () => {
                buildMetricsListener?.dispose();
                buildMetricsListener?.stop();
            }
        });

        // Step 9: Initialize command handlers
        const kernelCommands = new KernelCommands(kernelAPI);
        kernelCommands.registerCommands(context);
        
        const rl4Commands = new RL4Commands(workspaceRoot);
        rl4Commands.registerCommands(context);
        
        // Register ADR validation commands
        ADRValidationCommands.registerCommands(context, workspaceRoot);
        outputChannel.appendLine(`[${new Date().toISOString()}] ✅ ADR validation commands registered`);

        // Step 10: Initialize Activity Bar Provider
        activityBarProvider = new RL4ActivityBarProvider(context, kernelAPI);
        activityBarProvider.register();
        context.subscriptions.push(activityBarProvider);

        // Install RL4 governance rules for LLM calibration
        try {
            const rulesResult = await kernelAPI.installRules();
            if (rulesResult.success) {
                outputChannel.appendLine(`[${new Date().toISOString()}] ✅ RL4 governance rules installed: ${rulesResult.rulesInstalled.join(', ')}`);
            } else {
                outputChannel.appendLine(`[${new Date().toISOString()}] ⚠️ Rules installation failed: ${rulesResult.errors.join(', ')}`);
            }
        } catch (error: any) {
            outputChannel.appendLine(`[${new Date().toISOString()}] ⚠️ Failed to install RL4 rules: ${error.message}`);
        }

        // Register workspace event handlers
        registerWorkspaceEventHandlers(context);

        // Show success message
        const activationTime = new Date().toISOString().substring(11, 23);
        vscode.window.showInformationMessage(
            `[${activationTime}] 🧠 RL4 Extension activated successfully`
        );

        outputChannel.appendLine(`[${new Date().toISOString()}] RL4 Extension activation complete`);

    } catch (error) {
        const errorMsg = `Failed to activate RL4 Extension: ${error}`;
        outputChannel.appendLine(`[${new Date().toISOString()}] ERROR: ${errorMsg}`);
        vscode.window.showErrorMessage(errorMsg);
    }
}

export async function deactivate() {
    outputChannel.appendLine(`[${new Date().toISOString()}] RL4 Extension deactivating...`);

    try {
        // Cleanup kernel bridge and API
        if (kernelAPI) {
            await kernelAPI.shutdown();
        }
        if (kernelBridge) {
            kernelBridge.stop();
        }

        // Cleanup IDE Activity Listener
        if (ideActivityListener) {
            ideActivityListener.dispose();
            await ideActivityListener.stop();
        }

        // Cleanup Build Metrics Listener
        if (buildMetricsListener) {
            buildMetricsListener.dispose();
            await buildMetricsListener.stop();
        }

        // Cleanup activity bar provider
        if (activityBarProvider) {
            activityBarProvider.dispose();
        }

        // Dispose output channel
        if (outputChannel) {
            outputChannel.dispose();
        }

        outputChannel.appendLine(`[${new Date().toISOString()}] RL4 Extension deactivated`);

    } catch (error) {
        console.error('Error during extension deactivation:', error);
    }
}

/**
 * Register workspace event handlers for file system changes
 */
function registerWorkspaceEventHandlers(context: vscode.ExtensionContext) {
    // File change events
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');

    fileWatcher.onDidCreate(uri => {
        outputChannel.appendLine(`[${new Date().toISOString()}] File created: ${uri.fsPath}`);
    });

    fileWatcher.onDidChange(uri => {
        outputChannel.appendLine(`[${new Date().toISOString()}] File changed: ${uri.fsPath}`);
    });

    fileWatcher.onDidDelete(uri => {
        outputChannel.appendLine(`[${new Date().toISOString()}] File deleted: ${uri.fsPath}`);
    });

    context.subscriptions.push(fileWatcher);

    // Configuration change events
    const configWatcher = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('rl4')) {
            outputChannel.appendLine(`[${new Date().toISOString()}] RL4 configuration changed`);
        }
    });

    context.subscriptions.push(configWatcher);
}

/**
 * Initialize minimal status bar item
 */
function initializeStatusBar(context: vscode.ExtensionContext) {
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    
    statusBarItem.text = '$(brain) RL4';
    statusBarItem.tooltip = 'Reasoning Layer 4 - Kernel running';
    statusBarItem.command = 'rl4.showOutput';
    statusBarItem.show();
    
    context.subscriptions.push(statusBarItem);
    
    // Register command to show output
    const showOutputCommand = vscode.commands.registerCommand('rl4.showOutput', () => {
        if (outputChannel) {
            outputChannel.show(true);
        }
    });
    
    context.subscriptions.push(showOutputCommand);
}