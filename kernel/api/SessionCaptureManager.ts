/**
 * SessionCaptureManager - Session Activity Capture
 *
 * Manages items captured during the current session
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CapturedItem } from '../types/CapturedItem';
import { PlanTasksContextParser, TasksData } from './PlanTasksContextParser';
import { AppendOnlyWriter } from '../AppendOnlyWriter';
import { ILogger } from '../core/ILogger';

export class SessionCaptureManager {
    private sessionStart: number;
    private capturedItems: CapturedItem[] = [];

    constructor(
        private workspaceRoot: string,
        private planParser: PlanTasksContextParser,
        private appendWriter: AppendOnlyWriter,
        private logger?: ILogger
    ) {
        this.sessionStart = Date.now();
        this.loadSessionState();
    }

    /**
     * Get all captured items for current session
     */
    async getCapturedItems(): Promise<CapturedItem[]> {
        return [...this.capturedItems];
    }

    /**
     * Promote all captured items to RL4
     */
    async promoteToRL4(): Promise<void> {
        try {
            const itemsToPromote = this.capturedItems.filter(item =>
                item.type === 'llm_proposal' || item.type === 'user_action'
            );

            if (itemsToPromote.length === 0) {
                this.logger?.system('[SessionCaptureManager] No items to promote to RL4');
                return;
            }

            // Convert to tasks for RL4
            const tasks = itemsToPromote.map(item => ({
                task: this.extractTaskFromItem(item),
                completed: false,
                timestamp: item.timestamp
                // Note: TasksData doesn't have id or priority fields
            }));

            // Load existing tasks
            const existingTasksData = await this.planParser.parseTasks();

            if (!existingTasksData) {
                throw new Error('Failed to parse existing tasks');
            }

            // Create updated TasksData
            const updatedTasksData: TasksData = {
                ...existingTasksData,
                updated: new Date().toISOString(),
                active: [...existingTasksData.active, ...tasks]
            };

            // Save to RL4
            await this.planParser.saveTasks(updatedTasksData);

            // Log the promotion
            await this.appendWriter.append({
                type: 'session_promotion',
                timestamp: new Date().toISOString(),
                itemsPromoted: itemsToPromote.length,
                sessionDuration: Date.now() - this.sessionStart
            });

            this.logger?.system(`[SessionCaptureManager] Promoted ${itemsToPromote.length} items to RL4`);

        } catch (error) {
            this.logger?.error(`[SessionCaptureManager] Failed to promote items to RL4: ${error}`);
            throw error;
        }
    }

    /**
     * Capture a new item (internal method for listeners)
     */
    async captureItem(type: string, content: string, metadata?: Record<string, any>): Promise<void> {
        const item: CapturedItem = {
            id: uuidv4(),
            type: type as any,
            content,
            timestamp: new Date().toISOString(),
            metadata
        };

        this.capturedItems.push(item);
        this.saveSessionState();
    }

    private loadSessionState(): void {
        try {
            const sessionFile = this.getSessionFilePath();
            if (fs.existsSync(sessionFile)) {
                const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
                this.capturedItems = data.items || [];
                this.sessionStart = data.sessionStart || Date.now();
            }
        } catch (error) {
            this.logger?.warning(`[SessionCaptureManager] Failed to load session state: ${error}`);
            this.capturedItems = [];
        }
    }

    private saveSessionState(): void {
        try {
            const sessionFile = this.getSessionFilePath();
            const sessionDir = path.dirname(sessionFile);

            if (!fs.existsSync(sessionDir)) {
                fs.mkdirSync(sessionDir, { recursive: true });
            }

            const data = {
                sessionStart: this.sessionStart,
                items: this.capturedItems,
                lastUpdated: new Date().toISOString()
            };

            fs.writeFileSync(sessionFile, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            this.logger?.error(`[SessionCaptureManager] Failed to save session state: ${error}`);
        }
    }

    private getSessionFilePath(): string {
        return path.join(this.workspaceRoot, '.reasoning_rl4', 'session', 'capture.json');
    }

    private extractTaskFromItem(item: CapturedItem): string {
        // Extract task description from content
        if (item.type === 'llm_proposal') {
            // Look for task-like patterns in LLM proposals
            const lines = item.content.split('\n');
            const taskLines = lines.filter(line =>
                line.includes('TODO') ||
                line.includes('implement') ||
                line.includes('add') ||
                line.includes('create') ||
                line.includes('fix')
            );

            if (taskLines.length > 0) {
                return taskLines[0].replace(/^(TODO|FIXME|NOTE):?\s*/, '').trim();
            }
        }

        // Fallback to content summary
        const maxContentLength = 80;
        const content = item.content.length > maxContentLength
            ? item.content.substring(0, maxContentLength) + '...'
            : item.content;

        return content;
    }

    private determinePriority(item: CapturedItem): 'P0' | 'P1' | 'P2' {
        // Simple priority determination
        const content = item.content.toLowerCase();

        if (content.includes('critical') || content.includes('urgent') || content.includes('fix')) {
            return 'P0';
        }

        if (content.includes('improve') || content.includes('optimize') || content.includes('refactor')) {
            return 'P1';
        }

        return 'P2';
    }
}