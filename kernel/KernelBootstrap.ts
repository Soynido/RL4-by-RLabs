import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import * as fs from 'fs';

/**
 * KernelBootstrap - RL6 Kernel Process Launcher
 * 
 * Spawns the kernel process (entrypoint.js) and manages its lifecycle.
 * Simple spawn + stdout/stderr logging. No complex IPC yet.
 */
export class KernelBootstrap {
    private context: vscode.ExtensionContext;
    private outputChannel: vscode.OutputChannel;
    private kernelProcess: child_process.ChildProcess | null = null;
    private workspaceRoot: string = '';

    constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
        this.context = context;
        this.outputChannel = outputChannel;
    }

    /**
     * Bootstrap the kernel process
     * @param workspaceRoot Workspace root path
     */
    bootstrap(workspaceRoot: string): void {
        this.workspaceRoot = workspaceRoot;

        const entrypointPath = path.join(
            this.context.extensionPath,
            'out',
            'extension',
            'kernel',
            'process',
            'entrypoint.js'
        );

        if (!fs.existsSync(entrypointPath)) {
            throw new Error(`Kernel entrypoint not found: ${entrypointPath}`);
        }

        this.outputChannel.appendLine(`[${new Date().toISOString()}] 🚀 Spawning kernel process: ${entrypointPath}`);

        // Spawn kernel process
        this.kernelProcess = child_process.spawn(
            'node',
            [entrypointPath, workspaceRoot],
            {
                cwd: workspaceRoot,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    NODE_ENV: process.env.NODE_ENV || 'development'
                }
            }
        );

        // Handle stdout
        this.kernelProcess.stdout?.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n').filter(line => line.trim());
            for (const line of lines) {
                this.outputChannel.appendLine(`[KERNEL] ${line}`);
                
                // Detect KERNEL_READY signal
                if (line.includes('KERNEL_READY:true')) {
                    this.outputChannel.appendLine(`[${new Date().toISOString()}] ✅ Kernel ready`);
                }
            }
        });

        // Handle stderr
        this.kernelProcess.stderr?.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n').filter(line => line.trim());
            for (const line of lines) {
                this.outputChannel.appendLine(`[KERNEL ERROR] ${line}`);
            }
        });

        // Handle process exit
        this.kernelProcess.on('exit', (code, signal) => {
            if (code !== null) {
                this.outputChannel.appendLine(`[${new Date().toISOString()}] ⚠️ Kernel process exited with code ${code}`);
            } else if (signal) {
                this.outputChannel.appendLine(`[${new Date().toISOString()}] ⚠️ Kernel process killed by signal ${signal}`);
            }
            this.kernelProcess = null;
        });

        // Handle process error
        this.kernelProcess.on('error', (error) => {
            this.outputChannel.appendLine(`[${new Date().toISOString()}] ❌ Kernel process error: ${error.message}`);
        });
    }

    /**
     * Shutdown the kernel process
     */
    shutdown(): void {
        if (this.kernelProcess) {
            this.outputChannel.appendLine(`[${new Date().toISOString()}] 🛑 Shutting down kernel process...`);
            this.kernelProcess.kill('SIGTERM');
            
            // Force kill after 5 seconds if still running
            setTimeout(() => {
                if (this.kernelProcess && !this.kernelProcess.killed) {
                    this.outputChannel.appendLine(`[${new Date().toISOString()}] ⚠️ Force killing kernel process`);
                    this.kernelProcess.kill('SIGKILL');
                }
            }, 5000);
        }
    }
}
