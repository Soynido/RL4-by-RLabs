/**
 * TaskManager - Local and RL4 Task Management
 *
 * Manages local tasks and RL4 tasks with filtering
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { TaskItem } from '../types/TaskItem';
import { TrackedTaskItem } from '../types/TrackedTaskItem';
import { PlanTasksContextParser, TasksData } from './PlanTasksContextParser';
import { AppendOnlyWriter } from '../AppendOnlyWriter';
import { ILogger } from '../core/ILogger';

export class TaskManager {
    private localTasksPath: string;

    constructor(
        private workspaceRoot: string,
        private planParser: PlanTasksContextParser,
        private appendWriter: AppendOnlyWriter,
        private logger?: ILogger
    ) {
        this.localTasksPath = path.join(this.workspaceRoot, '.reasoning_rl4', 'local_tasks.json');
        this.ensureLocalTasksFile();
    }

    /**
     * Get all local tasks
     */
    async getLocalTasks(): Promise<TaskItem[]> {
        try {
            if (!fs.existsSync(this.localTasksPath)) {
                return [];
            }

            const data = JSON.parse(fs.readFileSync(this.localTasksPath, 'utf8'));
            return data.tasks || [];
        } catch (error) {
            this.logger?.error(`[TaskManager] Failed to load local tasks: ${error}`);
            return [];
        }
    }

    /**
     * Add a new local task
     */
    async addLocalTask(task: string): Promise<void> {
        try {
            const tasks = await this.getLocalTasks();

            const newTask: TaskItem = {
                id: uuidv4(),
                title: task,
                completed: false,
                timestamp: new Date().toISOString(),
                priority: this.determinePriority(task)
            };

            tasks.push(newTask);
            await this.saveLocalTasks(tasks);

            // Log task addition
            await this.appendWriter.append({
                type: 'local_task_added',
                timestamp: new Date().toISOString(),
                taskId: newTask.id,
                taskTitle: task
            });

            this.logger?.system(`[TaskManager] Added local task: ${task}`);

        } catch (error) {
            this.logger?.error(`[TaskManager] Failed to add local task: ${error}`);
            throw error;
        }
    }

    /**
     * Toggle completion status of a local task
     */
    async toggleLocalTask(id: string): Promise<void> {
        try {
            const tasks = await this.getLocalTasks();
            const taskIndex = tasks.findIndex(task => task.id === id);

            if (taskIndex === -1) {
                throw new Error(`Task with id ${id} not found`);
            }

            tasks[taskIndex].completed = !tasks[taskIndex].completed;
            await this.saveLocalTasks(tasks);

            // Log task toggle
            await this.appendWriter.append({
                type: 'local_task_toggled',
                timestamp: new Date().toISOString(),
                taskId: id,
                completed: tasks[taskIndex].completed
            });

            this.logger?.system(`[TaskManager] Toggled local task ${id} to ${tasks[taskIndex].completed ? 'completed' : 'pending'}`);

        } catch (error) {
            this.logger?.error(`[TaskManager] Failed to toggle local task: ${error}`);
            throw error;
        }
    }

    /**
     * Get RL4 tasks with optional filtering
     */
    async getRL4Tasks(filter: string): Promise<TrackedTaskItem[]> {
        try {
            const rl4TasksData = await this.planParser.parseTasks();

            if (!rl4TasksData) {
                return [];
            }

            // Convert to TrackedTaskItem format - combine active and completed tasks
            const allTasks = [
                ...rl4TasksData.active.map(task => ({ ...task, completed: false })),
                ...rl4TasksData.completed.map(task => ({ ...task, completed: true }))
            ];

            const trackedTasks: TrackedTaskItem[] = allTasks.map(task => ({
                id: uuidv4(), // Generate new ID since TasksData tasks don't have IDs
                title: task.task || 'Untitled task', // TasksData has 'task' property
                completed: task.completed || false,
                priority: this.extractPriority(), // No priority in TasksData, use default
                tracked: true,
                timestamp: task.timestamp || new Date().toISOString()
            }));

            // Apply filter if specified
            if (filter && filter !== 'ALL') {
                return trackedTasks.filter(task => task.priority === filter);
            }

            return trackedTasks;

        } catch (error) {
            this.logger?.error(`[TaskManager] Failed to get RL4 tasks: ${error}`);
            return [];
        }
    }

    /**
     * Sync local tasks to RL4
     */
    async syncLocalToRL4(): Promise<void> {
        try {
            const localTasks = await this.getLocalTasks();
            const pendingLocalTasks = localTasks.filter(task => !task.completed);

            if (pendingLocalTasks.length === 0) {
                this.logger?.system('[TaskManager] No pending local tasks to sync to RL4');
                return;
            }

            const rl4TasksData = await this.planParser.parseTasks();

            if (!rl4TasksData) {
                throw new Error('Failed to parse RL4 tasks');
            }

            // Convert local tasks to RL4 format
            const newActiveTasks = pendingLocalTasks.map(localTask => ({
                task: localTask.title, // TasksData expects 'task' property
                completed: false,
                timestamp: localTask.timestamp
                // Note: TasksData doesn't have id, priority, or source fields
            }));

            // Create updated TasksData
            const updatedTasksData: TasksData = {
                ...rl4TasksData,
                updated: new Date().toISOString(),
                active: [...rl4TasksData.active, ...newActiveTasks]
            };

            await this.planParser.saveTasks(updatedTasksData);

            // Mark local tasks as synced
            const updatedLocalTasks = localTasks.map(task =>
                pendingLocalTasks.some(pt => pt.id === task.id)
                    ? { ...task, completed: true }
                    : task
            );

            await this.saveLocalTasks(updatedLocalTasks);

            // Log sync operation
            await this.appendWriter.append({
                type: 'tasks_synced_to_rl4',
                timestamp: new Date().toISOString(),
                syncedCount: pendingLocalTasks.length,
                totalRL4Tasks: updatedTasksData.active.length + updatedTasksData.completed.length
            });

            this.logger?.system(`[TaskManager] Synced ${pendingLocalTasks.length} local tasks to RL4`);

        } catch (error) {
            this.logger?.error(`[TaskManager] Failed to sync local tasks to RL4: ${error}`);
            throw error;
        }
    }

    private ensureLocalTasksFile(): void {
        try {
            if (!fs.existsSync(this.localTasksPath)) {
                const dir = path.dirname(this.localTasksPath);
                fs.mkdirSync(dir, { recursive: true });

                const initialData = {
                    created: new Date().toISOString(),
                    tasks: []
                };

                fs.writeFileSync(this.localTasksPath, JSON.stringify(initialData, null, 2), 'utf8');
            }
        } catch (error) {
            this.logger?.error(`[TaskManager] Failed to ensure local tasks file: ${error}`);
        }
    }

    private async saveLocalTasks(tasks: TaskItem[]): Promise<void> {
        try {
            const data = {
                updated: new Date().toISOString(),
                tasks
            };

            fs.writeFileSync(this.localTasksPath, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            this.logger?.error(`[TaskManager] Failed to save local tasks: ${error}`);
            throw error;
        }
    }

    private determinePriority(taskTitle: string): 'P0' | 'P1' | 'P2' {
        const title = taskTitle.toLowerCase();

        if (title.includes('critical') || title.includes('urgent') || title.includes('fix')) {
            return 'P0';
        }

        if (title.includes('improve') || title.includes('optimize') || title.includes('refactor')) {
            return 'P1';
        }

        return 'P2';
    }

    private extractPriority(priority?: string): 'P0' | 'P1' | 'P2' {
        if (!priority) return 'P2';

        const p = priority.toUpperCase();
        if (p === 'P0' || p === 'P1' || p === 'P2') {
            return p as 'P0' | 'P1' | 'P2';
        }

        return 'P2';
    }
}