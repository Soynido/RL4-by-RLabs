import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AppendOnlyWriter } from '../AppendOnlyWriter';
import * as vscode from 'vscode';

// RL4 Minimal Types
interface CaptureEvent {
    id: string;
    type: string;
    timestamp: string;
    source: string;
    metadata: any;
}

// RL4 Simple Logger
class SimpleLogger {
    private channel: vscode.OutputChannel | null = null;
    
    setChannel(channel: vscode.OutputChannel) {
        this.channel = channel;
    }
    
    log(message: string) {
        if (this.channel) {
            const timestamp = new Date().toISOString().substring(11, 23);
            this.channel.appendLine(`[${timestamp}] ${message}`);
        }
    }
    
    warn(message: string) {
        this.log(`⚠️ ${message}`);
    }
    
    error(message: string) {
        this.log(`❌ ${message}`);
    }
}

const simpleLogger = new SimpleLogger();

/**
 * IDEActivityListener - Input Layer Component
 * 
 * Captures IDE activity that Agent Cursor observes but RL4 currently misses:
 * - Open files, focused file, recently viewed files
 * - Linter errors (real-time code quality signals)
 * - Time since last edit (idle detection)
 * 
 * This bridges the gap: "90% of work happens between commits" (Test 6)
 * 
 * Features:
 * - Snapshot capture every N cycles
 * - VS Code API integration (visibleTextEditors, getDiagnostics)
 * - Recently viewed files tracking (internal cache)
 * - Linter errors by severity and file
 */
export class IDEActivityListener {
    private workspaceRoot: string;
    private isActive: boolean = false;
    private appendWriter: AppendOnlyWriter | null = null;
    private outputChannel: vscode.OutputChannel | null = null;
    private recentlyViewed: string[] = []; // Cache top 10
    private lastEditTimestamp: number = Date.now();
    private disposables: vscode.Disposable[] = []; // ✅ NEW: Track disposables
    
    constructor(workspaceRoot: string, appendWriter?: AppendOnlyWriter, outputChannel?: vscode.OutputChannel) {
        this.workspaceRoot = workspaceRoot;
        this.appendWriter = appendWriter || null;
        this.outputChannel = outputChannel || null;
        if (this.outputChannel) {
            simpleLogger.setChannel(this.outputChannel);
        }
    }
    
    /**
     * Start monitoring IDE activity
     */
    public async start(): Promise<void> {
        if (this.isActive) {
            simpleLogger.warn('IDEActivityListener already active');
            return;
        }
        
        this.isActive = true;
        simpleLogger.log('👁️ IDEActivityListener started');
        
        // Initialize append writer if needed
        if (!this.appendWriter) {
            const tracesDir = path.join(this.workspaceRoot, '.reasoning_rl4', 'traces');
            if (!fs.existsSync(tracesDir)) {
                fs.mkdirSync(tracesDir, { recursive: true });
            }
            
            const logPath = path.join(tracesDir, 'ide_activity.jsonl');
            this.appendWriter = new AppendOnlyWriter(logPath);
        }
        
        // ✅ FIXED: Store disposables
        // Track active editor changes for recently viewed cache
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor && editor.document) {
                    this.trackRecentlyViewed(editor.document.uri.fsPath);
                    this.lastEditTimestamp = Date.now();
                }
            })
        );
        
        // Track text edits
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(() => {
                this.lastEditTimestamp = Date.now();
            })
        );
    }
    
    /**
     * Capture current IDE state snapshot
     */
    public async captureSnapshot(): Promise<void> {
        if (!this.isActive) {
            return;
        }
        
        try {
            const snapshot = await this.buildSnapshot();
            await this.persistSnapshot(snapshot);
        } catch (error) {
            simpleLogger.error(`Failed to capture IDE snapshot: ${error}`);
        }
    }
    
    /**
     * Build IDE snapshot from current VS Code state
     */
    private async buildSnapshot(): Promise<IDESnapshot> {
        const timestamp = new Date().toISOString();
        
        // 1. Get open files
        const openFiles = vscode.window.visibleTextEditors
            .map(editor => this.normalizeFilePath(editor.document.uri.fsPath))
            .filter(p => p.startsWith(this.workspaceRoot));
        
        // 2. Get focused file
        let focusedFile: { path: string; line: number; column: number } | null = null;
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const filePath = this.normalizeFilePath(activeEditor.document.uri.fsPath);
            if (filePath.startsWith(this.workspaceRoot)) {
                focusedFile = {
                    path: filePath.replace(this.workspaceRoot, '').replace(/^\//, ''),
                    line: activeEditor.selection.active.line + 1, // 1-indexed
                    column: activeEditor.selection.active.character + 1
                };
            }
        }
        
        // 3. Get linter errors
        const linterErrors = this.collectLinterErrors();
        
        // 4. Recently viewed (from cache)
        const recentlyViewed = this.recentlyViewed
            .map(p => p.replace(this.workspaceRoot, '').replace(/^\//, ''))
            .slice(0, 10);
        
        // 5. Time since last edit
        const timeSinceLastEditSec = Math.floor((Date.now() - this.lastEditTimestamp) / 1000);
        
        return {
            timestamp,
            open_files: openFiles.map(p => p.replace(this.workspaceRoot, '').replace(/^\//, '')),
            focused_file: focusedFile,
            linter_errors: linterErrors,
            recently_viewed: recentlyViewed,
            time_since_last_edit_sec: timeSinceLastEditSec
        };
    }
    
    /**
     * Collect linter errors from VS Code diagnostics
     */
    private collectLinterErrors(): {
        total: number;
        by_severity: { error: number; warning: number; info: number };
        by_file: Record<string, number>;
    } {
        const diagnostics = vscode.languages.getDiagnostics();
        
        let total = 0;
        const bySeverity = { error: 0, warning: 0, info: 0 };
        const byFile: Record<string, number> = {};
        
        for (const [uri, diags] of diagnostics) {
            const filePath = this.normalizeFilePath(uri.fsPath);
            if (!filePath.startsWith(this.workspaceRoot)) {
                continue; // Skip files outside workspace
            }
            
            const relPath = filePath.replace(this.workspaceRoot, '').replace(/^\//, '');
            byFile[relPath] = diags.length;
            total += diags.length;
            
            for (const diag of diags) {
                if (diag.severity === vscode.DiagnosticSeverity.Error) {
                    bySeverity.error++;
                } else if (diag.severity === vscode.DiagnosticSeverity.Warning) {
                    bySeverity.warning++;
                } else {
                    bySeverity.info++;
                }
            }
        }
        
        return { total, by_severity: bySeverity, by_file: byFile };
    }
    
    /**
     * Track recently viewed files (internal cache)
     */
    private trackRecentlyViewed(filePath: string): void {
        const normalized = this.normalizeFilePath(filePath);
        
        // Remove if already in list
        this.recentlyViewed = this.recentlyViewed.filter(p => p !== normalized);
        
        // Add to front
        this.recentlyViewed.unshift(normalized);
        
        // Keep only top 10
        if (this.recentlyViewed.length > 10) {
            this.recentlyViewed = this.recentlyViewed.slice(0, 10);
        }
    }
    
    /**
     * Persist snapshot to JSONL
     */
    private async persistSnapshot(snapshot: IDESnapshot): Promise<void> {
        if (!this.appendWriter) {
            return;
        }
        
        const event: CaptureEvent = {
            id: `ide-${Date.now()}-${uuidv4().substring(0, 8)}`,
            type: 'ide_activity',
            timestamp: snapshot.timestamp,
            source: 'IDEActivityListener',
            metadata: snapshot
        };
        
        await this.appendWriter.append(event);
        
        // Log summary
        const summary = `📸 IDE snapshot: ${snapshot.open_files.length} open, ` +
                       `${snapshot.linter_errors.total} linter issues, ` +
                       `idle ${snapshot.time_since_last_edit_sec}s`;
        simpleLogger.log(summary);
    }
    
    /**
     * Normalize file path (resolve symlinks, etc.)
     */
    private normalizeFilePath(filePath: string): string {
        try {
            return fs.realpathSync(filePath);
        } catch (e) {
            return filePath;
        }
    }
    
    /**
     * Stop monitoring
     */
    public async stop(): Promise<void> {
        if (!this.isActive) {
            return;
        }
        
        this.isActive = false;
        
        // Flush final snapshot
        if (this.appendWriter) {
            await this.appendWriter.flush();
        }
        
        simpleLogger.log('👁️ IDEActivityListener stopped');
    }
    
    /**
     * Dispose all event listeners (CRITICAL for memory leak prevention)
     */
    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        simpleLogger.log('👁️ IDEActivityListener disposed (all listeners cleaned)');
    }
    
    /**
     * Get current status
     */
    public getStatus(): { active: boolean; recently_viewed_count: number } {
        return {
            active: this.isActive,
            recently_viewed_count: this.recentlyViewed.length
        };
    }
}

/**
 * IDE Snapshot Interface
 */
export interface IDESnapshot {
    timestamp: string;
    open_files: string[];
    focused_file: {
        path: string;
        line: number;
        column: number;
    } | null;
    linter_errors: {
        total: number;
        by_severity: { error: number; warning: number; info: number };
        by_file: Record<string, number>;
    };
    recently_viewed: string[];
    time_since_last_edit_sec: number;
}
