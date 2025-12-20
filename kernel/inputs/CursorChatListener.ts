/**
 * CursorChatListener - Extract chat history from Cursor's SQLite database
 * 
 * OPT-IN: Feature flag required (Context.RL4 or config)
 * FALLBACK: Silent if SQLite inaccessible
 * NO HARD DEPENDENCY: MIL works without CursorChatListener
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Database } from 'better-sqlite3';
import { AppendOnlyWriter } from '../AppendOnlyWriter';
import { ILogger } from '../core/ILogger';
import { MIL } from '../memory/MIL';
import { EventSource } from '../memory/types';
import { v4 as uuidv4 } from 'uuid';

interface ChatEvent {
    id: string;
    type: string;
    timestamp: string;
    source: string;
    metadata: {
        messages: Array<{
            role: string;
            content: string;
            timestamp?: string;
        }>;
        session_id?: string;
    };
}

export class CursorChatListener {
    private workspaceRoot: string;
    private mil: MIL;
    private appendWriter?: AppendOnlyWriter;
    private logger?: ILogger;
    private isActive: boolean = false;
    private pollingInterval: NodeJS.Timeout | null = null;
    private lastExtractionTime: number = 0;
    private stateDbPath: string | null = null;

    constructor(
        workspaceRoot: string,
        mil: MIL,
        appendWriter?: AppendOnlyWriter,
        logger?: ILogger
    ) {
        this.workspaceRoot = workspaceRoot;
        this.mil = mil;
        this.appendWriter = appendWriter;
        this.logger = logger;
    }

    /**
     * Start polling for chat history (opt-in required)
     */
    async start(): Promise<void> {
        if (this.isActive) {
            this.logger?.warning('CursorChatListener already active');
            return;
        }

        // Check opt-in feature flag
        if (!this.shouldEnableCursorChat()) {
            this.logger?.system('CursorChatListener: opt-in not enabled, skipping');
            return;
        }

        // Find Cursor state database
        this.stateDbPath = this.findCursorStateDb();
        if (!this.stateDbPath) {
            this.logger?.warning('CursorChatListener: state.vscdb not found, skipping');
            return;
        }

        // Initialize append writer if needed
        if (!this.appendWriter) {
            const tracesDir = path.join(this.workspaceRoot, '.reasoning_rl4', 'traces');
            if (!fs.existsSync(tracesDir)) {
                fs.mkdirSync(tracesDir, { recursive: true });
            }
            const logPath = path.join(tracesDir, 'cursor_chat.jsonl');
            this.appendWriter = new AppendOnlyWriter(logPath, { fsync: false, mkdirRecursive: true });
            await this.appendWriter.init();
        }

        this.isActive = true;
        this.logger?.system('CursorChatListener: started (opt-in enabled)');

        // Initial extraction
        await this.extractChatHistory();

        // Poll every 5 minutes
        this.pollingInterval = setInterval(() => {
            this.extractChatHistory().catch(error => {
                this.logger?.warning(`CursorChatListener: extraction error: ${error}`);
            });
        }, 5 * 60 * 1000); // 5 minutes
    }

    /**
     * Stop polling
     */
    stop(): void {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        this.isActive = false;
        this.logger?.system('CursorChatListener: stopped');
    }

    /**
     * Find Cursor state database (OS-specific)
     */
    private findCursorStateDb(): string | null {
        const platform = os.platform();
        let basePath: string;

        if (platform === 'darwin') {
            // macOS
            basePath = path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage');
        } else if (platform === 'win32') {
            // Windows
            basePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage');
        } else if (platform === 'linux') {
            // Linux
            basePath = path.join(os.homedir(), '.config', 'Cursor', 'User', 'globalStorage');
        } else {
            return null;
        }

        // Look for state.vscdb in globalStorage subdirectories
        if (!fs.existsSync(basePath)) {
            return null;
        }

        const subdirs = fs.readdirSync(basePath);
        for (const subdir of subdirs) {
            const dbPath = path.join(basePath, subdir, 'state.vscdb');
            if (fs.existsSync(dbPath)) {
                return dbPath;
            }
        }

        return null;
    }

    /**
     * Extract chat history from SQLite
     * CORRIGER: Parser puis trier par timestamp réel (pas ORDER BY value DESC)
     */
    private async extractChatHistory(): Promise<void> {
        if (!this.stateDbPath || !fs.existsSync(this.stateDbPath)) {
            return;
        }

        try {
            const db = new Database(this.stateDbPath, { readonly: true });

            // Query chat data (no ORDER BY value DESC - invalid)
            const chats = db.prepare(`
                SELECT key, value
                FROM ItemTable
                WHERE key LIKE 'aiService.prompts%' 
                   OR key LIKE 'workbench.panel.aichat.view.aichat.chatdata%'
            `).all() as Array<{ key: string; value: string }>;

            db.close();

            // CORRIGER: Parser puis trier par timestamp réel
            const parsedChats = this.parseChatData(chats);

            // CORRIGER: Trier par timestamp réel (pas par value string)
            parsedChats.sort((a, b) => {
                const timeA = this.getChatTimestamp(a);
                const timeB = this.getChatTimestamp(b);
                return timeB - timeA; // Plus récent en premier
            });

            // Filtrer nouveaux chats
            const newChats = parsedChats.filter(chat => {
                const chatTime = this.getChatTimestamp(chat);
                return chatTime > this.lastExtractionTime;
            });

            if (newChats.length === 0) {
                return;
            }

            // Ingest into MIL and save to traces
            for (const chat of newChats) {
                const event = this.createChatEvent(chat);
                
                // Double écriture: traces + MIL
                if (this.appendWriter) {
                    await this.appendWriter.append(event);
                }
                
                await this.mil.ingest(event, EventSource.CURSOR_CHAT);
                
                // Update last extraction time
                const chatTime = this.getChatTimestamp(chat);
                if (chatTime > this.lastExtractionTime) {
                    this.lastExtractionTime = chatTime;
                }
            }

            this.logger?.system(`CursorChatListener: extracted ${newChats.length} new chats`);

        } catch (error) {
            // Fallback silencieux
            this.logger?.warning(`CursorChatListener: extraction failed: ${error}`);
        }
    }

    /**
     * Parse chat data from SQLite rows
     */
    private parseChatData(chats: Array<{ key: string; value: string }>): ChatEvent[] {
        const parsed: ChatEvent[] = [];

        for (const row of chats) {
            try {
                const data = JSON.parse(row.value);
                
                // Extract messages from various Cursor formats
                const messages = this.extractMessages(data);
                
                if (messages.length > 0) {
                    parsed.push({
                        id: uuidv4(),
                        type: 'chat_message',
                        timestamp: this.extractTimestamp(data) || new Date().toISOString(),
                        source: 'CursorChatListener',
                        metadata: {
                            messages: messages,
                            session_id: data.sessionId || data.id || undefined
                        }
                    });
                }
            } catch (error) {
                // Skip invalid entries
                continue;
            }
        }

        return parsed;
    }

    /**
     * Extract messages from Cursor chat data (various formats)
     */
    private extractMessages(data: any): Array<{ role: string; content: string; timestamp?: string }> {
        const messages: Array<{ role: string; content: string; timestamp?: string }> = [];

        // Format 1: Direct messages array
        if (Array.isArray(data.messages)) {
            for (const msg of data.messages) {
                if (msg.role && msg.content) {
                    messages.push({
                        role: msg.role,
                        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                        timestamp: msg.timestamp || msg.createdAt
                    });
                }
            }
        }

        // Format 2: Nested structure
        if (data.chat && Array.isArray(data.chat.messages)) {
            for (const msg of data.chat.messages) {
                if (msg.role && msg.content) {
                    messages.push({
                        role: msg.role,
                        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                        timestamp: msg.timestamp || msg.createdAt
                    });
                }
            }
        }

        return messages;
    }

    /**
     * Extract timestamp from chat data
     */
    private extractTimestamp(data: any): string | null {
        if (data.timestamp) return data.timestamp;
        if (data.createdAt) return data.createdAt;
        if (data.updatedAt) return data.updatedAt;
        if (data.messages && data.messages.length > 0) {
            const lastMsg = data.messages[data.messages.length - 1];
            if (lastMsg.timestamp) return lastMsg.timestamp;
            if (lastMsg.createdAt) return lastMsg.createdAt;
        }
        return null;
    }

    /**
     * Get chat timestamp as number (ms)
     */
    private getChatTimestamp(chat: ChatEvent): number {
        const timestamp = chat.metadata.messages[0]?.timestamp || chat.timestamp;
        if (!timestamp) return 0;
        const parsed = new Date(timestamp);
        return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
    }

    /**
     * Create CaptureEvent from chat
     */
    private createChatEvent(chat: ChatEvent): any {
        return {
            id: chat.id,
            type: 'cursor_chat',
            timestamp: chat.timestamp,
            source: 'CursorChatListener',
            metadata: chat.metadata
        };
    }

    /**
     * Check if CursorChatListener should be enabled (opt-in feature flag)
     */
    private shouldEnableCursorChat(): boolean {
        // Check Context.RL4 frontmatter
        const contextPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'governance', 'Context.RL4');
        if (fs.existsSync(contextPath)) {
            try {
                const content = fs.readFileSync(contextPath, 'utf-8');
                // Check for feature flag in frontmatter or content
                if (content.includes('cursor_chat: true') || content.includes('enableCursorChat: true')) {
                    return true;
                }
            } catch (error) {
                // Ignore
            }
        }

        // Check config file
        const configPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'config.json');
        if (fs.existsSync(configPath)) {
            try {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                if (config.features?.cursorChat === true) {
                    return true;
                }
            } catch (error) {
                // Ignore
            }
        }

        // Default: opt-out (not enabled)
        return false;
    }
}

