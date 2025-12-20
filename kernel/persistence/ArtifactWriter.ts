import * as fs from 'fs';
import * as path from 'path';

import { AtomicFS } from '../core/AtomicFS';
import { WriteTracker } from '../WriteTracker';
import { WriteAheadLog } from './WriteAheadLog';

export interface ArtifactWriteOptions {
    pretty?: boolean;
}

/**
 * ArtifactWriter
 *  - Ensures every artifact write goes through WAL + AtomicFS
 *  - Marks internal writes so watchers ignore kernel-generated mutations
 */
export class ArtifactWriter {
    private static instances: Map<string, ArtifactWriter> = new Map();

    private readonly rl4Dir: string;
    private readonly wal: WriteAheadLog;
    private readonly writeTracker: WriteTracker;

    private constructor(private readonly workspaceRoot: string) {
        this.rl4Dir = path.join(workspaceRoot, '.reasoning_rl4');
        fs.mkdirSync(this.rl4Dir, { recursive: true });
        this.wal = WriteAheadLog.getInstance(workspaceRoot);
        this.writeTracker = WriteTracker.getInstance();
    }

    public static getInstance(workspaceRoot: string): ArtifactWriter {
        const key = path.resolve(workspaceRoot);
        let instance = ArtifactWriter.instances.get(key);
        if (!instance) {
            instance = new ArtifactWriter(workspaceRoot);
            ArtifactWriter.instances.set(key, instance);
        }
        return instance;
    }

    public async writeJson(relativePath: string, payload: any, options: ArtifactWriteOptions = {}): Promise<void> {
        const targetPath = path.join(this.rl4Dir, relativePath);
        const dir = path.dirname(targetPath);
        await fs.promises.mkdir(dir, { recursive: true });

        const pretty = options.pretty ?? true;
        const content = JSON.stringify(payload, null, pretty ? 2 : undefined);

        this.wal.logSync(relativePath, content);
        this.writeTracker.markInternalWrite(targetPath);
        await AtomicFS.writeAtomic(targetPath, content);
    }
}


