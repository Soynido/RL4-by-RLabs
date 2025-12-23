import * as fs from "fs";
import * as path from "path";
import { ILogger, Verbosity } from "./ILogger";

// Optional vscode import for headless mode support
let vscode: any = null;
try {
    vscode = require("vscode");
} catch {
    // vscode not available (headless mode)
}

/******************************************************************************************
 * RL4 CognitiveLogger — Final Edition
 *
 *  • Contains NO intelligence. Only formatting, display utilities, persistence & structure.
 *  • Serves as the real-time cognitive console for RL4 Kernel.
 *
 * Features:
 *  - Original RL4 ASCII banner (preserved exactly)
 *  - OutputChannel named "RL4 by RLabs" (created in extension.ts, passed via initialize())
 *  - Console output (headless mode / child process)
 *  - Hierarchical logging (SYSTEM / CYCLE / COGNITION / OUTPUT)
 *  - Silent/minimal/normal/debug verbosity
 *  - Structured JSONL logging
 *  - Live Feed block
 *  - Session Status block
 *  - RL4 Atlas block
 *  - OutputChannel auto-rotation to avoid memory leaks
 ******************************************************************************************/

// ✅ Fix 1: Nom unique, définitif, global
export const OUTPUT_CHANNEL_NAME = "RL4 by RLabs";

/**
 * ✅ Fix 4: Detect if we're in a child process (forked process)
 * Child processes have process.send defined (IPC channel) OR RL4_PROCESS=kernel env flag
 */
function isChildProcess(): boolean {
    return typeof process !== 'undefined' && (
        typeof process.send === 'function' ||
        process.argv.includes('--rl4-kernel') ||
        process.env.RL4_PROCESS === 'kernel'
    );
}

export class CognitiveLogger implements ILogger {
    // ✅ Fix 3: CognitiveLogger = façade, PAS créateur
    private static channel?: any; // vscode.OutputChannel | null
    
    private verbosity: Verbosity;
    private workspaceRoot: string;
    private headless: boolean;

    private structuredLogPath: string;
    private outputLines = 0;
    private readonly MAX_OUTPUT = 2000; // ✅ Fix 4: Reduced from 4000 to 2000 for more frequent rotation
    private lastMessages: Map<string, number> = new Map(); // ✅ OPTIMISATION: Déduplication des messages répétés
    private readonly DEDUP_WINDOW_MS = 60000; // ✅ OPTIMISATION: Ignorer message identique pendant 1 minute

    /**
     * ✅ Fix 3: Initialize the logger with a channel (called from extension.ts)
     * CognitiveLogger ne crée rien, il consomme ce qu'on lui donne
     */
    static initialize(channel: any): void {
        CognitiveLogger.channel = channel;
    }

    constructor(workspaceRoot: string, verbosity: Verbosity = "minimal") {
        // 🔥 VERSION CHECK — Preuve runtime que le bon code est actif
        console.log("🔥 RL4 VERSION CHECK — CognitiveLogger v2025-12-19-18:55");
        
        this.workspaceRoot = workspaceRoot;
        this.verbosity = verbosity;
        this.headless = !vscode;

        // ✅ Fix 4: HARD BLOCK - Child process ne doit JAMAIS créer de channel
        if (isChildProcess()) {
            // Child process: no channel, use console/IPC only
            return;
        }

        this.ensureDirectories();

        // Structured logs
        this.structuredLogPath = path.join(
            workspaceRoot,
            ".reasoning_rl4",
            "logs",
            "structured.jsonl"
        );

        // Render UI blocks on startup
        this.renderHeader();
        this.renderRL4Atlas();
        this.renderLiveFeed();
        this.renderSessionStatus();
    }

    /******************************************************************************************
     * DIRECTORY SETUP
     ******************************************************************************************/
    private ensureDirectories() {
        const logsDir = path.join(this.workspaceRoot, ".reasoning_rl4", "logs");
        if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    }

    /******************************************************************************************
     * RL4 ORIGINAL ASCII HEADER
     ******************************************************************************************/
    private renderHeader() {
        this.line("");
        this.line("____/\\\\\\\\\\\\\\\\\\______/\\\\\\__________________________________/\\\\\\______________");
        this.line("__/\\\\\\///////\\\\\\___\\/\\\\\\________________________________/\\\\\\\\\\\\______________");
        this.line("_\\/\\\\\\_____\\/\\\\\\___\\/\\\\\\______________________________/\\\\\\/\\\\\\______________");
        this.line(" _\\/\\\\\\\\\\\\\\\\\\\\\\/____\\/\\\\\\____________________________/\\\\\\/\\/\\\\\\______________");
        this.line("  _\\/\\\\\\//////\\\\\\____\\/\\\\\\__________________________/\\\\\\/__\\/\\\\\\______________");
        this.line("   _\\/\\\\\\____\\//\\\\\\___\\/\\\\\\________________________/\\\\\\\\\\\\\\\\\\\\\\\\\\___________");
        this.line("    _\\/\\\\\\_____\\//\\\\\\__\\/\\\\\\_______________________\\///////////\\\\\\//__________");
        this.line("     _\\/\\\\\\______\\//\\\\\\_\\/\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\_____________________\\/\\\\\\____________");
        this.line("      _\\///________\\///__\\///////////////_______________________\\///_____________");
        this.line("");
        this.line("🧠  RL4 Cognitive Console — Ready");
        this.line("───────────────────────────────────────────────────────────────────────────────");
        this.line("");
    }

    /******************************************************************************************
     * RL4 ATLAS BLOCK
     ******************************************************************************************/
    private renderRL4Atlas() {
        const base = path.join(this.workspaceRoot, ".reasoning_rl4");
        const mk = (p: string) => `file://${path.join(base, p)}`;

        this.line("┌───────────────────────── RL4 ATLAS ─────────────────────────┐");
        this.line(`│ 🧭 Governance      ${mk("governance")}`);
        this.line(`│ 🧾 Ledger          ${mk("ledger")}`);
        this.line(`│ 📡 Traces          ${mk("traces")}`);
        this.line(`│ 🛠️  Dev / RBLE      ${mk("rble")}`);
        this.line(`│ 🗂️  History         ${mk("history")}`);
        this.line(`│ 🧊 Artifacts       ${mk("artifacts")}`);
        this.line(`│ 💉 Diagnostics     ${mk("diagnostics")}`);
        this.line(`│ ⚙️  Config          ${mk("config")}`);
        this.line("└──────────────────────────────────────────────────────────────┘");
        this.line("");
    }

    /******************************************************************************************
     * LIVE FEED
     ******************************************************************************************/
    private renderLiveFeed() {
        this.line("┌──────────────────────── LIVE FEED ──────────────────────────┐");
        this.line("│ Waiting for activity…                                        │");
        this.line("└──────────────────────────────────────────────────────────────┘");
        this.line("");
    }

    /******************************************************************************************
     * SESSION STATUS BLOCK
     ******************************************************************************************/
    private renderSessionStatus() {
        this.line("┌──────────────────────── SESSION STATUS ───────────────────────┐");
        this.line("│ 📄 Files changed     0            ⏱️  Uptime          00:00      │");
        this.line("│ 🔀 Commits           0            🧠  Cycles              0       │");
        this.line("│ 🧬 Patterns          0            ⚠️  Errors              0       │");
        this.line("│                                                              │");
        this.line("│ 💾 Memory     ░░░░░░░░░░ 0 MB       Peak 0 MB                 │");
        this.line("│ 📍 Last event        Starting…                                │");
        this.line("└──────────────────────────────────────────────────────────────┘");
        this.line("");
    }

    /******************************************************************************************
     * PUBLIC API
     ******************************************************************************************/
    system(msg: string) {
        if (this.verbosity === "silent") return;
        this.write(`⚙️  SYSTEM: ${msg}`);
    }

    warning(msg: string) {
        if (this.verbosity === "silent") return;
        this.write(`⚠️  WARNING: ${msg}`);
    }

    error(msg: string) {
        this.write(`❌ ERROR: ${msg}`);
    }

    narrative(msg: string) {
        if (this.verbosity === "silent" || this.verbosity === "minimal") return;
        this.write(`💬 ${msg}`);
    }

    log(level: string, msg: string, cycleId?: number, metrics?: any) {
        if (this.verbosity === "silent") return;
        const prefix = cycleId ? `[CYCLE ${cycleId}]` : "";
        this.write(`${prefix} [${level}] ${msg}`);
        this.appendStructured({ timestamp: new Date().toISOString(), level, msg, cycleId, metrics });
    }

    cycleStart(cycleId: number) {
        if (this.verbosity !== "silent") this.write(`🧠 Cycle ${cycleId} started`);
        this.appendStructured({ event: "cycle_start", cycleId });
    }

    cycleEnd(cycleId: number, phases: any, health: any) {
        if (this.verbosity !== "silent") this.write(`🧠 Cycle ${cycleId} completed`);
        this.appendStructured({ event: "cycle_end", cycleId, phases, health });
    }

    /******************************************************************************************
     * INTERNAL WRITING UTILS
     ******************************************************************************************/
    private write(line: string) {
        // ✅ Fix 3: Use static channel (set via initialize())
        if (!CognitiveLogger.channel) {
            // No channel available (child process or not initialized): use console
            console.log(line);
            return;
        }

        // ✅ OPTIMISATION: Déduplication des messages répétés
        const now = Date.now();
        const lastTime = this.lastMessages.get(line);
        if (lastTime && (now - lastTime) < this.DEDUP_WINDOW_MS) {
            return; // Ignorer message répété dans la fenêtre de 1 minute
        }
        this.lastMessages.set(line, now);
        
        // Nettoyer les anciennes entrées (garder seulement les 100 dernières)
        if (this.lastMessages.size > 100) {
            const oldestKey = Array.from(this.lastMessages.keys())[0];
            this.lastMessages.delete(oldestKey);
        }

        // ✅ Fix 4: Improved rotation with warning before clearing
        if (this.outputLines >= this.MAX_OUTPUT) {
            CognitiveLogger.channel.clear();
            this.outputLines = 0;
            this.lastMessages.clear(); // ✅ Nettoyer aussi la déduplication
            this.line("🧹 RL4 console cleared (auto-rotation to prevent memory growth)");
        }
        // ✅ Fix 4: Warn when approaching limit (at 80%)
        if (this.outputLines >= this.MAX_OUTPUT * 0.8 && this.outputLines < this.MAX_OUTPUT * 0.81) {
            this.line("⚠️  RL4 console approaching rotation limit (auto-clear at 2000 lines)");
        }
        this.line(line);
        this.outputLines++;
    }

    private line(text: string) {
        if (CognitiveLogger.channel) {
            CognitiveLogger.channel.appendLine(text);
        } else {
            // Headless mode or child process: output to console
            console.log(text);
        }
    }

    private appendStructured(entry: any) {
        try {
            fs.appendFileSync(this.structuredLogPath, JSON.stringify(entry) + "\n");
        } catch {}
    }

    /**
     * Dispose resources
     */
    dispose() {
        // ✅ Fix 3: Channel is managed by extension.ts, not by CognitiveLogger
        // Do not dispose the static channel here - it's disposed in extension.ts deactivate()
        // Just clear the reference if needed
        // Note: We keep the static channel for potential reuse, extension.ts handles disposal
    }

    // Legacy compatibility method implementations
    info(msg: string): void {
        this.system(msg);
    }

    debug(msg: string): void {
        this.system(`[DEBUG] ${msg}`);
    }

    success(msg: string): void {
        this.system(`✅ ${msg}`);
    }

    /**
     * ✅ Memory leak testing: Log memory usage to output channel
     */
    logMemoryUsage(phase: 'activate' | 'deactivate'): void {
        if (this.verbosity === "silent") return;
        
        const mem = process.memoryUsage();
        const formatMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);
        
        this.line('');
        this.line('═══════════════════════════════════════════════════════');
        this.write(`📊 Memory Usage (${phase}):`);
        this.write(`   RSS: ${formatMB(mem.rss)} MB (Resident Set Size - total memory)`);
        this.write(`   Heap Used: ${formatMB(mem.heapUsed)} MB`);
        this.write(`   Heap Total: ${formatMB(mem.heapTotal)} MB`);
        this.write(`   External: ${formatMB(mem.external)} MB`);
        this.write(`   Array Buffers: ${formatMB(mem.arrayBuffers)} MB`);
        this.line('═══════════════════════════════════════════════════════');
        this.line('');
    }

    verbose(msg: string): void {
        if (this.verbosity === "debug") {
            this.system(`[VERBOSE] ${msg}`);
        }
    }

    trace(msg: string): void {
        if (this.verbosity === "debug") {
            this.system(`[TRACE] ${msg}`);
        }
    }

    warn(msg: string): void {
        this.warning(msg);
    }
}