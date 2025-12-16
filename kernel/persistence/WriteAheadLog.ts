import * as fs from 'fs';
import * as path from 'path';
import { GlobalClock } from '../GlobalClock';

export interface WalEntry {
    seq: number;
    type: 'update_file';
    file: string;
    content: string;
    timestamp: number;
}

export class WriteAheadLog {
    private static instance: WriteAheadLog;
    private logPath: string;

    private constructor(workspaceRoot: string) {
        const rl4Dir = path.join(workspaceRoot, '.reasoning_rl4');
        if (!fs.existsSync(rl4Dir)) {
            fs.mkdirSync(rl4Dir, { recursive: true });
        }
        this.logPath = path.join(rl4Dir, 'wal.jsonl');
    }

    public static getInstance(workspaceRoot: string): WriteAheadLog {
        if (!WriteAheadLog.instance) {
            WriteAheadLog.instance = new WriteAheadLog(workspaceRoot);
        }
        return WriteAheadLog.instance;
    }
    
    /**
     * Log an operation synchronously (WAL)
     */
    public logSync(file: string, content: string): number {
        const seq = GlobalClock.getInstance().nextSeq();
        const entry: WalEntry = {
            seq,
            type: 'update_file',
            file,
            content,
            timestamp: Date.now()
        };
        
        // Append + Sync
        const fd = fs.openSync(this.logPath, 'a');
        try {
            fs.writeSync(fd, JSON.stringify(entry) + '\n');
            fs.fsyncSync(fd); // Ensure entry is on disk before applying
        } finally {
            fs.closeSync(fd);
        }
        
        return seq;
    }
}

