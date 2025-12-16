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
 *  - OutputChannel named "RL4" (when VS Code available)
 *  - Console output (headless mode)
 *  - Hierarchical logging (SYSTEM / CYCLE / COGNITION / OUTPUT)
 *  - Silent/minimal/normal/debug verbosity
 *  - Structured JSONL logging
 *  - Live Feed block
 *  - Session Status block
 *  - RL4 Atlas block
 *  - OutputChannel auto-rotation to avoid memory leaks
 ******************************************************************************************/

export class CognitiveLogger implements ILogger {
    private channel: any = null; // vscode.OutputChannel | null
    private verbosity: Verbosity;
    private workspaceRoot: string;
    private headless: boolean;

    private structuredLogPath: string;
    private outputLines = 0;
    private readonly MAX_OUTPUT = 4000;

    constructor(workspaceRoot: string, verbosity: Verbosity = "minimal") {
        this.workspaceRoot = workspaceRoot;
        this.verbosity = verbosity;
        this.headless = !vscode;

        this.ensureDirectories();

        // Named channel RL4 (only if VS Code available)
        if (vscode && vscode.window) {
            this.channel = vscode.window.createOutputChannel("RL4");
        }

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
        if (this.outputLines > this.MAX_OUTPUT) {
            if (this.channel) {
                this.channel.clear();
            }
            this.outputLines = 0;
            this.line("🧹 RL4 console cleared (auto-rotation to prevent memory growth)");
        }
        this.line(line);
        this.outputLines++;
    }

    private line(text: string) {
        if (this.channel) {
            this.channel.appendLine(text);
        } else {
            // Headless mode: output to console
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
        if (this.channel) {
            this.channel.dispose();
        }
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