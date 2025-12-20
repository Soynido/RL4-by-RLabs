import * as vscode from 'vscode';
import * as path from 'path';
import { KernelAPI } from './kernel/KernelAPI';
import { KernelCommands } from './commands/KernelCommands';
import { RL4Commands } from './commands/RL4Commands';
import { ADRValidationCommands } from './commands/ADRValidationCommands';
import { TerminalTrackingCommands } from './commands/TerminalTrackingCommands';
import { RL4ActivityBarProvider } from './RL4ActivityBarProvider';
import { RL4WebViewManager } from './webview/RL4WebViewManager';
import { KernelBridge } from './kernel/process/KernelBridge';
import { detectWorkspaceState } from './kernel/onboarding/OnboardingDetector';
import { loadKernelConfig } from './kernel/config';
import { runUpgradeCheck } from './kernel/bootstrap/UpgradeGuard';
import { IDEActivityListener } from './kernel/inputs/IDEActivityListener';
import { BuildMetricsListener } from './kernel/inputs/BuildMetricsListener';
import { CognitiveLogger, OUTPUT_CHANNEL_NAME } from './kernel/core/CognitiveLogger';
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
let webViewManager: RL4WebViewManager | null = null;
let logger: CognitiveLogger | null = null;
let ideActivityListener: IDEActivityListener | null = null;
let buildMetricsListener: BuildMetricsListener | null = null;
// ✅ Fix 2: Création UNIQUE du channel dans extension.ts
let outputChannel: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext) {
    // 🔥 VERSION CHECK — Preuve runtime que l'activation est appelée
    console.log("🔥 RL4 EXTENSION ACTIVATE — v2025-12-19-19:20");

    try {
        // Get workspace root
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            console.log("⚠️ RL4: No workspace folder found, activation aborted");
            vscode.window.showWarningMessage('RL4 Extension: Please open a workspace folder to activate the kernel');
            return;
        }

        // ✅ Fix 2: Créer le channel UNIQUEMENT ici, une seule fois
        outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
        outputChannel.appendLine("🚀 RL4 extension activated");
        outputChannel.show(true);

        // ✅ Fix 3: Passer le channel au logger (ne pas le créer dans CognitiveLogger)
        CognitiveLogger.initialize(outputChannel);

        // Initialize CognitiveLogger (ne crée plus de channel, utilise celui passé)
        logger = new CognitiveLogger(workspaceRoot, 'normal');
        logger.system('RL4 Extension activating...');

        logger.system(`Workspace root: ${workspaceRoot}`);

        // Step 1: Detect workspace state (OnboardingDetector)
        logger.system('🔍 Detecting workspace state...');
        const workspaceState = await detectWorkspaceState(workspaceRoot);
        logger.system(`Workspace mode: ${workspaceState.mode} (confidence: ${workspaceState.confidence})`);
        logger.narrative(workspaceState.recommendation);

        // Step 2: Load kernel configuration
        logger.system('⚙️ Loading kernel configuration...');
        const kernelConfig = loadKernelConfig(workspaceRoot);
        logger.system(`Kernel config loaded (cycle interval: ${kernelConfig.cognitive_cycle_interval_ms}ms)`);

        // Step 3: Run upgrade check (repair artifacts)
        logger.system('🛠️ Running upgrade check...');
        const upgradeReport = runUpgradeCheck(workspaceRoot, logger);
        if (upgradeReport.upgradeApplied) {
            logger.success(`Upgrade applied: ${upgradeReport.repairedFiles.join(', ')}`);
        } else {
            logger.success('No upgrade needed');
        }

        // Step 4: Initialize kernel bridge and API
        kernelBridge = new KernelBridge(context.extensionPath, logger);
        kernelBridge.setWorkspaceRoot(workspaceRoot); // ✅ Fix 1: Pass workspaceRoot to bridge
        kernelAPI = new KernelAPI(kernelBridge, logger, workspaceRoot, context.extensionPath);

        // Step 5: Start kernel process via bridge
        await kernelBridge.start();
        
        // Step 6: Initialize status bar
        initializeStatusBar(context);

        // Step 7: Initialize IDE Activity Listener
        logger.system('👁️ Initializing IDE Activity Listener...');
        const tracesDir = path.join(workspaceRoot, '.reasoning_rl4', 'traces');
        const ideActivityWriter = new AppendOnlyWriter(path.join(tracesDir, 'ide_activity.jsonl'));
        await ideActivityWriter.init();
        // ✅ Pass logger directly to IDEActivityListener (no separate output channel)
        ideActivityListener = new IDEActivityListener(workspaceRoot, ideActivityWriter, logger);
        await ideActivityListener.start();
        context.subscriptions.push({
            dispose: () => {
                ideActivityListener?.dispose();
                ideActivityListener?.stop();
            }
        });

        // Step 8: Initialize Build Metrics Listener
        logger.system('🔨 Initializing Build Metrics Listener...');
        const buildMetricsWriter = new AppendOnlyWriter(path.join(tracesDir, 'build_metrics.jsonl'));
        await buildMetricsWriter.init();
        // ✅ Pass logger directly to BuildMetricsListener (no separate output channel)
        buildMetricsListener = new BuildMetricsListener(workspaceRoot, buildMetricsWriter, logger);
        await buildMetricsListener.start();
        context.subscriptions.push({
            dispose: () => {
                buildMetricsListener?.dispose();
                buildMetricsListener?.stop();
            }
        });

        // Step 9: Initialize command handlers
        const kernelCommands = new KernelCommands(kernelAPI, logger);
        kernelCommands.registerCommands(context);
        
        const rl4Commands = new RL4Commands(workspaceRoot, logger);
        rl4Commands.registerCommands(context);

        const terminalTrackingCommands = new TerminalTrackingCommands(workspaceRoot);
        await terminalTrackingCommands.init();
        terminalTrackingCommands.registerCommands(context);
        
        // Register ADR validation commands
        ADRValidationCommands.registerCommands(context, workspaceRoot, logger);
        logger.success('ADR validation commands registered');

        // Step 10: Initialize Activity Bar Provider
        activityBarProvider = new RL4ActivityBarProvider(context, kernelAPI);
        activityBarProvider.register();
        context.subscriptions.push(activityBarProvider);

        // Step 11: Initialize WebView Manager
        webViewManager = new RL4WebViewManager(context, kernelAPI);
        const toggleWebviewCommand = vscode.commands.registerCommand('rl4.toggleWebview', () => {
            webViewManager?.show();
        });
        context.subscriptions.push(toggleWebviewCommand);

        // Install RL4 governance rules for LLM calibration
        try {
            const rulesResult = await kernelAPI.installRules();
            if (rulesResult.success) {
                logger.success(`RL4 governance rules installed: ${rulesResult.rulesInstalled.join(', ')}`);
            } else {
                logger.warning(`Rules installation failed: ${rulesResult.errors.join(', ')}`);
            }
        } catch (error: any) {
            logger.warning(`Failed to install RL4 rules: ${error.message}`);
        }

        // Register workspace event handlers
        registerWorkspaceEventHandlers(context);

        // Show success message
        const activationTime = new Date().toISOString().substring(11, 23);
        vscode.window.showInformationMessage(
            `[${activationTime}] 🧠 RL4 Extension activated successfully`
        );

        logger.success('RL4 Extension activation complete');

    } catch (error) {
        const errorMsg = `Failed to activate RL4 Extension: ${error}`;
        if (logger) {
            logger.error(errorMsg);
        } else {
            console.error(errorMsg);
        }
        vscode.window.showErrorMessage(errorMsg);
    }
}

export async function deactivate() {
    if (logger) {
        logger.system('RL4 Extension deactivating...');
    }

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

        // Cleanup WebView manager
        if (webViewManager) {
            webViewManager.dispose();
        }

        // Dispose logger
        if (logger) {
            logger.dispose();
            logger = null;
        }

        // ✅ Fix 2: Dispose the output channel (created in extension.ts)
        if (outputChannel) {
            outputChannel.dispose();
            outputChannel = null as any;
        }

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
        if (logger) {
            logger.verbose(`File created: ${uri.fsPath}`);
        }
    });

    fileWatcher.onDidChange(uri => {
        if (logger) {
            logger.verbose(`File changed: ${uri.fsPath}`);
        }
    });

    fileWatcher.onDidDelete(uri => {
        if (logger) {
            logger.verbose(`File deleted: ${uri.fsPath}`);
        }
    });

    context.subscriptions.push(fileWatcher);

    // FileWatcher for ADRs.RL4 (governance file)
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
        const rl4Path = path.join(workspaceRoot, '.reasoning_rl4', 'governance');
        const adrWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(rl4Path, 'ADRs.RL4')
        );

        adrWatcher.onDidChange(async () => {
            if (logger) {
                logger.system('📜 ADRs.RL4 changed, processing...');
            }
            
            try {
                // Import dependencies dynamically to avoid circular dependencies
                const { ADRParser } = await import('./kernel/api/ADRParser');
                const { RBOMLedger } = await import('./kernel/rbom/RBOMLedger');
                const { ActivityReconstructor } = await import('./kernel/api/ActivityReconstructor');
                const { GroundTruthSystem } = await import('./kernel/ground_truth/GroundTruthSystem');
                
                // Get kernel components (passed from entrypoint or created here)
                const rbomLedger = new RBOMLedger(workspaceRoot);
                await rbomLedger.init();
                
                const activityReconstructor = new ActivityReconstructor(workspaceRoot);
                const groundTruthSystem = new GroundTruthSystem(path.join(workspaceRoot, '.reasoning_rl4'));
                
                const adrParser = new ADRParser(workspaceRoot, rbomLedger, activityReconstructor);
                const result = await adrParser.processADRsFile();
                
                // ✅ INVARIANT RL6: Save structural ADRs to ground_truth
                if (result.structuralADRs.length > 0) {
                    for (const adr of result.structuralADRs) {
                        await groundTruthSystem.saveADR(adr);
                    }
                    if (logger) {
                        logger.system(`✅ ${result.structuralADRs.length} structural ADR(s) saved to ground_truth`);
                    }
                }
                
                if (result.added > 0) {
                    vscode.window.showInformationMessage(
                        `✅ RL4: ${result.added} new ADR(s) added to ledger`
                    );
                    if (logger) {
                        logger.system(`✅ ${result.added} ADR(s) appended to ledger`);
                    }
                    
                    // ✅ INVARIANT RL6: Trigger scheduler cycle (reflect + persist + index)
                    if (kernelAPI) {
                        await kernelAPI.query('reflect', {});
                        if (logger) {
                            logger.system('🔄 Scheduler cycle triggered after ADR update');
                        }
                    }
                }
            } catch (error: any) {
                if (logger) {
                    logger.error(`Failed to process ADRs.RL4: ${error.message}`);
                }
            }
        });

        adrWatcher.onDidCreate(async () => {
            if (logger) {
                logger.system('📜 ADRs.RL4 created, processing...');
            }
            
            try {
                const { ADRParser } = await import('./kernel/api/ADRParser');
                const { RBOMLedger } = await import('./kernel/rbom/RBOMLedger');
                const { ActivityReconstructor } = await import('./kernel/api/ActivityReconstructor');
                const { GroundTruthSystem } = await import('./kernel/ground_truth/GroundTruthSystem');
                
                const rbomLedger = new RBOMLedger(workspaceRoot);
                await rbomLedger.init();
                
                const activityReconstructor = new ActivityReconstructor(workspaceRoot);
                const groundTruthSystem = new GroundTruthSystem(path.join(workspaceRoot, '.reasoning_rl4'));
                
                const adrParser = new ADRParser(workspaceRoot, rbomLedger, activityReconstructor);
                const result = await adrParser.processADRsFile();
                
                if (result.structuralADRs.length > 0) {
                    for (const adr of result.structuralADRs) {
                        await groundTruthSystem.saveADR(adr);
                    }
                }
                
                if (result.added > 0) {
                    vscode.window.showInformationMessage(
                        `✅ RL4: Processed ${result.added} ADR(s)`
                    );
                    if (kernelAPI) {
                        await kernelAPI.query('reflect', {});
                    }
                }
            } catch (error: any) {
                if (logger) {
                    logger.error(`Failed to process ADRs.RL4: ${error.message}`);
                }
            }
        });

        context.subscriptions.push(adrWatcher);
    }

    // Configuration change events
    const configWatcher = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('rl4') && logger) {
            logger.system('RL4 configuration changed');
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
    
    // ✅ Fix 2: Register command to show output (channel created in extension.ts)
    const showOutputCommand = vscode.commands.registerCommand('rl4.showOutput', () => {
        if (outputChannel) {
            outputChannel.show(true);
        }
    });
    
    context.subscriptions.push(showOutputCommand);
}