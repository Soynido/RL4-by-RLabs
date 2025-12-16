import * as fs from 'fs';
import * as path from 'path';

export class AtomicFS {
    /**
     * Writes content to a file atomically using the write-tmp-fsync-rename pattern.
     */
    static async writeAtomic(filePath: string, content: string): Promise<void> {
        const dir = path.dirname(filePath);
        const tmpPath = `${filePath}.${Date.now()}.tmp`;

        // Ensure directory exists
        await fs.promises.mkdir(dir, { recursive: true });

        try {
            // 1. Write to temp file with strict syncing
            const fileHandle = await fs.promises.open(tmpPath, 'w');
            try {
                await fileHandle.writeFile(content, 'utf8');
                await fileHandle.sync(); // fsync the file content
            } finally {
                await fileHandle.close();
            }

            // 2. Rename tmp to target (atomic operation)
            await fs.promises.rename(tmpPath, filePath);

            // 3. Sync parent directory to persist the directory entry change (rename)
            try {
                const parentDirHandle = await fs.promises.open(dir, 'r');
                try {
                    await parentDirHandle.sync();
                } finally {
                    await parentDirHandle.close();
                }
            } catch (err) {
                // Directory sync is not always supported/necessary on all platforms (e.g. Windows)
                // We swallow the error to avoid failing the operation on those systems.
            }

        } catch (error) {
            // Cleanup temp file on failure
            try {
                await fs.promises.unlink(tmpPath);
            } catch (e) { 
                // Ignore cleanup errors
            }
            throw error;
        }
    }

    /**
     * Synchronous version of writeAtomic.
     */
    static writeAtomicSync(filePath: string, content: string): void {
        const dir = path.dirname(filePath);
        const tmpPath = `${filePath}.${Date.now()}.tmp`;

        // Ensure directory exists
        fs.mkdirSync(dir, { recursive: true });

        try {
            const fd = fs.openSync(tmpPath, 'w');
            try {
                fs.writeSync(fd, content);
                fs.fsyncSync(fd);
            } finally {
                fs.closeSync(fd);
            }

            fs.renameSync(tmpPath, filePath);

            // Sync parent dir
            try {
                const parentDirHandle = fs.openSync(dir, 'r');
                try {
                    fs.fsyncSync(parentDirHandle);
                } finally {
                    fs.closeSync(parentDirHandle);
                }
            } catch (err) {
                // Ignore directory sync errors
            }

        } catch (error) {
            try {
                fs.unlinkSync(tmpPath);
            } catch (e) { 
                // Ignore cleanup errors
            }
            throw error;
        }
    }
}
