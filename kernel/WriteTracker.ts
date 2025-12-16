/**
 * WriteTracker — Track internal RL4 file writes to prevent false triggers
 * 
 * When the kernel writes to .RL4 files (KPIs, normalization, etc.),
 * we must prevent the FileWatcher from triggering a new cycle.
 * 
 * This singleton tracks recent internal writes with timestamps.
 */

export class WriteTracker {
    private static instance: WriteTracker | null = null;
    private recentInternalWrites: Map<string, number> = new Map();
    private readonly IGNORE_WINDOW_MS = 120000; // 2 minutes - accounts for macOS/VSCode/Chokidar write delays
    
    private constructor() {}
    
    /**
     * Get singleton instance
     */
    static getInstance(): WriteTracker {
        if (!WriteTracker.instance) {
            WriteTracker.instance = new WriteTracker();
        }
        return WriteTracker.instance;
    }
    
    /**
     * Mark a file as being written internally by the kernel
     * @param filePath - Absolute path to the file
     */
    markInternalWrite(filePath: string): void {
        const normalizedPath = this.normalizePath(filePath);
        this.recentInternalWrites.set(normalizedPath, Date.now());
        
        // Auto-cleanup after 2x ignore window
        setTimeout(() => {
            this.recentInternalWrites.delete(normalizedPath);
        }, this.IGNORE_WINDOW_MS * 2);
    }
    
    /**
     * Check if a file change should be ignored (was recently written internally)
     * @param filePath - Absolute path to the file
     * @returns true if this change should be ignored
     */
    shouldIgnoreChange(filePath: string): boolean {
        const normalizedPath = this.normalizePath(filePath);
        const lastWriteTime = this.recentInternalWrites.get(normalizedPath);
        
        if (!lastWriteTime) {
            return false; // No recent internal write
        }
        
        const timeSinceWrite = Date.now() - lastWriteTime;
        const shouldIgnore = timeSinceWrite < this.IGNORE_WINDOW_MS;
        
        if (shouldIgnore) {
            // Keep the entry until window expires
            return true;
        } else {
            // Window expired, clear entry
            this.recentInternalWrites.delete(normalizedPath);
            return false;
        }
    }
    
    /**
     * Normalize file path for consistent comparison
     */
    private normalizePath(filePath: string): string {
        return filePath.toLowerCase().replace(/\\/g, '/');
    }
    
    /**
     * Clear all tracked writes (for testing)
     */
    clear(): void {
        this.recentInternalWrites.clear();
    }
    
    /**
     * Get current tracked writes count (for debugging)
     */
    getTrackedCount(): number {
        return this.recentInternalWrites.size;
    }
}
