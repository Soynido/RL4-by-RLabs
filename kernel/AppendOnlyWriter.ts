import * as fs from "fs";
import * as path from "path";

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
 */

export interface AppendOnlyWriterOptions {
    fsync?: boolean;                 // Force disque
    mkdirRecursive?: boolean;        // Crée dossiers manquants
    maxRetries?: number;             // Retries en cas d'erreur
}

export class AppendOnlyWriter {
    private filePath: string;
    private fileHandle: fs.promises.FileHandle | null = null;
    private queue: string[] = [];
    private writing = false;
    private options: AppendOnlyWriterOptions;

    constructor(filePath: string, options: AppendOnlyWriterOptions = {}) {
        this.filePath = filePath;
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
     */
    async append(value: any): Promise<void> {
        const line = JSON.stringify({
            ...value,
            timestamp: new Date().toISOString(),
        }) + "\n";

        this.queue.push(line);
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