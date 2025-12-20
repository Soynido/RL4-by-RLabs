import * as vscode from 'vscode';
import * as path from 'path';
import { AppendOnlyWriter } from '../kernel/AppendOnlyWriter';

/**
 * TerminalTrackingCommands
 * - Permet au LLM de tracer explicitement les commandes terminal
 * - Append-only vers .reasoning_rl4/terminal-events.jsonl
 * - Mode passif (observabilité pure)
 */
export class TerminalTrackingCommands {
  private writer: AppendOnlyWriter;
  private initialized: boolean = false;

  constructor(workspaceRoot: string) {
    const eventsPath = path.join(workspaceRoot, '.reasoning_rl4', 'terminal-events.jsonl');
    this.writer = new AppendOnlyWriter(eventsPath, { fsync: false, mkdirRecursive: true });
  }

  async init(): Promise<void> {
    if (!this.initialized) {
      await this.writer.init();
      this.initialized = true;
    }
  }

  registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('rl4.trackCommand', (cmd: string, taskId?: string) =>
        this.trackCommandStart(cmd, taskId)
      ),
      vscode.commands.registerCommand('rl4.trackCommandEnd', (cmd: string, exitCode: number, taskId?: string) =>
        this.trackCommandEnd(cmd, exitCode, taskId)
      )
    );
  }

  private async trackCommandStart(command: string, taskId?: string): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
    await this.writer.append({
      timestamp: new Date().toISOString(),
      type: 'command_start',
      command,
      taskId,
      terminal: 'RL4'
    });
  }

  private async trackCommandEnd(command: string, exitCode: number, taskId?: string): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
    await this.writer.append({
      timestamp: new Date().toISOString(),
      type: 'command_end',
      command,
      exitCode,
      taskId,
      terminal: 'RL4'
    });
  }
}

