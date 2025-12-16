import * as vscode from 'vscode';
import { KernelAPI, KernelStatus } from './kernel/KernelAPI';

/**
 * RL4 Activity Bar Provider
 *
 * Provides the activity bar integration for RL4 with:
 * - Status indicator
 * - Quick access commands
 * - Kernel state visualization
 * - Terminal access
 */

export class RL4ActivityBarProvider {
    private statusBarItem: vscode.StatusBarItem;
    private context: vscode.ExtensionContext;
    private kernelAPI: KernelAPI;

    constructor(context: vscode.ExtensionContext, kernelAPI: KernelAPI) {
        this.context = context;
        this.kernelAPI = kernelAPI;
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );

        this.setupStatusBarItem();
    }

    /**
     * Register the activity bar provider
     */
    register() {
        // Register status bar item
        this.context.subscriptions.push(this.statusBarItem);

        // Register tree data provider for activity bar
        const treeDataProvider = new RL4TreeDataProvider(this.kernelAPI);
        const treeView = vscode.window.createTreeView('rl4Activity', {
            treeDataProvider,
            showCollapseAll: true
        });

        this.context.subscriptions.push(treeView);

        // Register tree item commands
        this.registerTreeCommands();

        // Start status update loop
        this.startStatusUpdates();
    }

    /**
     * Setup the status bar item
     */
    private setupStatusBarItem() {
        this.statusBarItem.text = '$(brain) RL4';
        this.statusBarItem.tooltip = 'Reasoning Layer 4 - Click for status';
        this.statusBarItem.command = 'reasoning.kernel.status';
        this.statusBarItem.show();
    }

    /**
     * Register commands for the activity bar tree
     */
    private registerTreeCommands() {
        // Terminal access command
        const terminalCommand = vscode.commands.registerCommand(
            'rl4.activity.openTerminal',
            () => {
                vscode.commands.executeCommand('rl4.openTerminal');
            }
        );

        // Status command
        const statusCommand = vscode.commands.registerCommand(
            'rl4.activity.showStatus',
            () => {
                vscode.commands.executeCommand('reasoning.kernel.status');
            }
        );

        // Reflection command
        const reflectCommand = vscode.commands.registerCommand(
            'rl4.activity.showReflection',
            () => {
                vscode.commands.executeCommand('reasoning.kernel.reflect');
            }
        );

        // Dashboard command
        const dashboardCommand = vscode.commands.registerCommand(
            'rl4.activity.toggleDashboard',
            () => {
                vscode.commands.executeCommand('rl4.toggleWebview');
            }
        );

        this.context.subscriptions.push(
            terminalCommand,
            statusCommand,
            reflectCommand,
            dashboardCommand
        );
    }

    /**
     * Start periodic status updates
     */
    private startStatusUpdates() {
        const updateStatus = async () => {
            try {
                const status = await this.kernelAPI.status();
                this.updateStatusBar(status);
            } catch (error) {
                // Kernel not available, show offline status
                this.statusBarItem.text = '$(brain-slash) RL4 (Offline)';
                this.statusBarItem.tooltip = 'RL4 Kernel Offline - Click to retry';
            }
        };

        // Update immediately
        updateStatus();

        // Update every 5 seconds
        const interval = setInterval(updateStatus, 5000);

        // Cleanup on disposal
        this.context.subscriptions.push({
            dispose: () => clearInterval(interval)
        });
    }

    /**
     * Update status bar based on kernel status
     */
    private updateStatusBar(status: KernelStatus) {
        if (status.running) {
            const uptimeMin = Math.floor(status.uptime / 60);
            this.statusBarItem.text = `$(pulse) RL4 (${uptimeMin}m)`;
            this.statusBarItem.tooltip = `RL4 Running - Uptime: ${uptimeMin}min, Timers: ${status.timers}`;
        } else {
            this.statusBarItem.text = '$(brain-slash) RL4 (Offline)';
            this.statusBarItem.tooltip = 'RL4 Kernel Offline';
        }
    }

    /**
     * Dispose resources
     */
    dispose() {
        if (this.statusBarItem) {
            this.statusBarItem.dispose();
        }
    }
}

/**
 * Tree Data Provider for RL4 Activity Bar
 */
class RL4TreeDataProvider implements vscode.TreeDataProvider<RL4TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<RL4TreeItem | undefined | null> = new vscode.EventEmitter<RL4TreeItem | undefined | null>();
    readonly onDidChangeTreeData: vscode.Event<RL4TreeItem | undefined | null> = this._onDidChangeTreeData.event;

    constructor(private kernelAPI: KernelAPI) {}

    getTreeItem(element: RL4TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: RL4TreeItem): Thenable<RL4TreeItem[]> {
        if (!element) {
            // Root level items
            return Promise.resolve(this.getRootItems());
        }

        if (element.children) {
            return Promise.resolve(element.children);
        }

        return Promise.resolve([]);
    }

    private async getRootItems(): Promise<RL4TreeItem[]> {
        const status = await this.kernelAPI.status().catch(() => ({ running: false, uptime: 0, health: {}, timers: 0, queueSize: 0, version: '1.0.0' }));

        return [
            new RL4TreeItem(
                'Kernel Status',
                vscode.TreeItemCollapsibleState.None,
                'rl4.activity.showStatus',
                status.running ? '$(pulse)' : '$(brain)',
                `State: ${status.running ? 'running' : 'offline'}`
            ),
            new RL4TreeItem(
                'RL4 Terminal',
                vscode.TreeItemCollapsibleState.None,
                'rl4.activity.openTerminal',
                '$(terminal)',
                'Open RL4 terminal with environment'
            ),
            new RL4TreeItem(
                'Dashboard',
                vscode.TreeItemCollapsibleState.None,
                'rl4.activity.toggleDashboard',
                '$(graph)',
                'Toggle RL4 cognitive dashboard'
            ),
            new RL4TreeItem(
                'Last Reflection',
                vscode.TreeItemCollapsibleState.None,
                'rl4.activity.showReflection',
                '$(history)',
                'View last cycle reflection'
            )
        ];
    }
}

/**
 * Tree Item class for RL4 Activity Bar
 */
class RL4TreeItem extends vscode.TreeItem {
    public children?: RL4TreeItem[];

    constructor(
        public label: string,
        public collapsibleState: vscode.TreeItemCollapsibleState,
        commandId?: string,
        iconPath?: string | vscode.ThemeIcon,
        tooltip?: string
    ) {
        super(label, collapsibleState);

        if (commandId) {
            this.command = {
                command: commandId,
                title: label
            };
        }

        if (iconPath) {
            this.iconPath = iconPath;
        }

        if (tooltip) {
            this.tooltip = tooltip;
        }
    }
}