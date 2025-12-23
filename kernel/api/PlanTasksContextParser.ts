/**
 * PlanTasksContextParser — Parse Plan/Tasks/Context.RL4 with validation
 * 
 * Phase E3.3: Parse persistent state files (Markdown + YAML frontmatter)
 * 
 * File Format:
 * ---
 * version: 1.0.0
 * updated: 2025-11-12T13:00:00Z
 * confidence: 0.85
 * ---
 * 
 * # Plan — Strategic Vision
 * 
 * ## Phase
 * E3.3 - Single Context Snapshot System
 * ...
 * 
 * Responsibilities:
 * - Parse YAML frontmatter (version, updated, confidence, bias)
 * - Parse Markdown content
 * - Validate structure (basic checks)
 * - Calculate confidence (Plan vs Reality alignment)
 * - Calculate bias (drift from original intent)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { WriteTracker } from '../WriteTracker';
import { AtomicFS } from '../core/AtomicFS';
import { WriteAheadLog } from '../persistence/WriteAheadLog';

// ✅ P0-KPI-SEPARATION-01: Separated KPI types for LLM vs Kernel
export interface KPIRecordLLM {
  cycle: number;
  cognitive_load: number;
  risks: string[];
  next_steps: string[];
  plan_drift: number;
  opportunities?: string[];
  updated: string;
}

export interface KPIRecordKernel {
  cycle: number;
  cognitive_load: number;
  drift: number;
  patterns_detected: number;
  tasks_active: number;
  queue_length?: number;
  scheduler_state?: 'idle' | 'running' | 'queued';
  cycle_gap_ms?: number;
  snapshot_delta_count?: number;
  file_change_delta?: number;
  updated: string;
}

// ✅ DEPRECATED: Use KPIRecordLLM or KPIRecordKernel instead
// Kept for backward compatibility during migration
export interface KPIRecord {
  cycle: number;
  cognitive_load: number;
  risks: string[];
  next_steps: string[];
  plan_drift: number;
  updated: string;
}

// Types for parsed data
export interface PlanData {
  version: string;
  updated: string;
  confidence?: number;
  
  // Content
  phase: string;
  goal: string;
  timeline: { start: string; target: string };
  successCriteria: string[];
  constraints: string[];
}

export interface TasksData {
  version: string;
  updated: string;
  bias?: number;
  
  // Content
  active: Array<{ completed: boolean; task: string; timestamp?: string }>;
  blockers: string[];
  completed: Array<{ task: string; timestamp: string }>;
}

export interface ContextData {
  version: string;
  updated: string;
  confidence?: number;
  kpis_llm?: KPIRecordLLM[];      // ✅ P0-KPI-SEPARATION-01: LLM-calculated KPIs (reasoning, patterns, goals)
  kpis_kernel?: KPIRecordKernel[]; // ✅ P0-KPI-SEPARATION-01: Kernel-calculated KPIs (cycle count, latency, queue)
  kpis?: KPIRecord[];              // ✅ DEPRECATED: Kept for backward compatibility during migration
  
  // Content
  activeFiles: string[];
  recentActivity: {
    cycles: number;
    commits: number;
    duration: string;
  };
  health: {
    memory: string;
    eventLoop: string;
    uptime: string;
  };
  observations: string[];
  tasks?: {
    active: Array<{ completed: boolean; task: string; timestamp?: string }>;
  };
  // Legacy compatibility properties
  next?: string;
  kernel_flags?: Record<string, any>;
  kernel_cycle?: string;
}

export interface WorkspaceData {
  activeFiles: string[];
  recentCycles: number;
  recentCommits: number;
  health: {
    memoryMB: number;
    eventLoopLag: number;
  };
}

export class PlanTasksContextParser {
  private rl4Path: string;

  constructor(rl4Path: string) {
    this.rl4Path = rl4Path;
  }

  /**
   * Parse Plan.RL4
   */
  parsePlan(): PlanData | null {
    const planPath = path.join(this.rl4Path, 'Plan.RL4');
    
    if (!fs.existsSync(planPath)) {
      return this.generateDefaultPlan();
    }

    try {
      const content = fs.readFileSync(planPath, 'utf8');
      const { frontmatter, markdown } = this.parseFrontmatter(content);

      return {
        version: frontmatter.version || '1.0.0',
        updated: frontmatter.updated || new Date().toISOString(),
        confidence: frontmatter.confidence,
        
        phase: this.extractSection(markdown, '## Phase') || 'Unknown',
        goal: this.extractSection(markdown, '## Goal') || 'Not defined',
        timeline: this.parseTimeline(markdown),
        successCriteria: this.extractListItems(markdown, '## Success Criteria'),
        constraints: this.extractListItems(markdown, '## Constraints')
      };
    } catch (error) {
      console.error('[PlanTasksContextParser] Error parsing Plan.RL4:', error);
      return this.generateDefaultPlan();
    }
  }

  /**
   * Parse Tasks.RL4
   */
  parseTasks(): TasksData | null {
    const tasksPath = path.join(this.rl4Path, 'Tasks.RL4');
    
    if (!fs.existsSync(tasksPath)) {
      return this.generateDefaultTasks();
    }

    try {
      const content = fs.readFileSync(tasksPath, 'utf8');
      const { frontmatter, markdown } = this.parseFrontmatter(content);

      return {
        version: frontmatter.version || '1.0.0',
        updated: frontmatter.updated || new Date().toISOString(),
        bias: frontmatter.bias,
        
        active: this.parseTaskList(markdown, '## Active'),
        blockers: this.extractListItems(markdown, '## Blockers'),
        completed: this.parseTaskList(markdown, '## Completed').map(t => ({
          task: t.task,
          timestamp: t.timestamp || 'unknown'
        }))
      };
    } catch (error) {
      console.error('[PlanTasksContextParser] Error parsing Tasks.RL4:', error);
      return this.generateDefaultTasks();
    }
  }

  /**
   * Parse Context.RL4
   */
  parseContext(): ContextData | null {
    const contextPath = path.join(this.rl4Path, 'Context.RL4');
    
    if (!fs.existsSync(contextPath)) {
      return this.generateDefaultContext();
    }

    try {
      const content = fs.readFileSync(contextPath, 'utf8');
      const { frontmatter, markdown } = this.parseFrontmatter(content);

      // ✅ P0-KPI-SEPARATION-01-migration: Backward compatibility migration
      // If old format `kpis` exists and new formats don't, migrate to kpis_kernel
      if (frontmatter.kpis && !frontmatter.kpis_llm && !frontmatter.kpis_kernel) {
        console.log('[PlanTasksContextParser] Migrating old kpis format to kpis_kernel');
        frontmatter.kpis_kernel = (frontmatter.kpis || []).map((kpi: any) => ({
          cycle: kpi.cycle,
          cognitive_load: kpi.cognitive_load || 0,
          drift: kpi.plan_drift || 0,
          patterns_detected: 0,
          tasks_active: 0,
          updated: kpi.updated
        }));
        // Don't delete old kpis yet - let it be overwritten on next save
      }

      return {
        version: frontmatter.version || '1.0.0',
        updated: frontmatter.updated || new Date().toISOString(),
        confidence: frontmatter.confidence,
        kpis_llm: frontmatter.kpis_llm || [],      // ✅ P0-KPI-SEPARATION-01: LLM KPIs
        kpis_kernel: frontmatter.kpis_kernel || [], // ✅ P0-KPI-SEPARATION-01: Kernel KPIs
        kpis: frontmatter.kpis || [],              // ✅ DEPRECATED: Kept for backward compatibility
        
        activeFiles: this.extractListItems(markdown, '## Active Files'),
        recentActivity: this.parseRecentActivity(markdown),
        health: this.parseHealth(markdown),
        observations: this.extractListItems(markdown, '## Observations')
      };
    } catch (error) {
      console.error('[PlanTasksContextParser] Error parsing Context.RL4:', error);
      return this.generateDefaultContext();
    }
  }

  /**
   * Parse YAML frontmatter from Markdown
   */
  private parseFrontmatter(content: string): { frontmatter: any; markdown: string } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return { frontmatter: {}, markdown: content };
    }

    try {
      const frontmatter = yaml.load(match[1]) || {};
      const markdown = match[2];
      return { frontmatter, markdown };
    } catch (error) {
      console.error('[PlanTasksContextParser] Failed to parse frontmatter:', error);
      return { frontmatter: {}, markdown: content };
    }
  }

  /**
   * Extract section content from Markdown
   */
  private extractSection(content: string, sectionTitle: string): string {
    const regex = new RegExp(`${sectionTitle}\\n([^#]+)`, 'm');
    const match = content.match(regex);
    return match ? match[1].trim() : '';
  }

  /**
   * Extract list items from Markdown section
   */
  private extractListItems(content: string, sectionTitle: string): string[] {
    const sectionContent = this.extractSection(content, sectionTitle);
    
    return sectionContent
      .split('\n')
      .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
      .map(line => line.replace(/^[-*]\s*/, '').trim())
      .map(line => line.replace(/^\[[ x]\]\s*/, '')) // Remove checkbox
      .filter(Boolean);
  }

  /**
   * Parse task list with checkboxes
   */
  private parseTaskList(content: string, sectionTitle: string): Array<{ completed: boolean; task: string; timestamp?: string }> {
    const sectionContent = this.extractSection(content, sectionTitle);
    
    const tasks: Array<{ completed: boolean; task: string; timestamp?: string }> = [];
    
    for (const line of sectionContent.split('\n')) {
      const checkboxMatch = line.match(/^[-*]\s*\[([ x])\]\s*(.+)$/);
      if (checkboxMatch) {
        const completed = checkboxMatch[1] === 'x';
        const taskText = checkboxMatch[2].trim();
        
        // Extract timestamp if present (completed: HH:MM)
        const timestampMatch = taskText.match(/\(completed:\s*(.+?)\)/);
        const timestamp = timestampMatch ? timestampMatch[1] : undefined;
        const cleanTask = taskText.replace(/\(completed:.*?\)/, '').trim();
        
        tasks.push({ completed, task: cleanTask, timestamp });
      }
    }
    
    return tasks;
  }

  /**
   * Parse timeline section
   */
  private parseTimeline(content: string): { start: string; target: string } {
    const timelineContent = this.extractSection(content, '## Timeline');
    
    const startMatch = timelineContent.match(/Start:\s*(.+)/);
    const targetMatch = timelineContent.match(/Target:\s*(.+)/);
    
    return {
      start: startMatch ? startMatch[1].trim() : 'Unknown',
      target: targetMatch ? targetMatch[1].trim() : 'Unknown'
    };
  }

  /**
   * Parse recent activity section
   */
  private parseRecentActivity(content: string): ContextData['recentActivity'] {
    const activityContent = this.extractSection(content, '## Recent Activity');
    
    const cyclesMatch = activityContent.match(/Cycles:\s*(\d+)/);
    const commitsMatch = activityContent.match(/Commits:\s*(\d+)/);
    const durationMatch = activityContent.match(/Duration:\s*(.+)/);
    
    return {
      cycles: cyclesMatch ? parseInt(cyclesMatch[1]) : 0,
      commits: commitsMatch ? parseInt(commitsMatch[1]) : 0,
      duration: durationMatch ? durationMatch[1].trim() : '2h'
    };
  }

  /**
   * Parse health section
   */
  private parseHealth(content: string): ContextData['health'] {
    const healthContent = this.extractSection(content, '## Health');
    
    const memoryMatch = healthContent.match(/Memory:\s*(.+)/);
    const eventLoopMatch = healthContent.match(/Event Loop:\s*(.+)/);
    const uptimeMatch = healthContent.match(/Uptime:\s*(.+)/);
    
    return {
      memory: memoryMatch ? memoryMatch[1].trim() : 'Unknown',
      eventLoop: eventLoopMatch ? eventLoopMatch[1].trim() : 'Unknown',
      uptime: uptimeMatch ? uptimeMatch[1].trim() : 'Unknown'
    };
  }

  /**
   * Calculate confidence (Plan vs Reality alignment)
   * Confidence = how well current workspace matches Plan expectations
   */
  calculateConfidence(plan: PlanData, reality: WorkspaceData): number {
    let score = 0;
    let total = 0;

    // Check if timeline is on track
    const now = new Date();
    const targetDate = new Date(plan.timeline.target);
    const startDate = new Date(plan.timeline.start);
    const totalDuration = targetDate.getTime() - startDate.getTime();
    const elapsed = now.getTime() - startDate.getTime();
    const progress = Math.min(elapsed / totalDuration, 1.0);
    
    // If we're on schedule (not past deadline), +20 points
    if (now <= targetDate) {
      score += 20;
    }
    total += 20;

    // Check activity level (cycles should be >100 per 2h)
    if (reality.recentCycles > 100) {
      score += 30;
    } else if (reality.recentCycles > 50) {
      score += 15;
    }
    total += 30;

    // Check system health
    if (reality.health.memoryMB < 500) {
      score += 25; // Memory healthy
    }
    if (reality.health.eventLoopLag < 1.0) {
      score += 25; // Event loop healthy
    }
    total += 50;

    return Math.round((score / total) * 100) / 100; // 0.0-1.0
  }

  /**
   * Calculate bias (drift from original Plan)
   * Bias = how much current Plan differs from original Plan
   */
  calculateBias(currentPlan: PlanData, originalPlan: PlanData): number {
    // Simple metric: compare goal similarity
    const currentGoal = currentPlan.goal.toLowerCase();
    const originalGoal = originalPlan.goal.toLowerCase();
    
    // Calculate Levenshtein distance (simplified)
    const maxLen = Math.max(currentGoal.length, originalGoal.length);
    if (maxLen === 0) return 0;
    
    const distance = this.levenshteinDistance(currentGoal, originalGoal);
    const bias = distance / maxLen;
    
    return Math.round(bias * 100) / 100; // 0.0-1.0
  }

  /**
   * Simple Levenshtein distance implementation
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Validate Plan.RL4 structure
   */
  validatePlan(data: PlanData): boolean {
    if (!data.version || !data.updated) return false;
    if (!data.phase || !data.goal) return false;
    return true;
  }

  /**
   * Validate Tasks.RL4 structure
   */
  validateTasks(data: TasksData): boolean {
    if (!data.version || !data.updated) return false;
    if (!Array.isArray(data.active)) return false;
    return true;
  }

  /**
   * Validate Context.RL4 structure
   */
  validateContext(data: ContextData): boolean {
    if (!data.version || !data.updated) return false;
    if (!Array.isArray(data.activeFiles)) return false;
    return true;
  }

  /**
   * Generate default Plan.RL4 if file doesn't exist
   * NOTE: These are generic placeholders - the LLM agent will populate with real project goals in First Use mode
   */
  private generateDefaultPlan(): PlanData {
    return {
      version: '1.0.0',
      updated: new Date().toISOString(),
      confidence: 0.5,
      phase: 'Initial Setup', // Generic placeholder - will be replaced by LLM with real project phase
      goal: 'Project goals will be extracted from plan files, README, and conversation', // Generic placeholder
      timeline: {
        start: new Date().toISOString().split('T')[0],
        target: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // +3 days
      },
      successCriteria: [
        'Project goals to be defined'
      ],
      constraints: []
    };
  }

  /**
   * Generate default Tasks.RL4 if file doesn't exist
   * NOTE: These are generic placeholders - the LLM agent will populate with real project tasks in First Use mode
   */
  private generateDefaultTasks(): TasksData {
    return {
      version: '1.0.0',
      updated: new Date().toISOString(),
      bias: 0.0,
      active: [
        { completed: false, task: '[P0] Project tasks will be extracted from plan files and conversation' }
      ],
      blockers: [],
      completed: []
    };
  }

  /**
   * Generate default Context.RL4 if file doesn't exist
   */
  private generateDefaultContext(): ContextData {
    return {
      version: '1.0.0',
      updated: new Date().toISOString(),
      confidence: 0.5,
      kpis_llm: [],      // ✅ P0-KPI-SEPARATION-01: Initialize empty LLM KPIs
      kpis_kernel: [],   // ✅ P0-KPI-SEPARATION-01: Initialize empty Kernel KPIs
      activeFiles: [],
      recentActivity: {
        cycles: 0,
        commits: 0,
        duration: '2h'
      },
      health: {
        memory: 'Unknown',
        eventLoop: 'Unknown',
        uptime: 'Unknown'
      },
      observations: []
    };
  }

  /**
   * Save Plan.RL4 to disk
   */
  savePlan(data: PlanData): boolean {
    const planPath = path.join(this.rl4Path, 'Plan.RL4');
    
    try {
      // ✅ P0-HOTFIX: Mark as internal write BEFORE writing
      const writeTracker = WriteTracker.getInstance();
      writeTracker.markInternalWrite(planPath);
      
      const frontmatter = {
        version: data.version,
        updated: data.updated,
        confidence: data.confidence
      };

      const content = `---
${yaml.dump(frontmatter).trim()}
---

# Plan — Strategic Vision

## Phase
${data.phase}

## Goal
${data.goal}

## Timeline
Start: ${data.timeline.start}
Target: ${data.timeline.target}

## Success Criteria
${data.successCriteria.map(c => `- ${c}`).join('\n')}

${data.constraints.length > 0 ? `## Constraints\n${data.constraints.map(c => `- ${c}`).join('\n')}` : ''}
`;

      // ✅ P0-CONSISTENCY: Write-Ahead Log
      const workspaceRoot = path.dirname(this.rl4Path);
      WriteAheadLog.getInstance(workspaceRoot).logSync('Plan.RL4', content);

      AtomicFS.writeAtomicSync(planPath, content);
      console.log('[PlanTasksContextParser] ✅ Plan.RL4 saved (WAL + AtomicFS)');
      return true;
    } catch (error) {
      console.error('[PlanTasksContextParser] Failed to save Plan.RL4:', error);
      return false;
    }
  }

  /**
   * Save Tasks.RL4 to disk
   */
  saveTasks(data: TasksData): boolean {
    const tasksPath = path.join(this.rl4Path, 'Tasks.RL4');
    
    try {
      // ✅ P0-HOTFIX: Mark as internal write BEFORE writing
      const writeTracker = WriteTracker.getInstance();
      writeTracker.markInternalWrite(tasksPath);
      
      const frontmatter = {
        version: data.version,
        updated: data.updated,
        bias: data.bias
      };

      const content = `---
${yaml.dump(frontmatter).trim()}
---

# Tasks — Tactical TODOs

## Active
${data.active.map(t => `- [${t.completed ? 'x' : ' '}] ${t.task}${t.timestamp ? ` (completed: ${t.timestamp})` : ''}`).join('\n')}

${data.blockers.length > 0 ? `## Blockers\n${data.blockers.map(b => `- ${b}`).join('\n')}\n` : ''}

${data.completed.length > 0 ? `## Completed (last 24h)\n${data.completed.map(c => `- ${c.task} (${c.timestamp})`).join('\n')}` : ''}
`;

      // ✅ P0-CONSISTENCY: Write-Ahead Log
      const workspaceRoot = path.dirname(this.rl4Path);
      WriteAheadLog.getInstance(workspaceRoot).logSync('Tasks.RL4', content);

      AtomicFS.writeAtomicSync(tasksPath, content);
      console.log('[PlanTasksContextParser] ✅ Tasks.RL4 saved (WAL + AtomicFS)');
      return true;
    } catch (error) {
      console.error('[PlanTasksContextParser] Failed to save Tasks.RL4:', error);
      return false;
    }
  }

  /**
   * Save Context.RL4 to disk
   */
  saveContext(data: ContextData): boolean {
    const contextPath = path.join(this.rl4Path, 'Context.RL4');
    
    try {
      // ✅ P0-HOTFIX: Mark as internal write BEFORE writing
      const writeTracker = WriteTracker.getInstance();
      writeTracker.markInternalWrite(contextPath);
      
      const frontmatter = {
        version: data.version,
        updated: data.updated,
        confidence: data.confidence,
        kpis_llm: data.kpis_llm || [],      // ✅ P0-KPI-SEPARATION-03: LLM KPIs (preserved)
        kpis_kernel: data.kpis_kernel || [] // ✅ P0-KPI-SEPARATION-03: Kernel KPIs (preserved)
        // ❌ DEPRECATED: kpis field no longer written (migrated to kpis_kernel)
      };

      const content = `---
${yaml.dump(frontmatter).trim()}
---

# Context — Workspace State

## Active Files
${data.activeFiles.map(f => `- ${f}`).join('\n')}

## Recent Activity (${data.recentActivity.duration})
- Cycles: ${data.recentActivity.cycles}
- Commits: ${data.recentActivity.commits}

## Health
- Memory: ${data.health.memory}
- Event Loop: ${data.health.eventLoop}
- Uptime: ${data.health.uptime}

${data.observations.length > 0 ? `## Observations\n${data.observations.map(o => `- ${o}`).join('\n')}` : ''}
`;

      // ✅ P0-CONSISTENCY: Write-Ahead Log
      const workspaceRoot = path.dirname(this.rl4Path);
      WriteAheadLog.getInstance(workspaceRoot).logSync('Context.RL4', content);

      AtomicFS.writeAtomicSync(contextPath, content);
      console.log('[PlanTasksContextParser] ✅ Context.RL4 saved (internal write tracked, WAL + AtomicFS)');
      return true;
    } catch (error) {
      console.error('[PlanTasksContextParser] Failed to save Context.RL4:', error);
      return false;
    }
  }
  
  /**
   * MVP-2: Validate STRICT mode permissions
   * STRICT mode: P0 only, no file creations, no modifications outside scope
   */
  validateStrictMode(
    mutations: { filesCreated: string[]; filesModified: string[]; directoriesCreated: string[] },
    tasks: TasksData
  ): { valid: boolean; violations: string[] } {
    const violations: string[] = [];
    
    // Rule 1: No file creations
    if (mutations.filesCreated.length > 0) {
      violations.push(`STRICT: Cannot create files (${mutations.filesCreated.length} created: ${mutations.filesCreated.join(', ')})`);
    }
    
    // Rule 2: No directory creations
    if (mutations.directoriesCreated.length > 0) {
      violations.push(`STRICT: Cannot create directories (${mutations.directoriesCreated.join(', ')})`);
    }
    
    // Rule 3: Only P0 tasks
    const nonP0Tasks = tasks.active.filter(t => !t.task.includes('[P0]'));
    if (nonP0Tasks.length > 0) {
      violations.push(`STRICT: Only P0 tasks allowed (found non-P0: ${nonP0Tasks.length})`);
    }
    
    // Rule 4: Excessive modifications (soft warning)
    if (mutations.filesModified.length > 10) {
      violations.push(`STRICT: Suspicious number of file modifications (${mutations.filesModified.length})`);
    }
    
    return {
      valid: violations.length === 0,
      violations
    };
  }
  
  /**
   * MVP-2: Validate FLEXIBLE mode permissions
   * FLEXIBLE mode: P0+P1, max 3 files created, max 5 modified, no directories
   */
  validateFlexibleMode(
    mutations: { filesCreated: string[]; filesModified: string[]; directoriesCreated: string[] },
    tasks: TasksData
  ): { valid: boolean; violations: string[] } {
    const violations: string[] = [];
    
    // Rule 1: Max 3 files created
    if (mutations.filesCreated.length > 3) {
      violations.push(`FLEXIBLE: Max 3 files created (found ${mutations.filesCreated.length}: ${mutations.filesCreated.join(', ')})`);
    }
    
    // Rule 2: Max 5 files modified
    if (mutations.filesModified.length > 5) {
      violations.push(`FLEXIBLE: Max 5 files modified (found ${mutations.filesModified.length})`);
    }
    
    // Rule 3: No directory creations
    if (mutations.directoriesCreated.length > 0) {
      violations.push(`FLEXIBLE: Cannot create directories (${mutations.directoriesCreated.join(', ')})`);
    }
    
    // Rule 4: Only P0 + P1 tasks
    const invalidTasks = tasks.active.filter(t => 
      !t.task.includes('[P0]') && !t.task.includes('[P1]')
    );
    if (invalidTasks.length > 0) {
      violations.push(`FLEXIBLE: Only P0/P1 tasks allowed (found ${invalidTasks.length} invalid)`);
    }
    
    // Rule 5: Detect helper/util files (soft warning - log only)
    const helperFiles = mutations.filesCreated.filter(f => 
      f.includes('helper') || f.includes('util') || 
      f.includes('Helper') || f.includes('Util')
    );
    if (helperFiles.length > 0) {
      console.warn(`[PlanTasksContextParser] FLEXIBLE: Helper files detected (soft): ${helperFiles.join(', ')}`);
    }
    
    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Get active task count from Tasks.RL4
   */
  async getActiveTaskCount(): Promise<number> {
    try {
      const tasksData = this.parseTasks();
      if (!tasksData) {
        return 0;
      }
      return tasksData.active.length;
    } catch (error) {
      console.error('[PlanTasksContextParser] Failed to get active task count:', error);
      return 0;
    }
  }

  /**
   * Calculate plan drift (how much the current state deviates from the plan)
   */
  async calculatePlanDrift(): Promise<{ severity: string; drift: number; details: any }> {
    try {
      const plan = this.parsePlan();
      const tasks = this.parseTasks();
      const context = this.parseContext();

      if (!plan || !tasks || !context) {
        return {
          severity: 'UNKNOWN',
          drift: 0,
          details: { reason: 'Missing plan/tasks/context data' }
        };
      }

      // Calculate drift based on:
      // 1. Timeline progress vs expected
      // 2. Task completion rate
      // 3. Confidence level from context

      const now = new Date();
      const targetDate = plan.timeline?.target ? new Date(plan.timeline.target) : null;
      const startDate = plan.timeline?.start ? new Date(plan.timeline.start) : null;

      let drift = 0;
      let severity = 'LOW';

      // Timeline drift
      if (targetDate && startDate) {
        const totalDuration = targetDate.getTime() - startDate.getTime();
        const elapsed = now.getTime() - startDate.getTime();
        const expectedProgress = Math.min(elapsed / totalDuration, 1.0);
        
        // Estimate actual progress from task completion
        const totalTasks = tasks.active.length + tasks.completed.length;
        const completedTasks = tasks.completed.length;
        const actualProgress = totalTasks > 0 ? completedTasks / totalTasks : 0;

        drift = Math.abs(expectedProgress - actualProgress) * 100;

        if (drift > 50) {
          severity = 'CRITICAL';
        } else if (drift > 30) {
          severity = 'HIGH';
        } else if (drift > 15) {
          severity = 'MEDIUM';
        }
      }

      // Confidence-based adjustment
      if (context.confidence !== undefined) {
        const confidenceDrift = (1 - context.confidence) * 100;
        drift = Math.max(drift, confidenceDrift);
      }

      return {
        severity,
        drift: Math.round(drift * 100) / 100,
        details: {
          activeTasks: tasks.active.length,
          completedTasks: tasks.completed.length,
          confidence: context.confidence,
          timeline: plan.timeline
        }
      };
    } catch (error) {
      console.error('[PlanTasksContextParser] Failed to calculate plan drift:', error);
      return {
        severity: 'UNKNOWN',
        drift: 0,
        details: { error: String(error) }
      };
    }
  }
}

