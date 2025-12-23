import * as fs from "fs";
import * as path from "path";
import { WriteTracker } from "./WriteTracker";

/**
 * AppendOnlyWriter RL6
 * --------------------
 * Objectif : garantir un append JSONL fiable, séquentiel, atomique.
 *
 * Invariants :
 * - Aucun écrasement de fichier (append-only strict)
 * - Ecriture sérialisée via file descriptor unique
 * - Timestamps ISO stricts
 * - fsync() optionnel pour renforcer la durabilité
 * - Gestion des erreurs courantes : EBUSY, EAGAIN, EMFILE
 * - Retry exponentiel (max 5 tentatives)
 * - Queue bornée avec stratégie d'overflow configurable
 */

export enum OverflowStrategy {
    BLOCK = 'block',           // Wait until space available (for critical data)
    DROP_OLDEST = 'drop_oldest', // Drop oldest entries (FIFO) - for non-critical data
    DROP_NEWEST = 'drop_newest'  // Drop newest entries (LIFO) - for non-critical data
}

export interface AppendOnlyWriterOptions {
    fsync?: boolean;                 // Force disque
    mkdirRecursive?: boolean;        // Crée dossiers manquants
    maxRetries?: number;             // Retries en cas d'erreur
    maxQueueSize?: number;           // NEW: Maximum queue size (default: 1000)
    overflowStrategy?: OverflowStrategy;  // NEW: Strategy when queue is full
}

export class AppendOnlyWriter {
    private filePath: string;
    private fileHandle: fs.promises.FileHandle | null = null;
    private queue: string[] = [];
    private writing = false;
    private options: AppendOnlyWriterOptions;
    private writeTracker = WriteTracker.getInstance();
    private readonly MAX_QUEUE_SIZE: number;
    private readonly overflowStrategy: OverflowStrategy;

    constructor(filePath: string, options: AppendOnlyWriterOptions = {}) {
        this.filePath = filePath;
        this.MAX_QUEUE_SIZE = options.maxQueueSize ?? 1000;
        this.overflowStrategy = options.overflowStrategy ?? OverflowStrategy.BLOCK;
        this.options = {
            fsync: options.fsync ?? false,
            mkdirRecursive: options.mkdirRecursive ?? true,
            maxRetries: options.maxRetries ?? 5,
        };
    }

    /**
     * Initialise le fichier et ouvre le file descriptor.
     */
    async init(): Promise<void> {
        const dir = path.dirname(this.filePath);

        if (this.options.mkdirRecursive) {
            await fs.promises.mkdir(dir, { recursive: true });
        }

        if (this.fileHandle === null) {
            this.fileHandle = await fs.promises.open(this.filePath, "a");
        }
    }

    /**
     * Append un événement JSONL.
     * 
     * ⚠️ NEW: Handles queue overflow based on overflowStrategy
     */
    async append(value: any): Promise<void> {
        const line = JSON.stringify({
            ...value,
            timestamp: new Date().toISOString(),
        }) + "\n";

        // NEW: Handle overflow based on strategy
        if (this.queue.length >= this.MAX_QUEUE_SIZE) {
            switch (this.overflowStrategy) {
                case OverflowStrategy.BLOCK:
                    // Wait until space available
                    while (this.queue.length >= this.MAX_QUEUE_SIZE) {
                        await new Promise(resolve => setTimeout(resolve, 10)); // 10ms backoff
                    }
                    break;
                case OverflowStrategy.DROP_OLDEST:
                    // Drop oldest (FIFO)
                    this.queue.shift();
                    console.warn(`[AppendOnlyWriter] Queue full, dropping oldest entry`);
                    break;
                case OverflowStrategy.DROP_NEWEST:
                    // Don't add this line (drop newest)
                    console.warn(`[AppendOnlyWriter] Queue full, dropping newest entry`);
                    return; // Exit early, don't add to queue
            }
        }

        // Add to queue (unless DROP_NEWEST strategy)
        if (this.overflowStrategy !== OverflowStrategy.DROP_NEWEST) {
            this.queue.push(line);
        }

        // Warning if queue > 80% capacity
        if (this.queue.length > this.MAX_QUEUE_SIZE * 0.8) {
            console.warn(`[AppendOnlyWriter] Queue at ${Math.round(this.queue.length / this.MAX_QUEUE_SIZE * 100)}% capacity`);
        }

        return this.processQueue();
    }

    /**
     * flush() = assure que toute la queue a été écrite.
     */
    async flush(): Promise<void> {
        await this.processQueue();
        if (this.options.fsync && this.fileHandle !== null) {
            await this.fileHandle.sync();
        }
    }

    /**
     * Traitement séquentiel des écritures.
     */
    private async processQueue(): Promise<void> {
        if (this.writing) return;
        if (this.queue.length === 0) return;

        this.writing = true;

        try {
            while (this.queue.length > 0) {
                const chunk = this.queue.shift()!;
                await this.writeWithRetry(chunk);
            }
        } finally {
            this.writing = false;
        }
    }

    /**
     * Ecriture atomique avec retry exponentiel.
     */
    private async writeWithRetry(chunk: string): Promise<void> {
        let attempt = 0;
        let delay = 15;

        while (true) {
            try {
                if (this.fileHandle === null) {
                    await this.init();
                }
                await this.fileHandle!.appendFile(chunk);
                this.writeTracker.markInternalWrite(this.filePath);
                return;

            } catch (err: any) {
                attempt++;

                if (attempt > (this.options.maxRetries ?? 5)) {
                    throw new Error(`AppendOnlyWriter: write failed after ${attempt} attempts: ${err}`);
                }

                // Backoff
                await new Promise(res => setTimeout(res, delay));
                delay *= 2;
            }
        }
    }

    /**
     * Fermeture propre du fichier.
     */
    async close(): Promise<void> {
        if (this.fileHandle !== null) {
            await this.fileHandle.close();
            this.fileHandle = null;
        }
    }
}