import * as fs from "fs";
import * as path from "path";
import { AppendOnlyWriter } from "../AppendOnlyWriter";

/**
 * RBOMLedger – RL6 Stable Edition
 * --------------------------------
 * RBOM = Reasoning BOM (Bill Of Materials)
 *
 * This module is a persistent append-only registry used by RL4:
 *  - RL4Commands (ledger / governance commands)
 *  - SnapshotRotation
 *  - UnifiedPromptBuilder
 *  - ActivityReconstructor
 *
 * It stores "ledger entries" describing major cognitive/system events.
 *
 * ❗ Zero intelligence.
 * ❗ Durable append-only operations.
 * ❗ JSONL-based.
 * ❗ Resistant to corruption.
 */

export interface RBOMEntry {
    id: string;
    type: string;             // e.g., "session_start", "commit", "file_change", "snapshot", …
    timestamp: string;        // ISO 8601
    payload: any;             // arbitrary structured data
}

export class RBOMLedger {
    private ledgerPath: string;
    private writer: AppendOnlyWriter;

    constructor(workspaceRoot: string) {
        const dir = path.join(workspaceRoot, ".reasoning_rl4", "ledger");
        this.ledgerPath = path.join(dir, "rbom.jsonl");

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.writer = new AppendOnlyWriter(this.ledgerPath, {
            fsync: false,
            mkdirRecursive: true,
            maxRetries: 5,
        });
    }

    /**
     * Initializes the append-only writer.
     */
    async init(): Promise<void> {
        await this.writer.init();
    }

    /**
     * Appends a new ledger entry.
     */
    async append(type: string, payload: any): Promise<RBOMEntry> {
        const entry: RBOMEntry = {
            id: this.generateId(),
            type,
            timestamp: new Date().toISOString(),
            payload,
        };

        await this.writer.append(entry);
        return entry;
    }

    /**
     * Reads the ledger (tail mode)
     */
    async readAll(): Promise<RBOMEntry[]> {
        if (!fs.existsSync(this.ledgerPath)) return [];

        const lines = fs.readFileSync(this.ledgerPath, "utf-8")
            .split("\n")
            .filter(Boolean);

        const entries: RBOMEntry[] = [];

        for (const line of lines) {
            try {
                entries.push(JSON.parse(line));
            } catch {
                // corruption → skip line
            }
        }

        return entries;
    }

    /**
     * Retrieves only the last N entries.
     */
    async tail(n: number): Promise<RBOMEntry[]> {
        const all = await this.readAll();
        return all.slice(-n);
    }

    /**
     * Flush underlying writer
     */
    async flush(): Promise<void> {
        await this.writer.flush();
    }

    /**
     * Proper shutdown.
     */
    async close(): Promise<void> {
        await this.writer.close();
    }

    /**
     * Simple robust UUID generator (no deps).
     */
    private generateId(): string {
        return "rbom-" + Math.random().toString(36).substring(2, 10) + "-" + Date.now().toString(36);
    }
}