/**
 * GroundTruthSystem — Système de vérité terrain pour drift detection
 * 
 * MVP-1 : Ground Truth immutable établi en mode firstUse
 * 
 * Workflow :
 * 1. FirstUse génère Plan/Tasks/Context.RL4
 * 2. Ground Truth sauvegarde des copies YAML dans ground_truth/
 * 3. Ces fichiers sont IMMUTABLES (jamais modifiés)
 * 4. DEPRECATED: BiasCalculator removed (violation Loi 1) - Drift detection should be done by LLM via prompts
 * 
 * Structure :
 * .reasoning_rl4/ground_truth/
 *   ├── Plan.yaml
 *   ├── Tasks.yaml
 *   ├── Context.yaml
 *   └── snapshot_metadata.json
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { PlanData, TasksData, ContextData } from '../api/PlanTasksContextParser';
import { ADRFromFile } from '../api/ADRParser';

export interface GroundTruthMetadata {
  established_at: string;
  workspace_root: string;
  project_name: string;
  project_description: string;
  tech_stack: string[];
  files_scanned: number;
  hash: string; // SHA-256 of combined Plan+Tasks+Context
}

export class GroundTruthSystem {
  private rl4Path: string;
  private groundTruthPath: string;
  
  constructor(rl4Path: string) {
    this.rl4Path = rl4Path;
    this.groundTruthPath = path.join(rl4Path, 'ground_truth');
  }
  
  /**
   * Establish ground truth (called once after firstUse)
   */
  async establish(
    plan: PlanData,
    tasks: TasksData,
    context: ContextData,
    metadata: Partial<GroundTruthMetadata>
  ): Promise<void> {
    // Create ground_truth directory
    if (!fs.existsSync(this.groundTruthPath)) {
      fs.mkdirSync(this.groundTruthPath, { recursive: true });
    }
    
    // Check if already established
    if (this.isEstablished()) {
      throw new Error('Ground truth already established. Cannot overwrite immutable baseline.');
    }
    
    // Save Plan.yaml
    const planYaml = yaml.dump({
      version: plan.version,
      updated: plan.updated,
      confidence: plan.confidence,
      phase: plan.phase,
      goal: plan.goal,
      timeline: plan.timeline,
      successCriteria: plan.successCriteria,
      constraints: plan.constraints
    });
    fs.writeFileSync(path.join(this.groundTruthPath, 'Plan.yaml'), planYaml);
    
    // Save Tasks.yaml
    const tasksYaml = yaml.dump({
      version: tasks.version,
      updated: tasks.updated,
      bias: tasks.bias,
      active: tasks.active,
      blockers: tasks.blockers,
      completed: tasks.completed
    });
    fs.writeFileSync(path.join(this.groundTruthPath, 'Tasks.yaml'), tasksYaml);
    
    // Save Context.yaml
    const contextYaml = yaml.dump({
      version: context.version,
      updated: context.updated,
      confidence: context.confidence,
      kpis_llm: context.kpis_llm,
      kpis_kernel: context.kpis_kernel,
      activeFiles: context.activeFiles,
      recentActivity: context.recentActivity,
      health: context.health,
      observations: context.observations
    });
    fs.writeFileSync(path.join(this.groundTruthPath, 'Context.yaml'), contextYaml);
    
    // Calculate hash
    const hash = this.calculateHash(planYaml, tasksYaml, contextYaml);
    
    // Save metadata
    const fullMetadata: GroundTruthMetadata = {
      established_at: new Date().toISOString(),
      workspace_root: metadata.workspace_root || '',
      project_name: metadata.project_name || 'Unknown',
      project_description: metadata.project_description || '',
      tech_stack: metadata.tech_stack || [],
      files_scanned: metadata.files_scanned || 0,
      hash
    };
    
    fs.writeFileSync(
      path.join(this.groundTruthPath, 'snapshot_metadata.json'),
      JSON.stringify(fullMetadata, null, 2)
    );
    
    console.log('[GroundTruthSystem] ✅ Ground truth established');
    console.log(`  Hash: ${hash}`);
    console.log(`  Project: ${fullMetadata.project_name}`);
  }
  
  /**
   * Check if ground truth is established
   */
  isEstablished(): boolean {
    return fs.existsSync(path.join(this.groundTruthPath, 'Plan.yaml')) &&
           fs.existsSync(path.join(this.groundTruthPath, 'Tasks.yaml')) &&
           fs.existsSync(path.join(this.groundTruthPath, 'Context.yaml')) &&
           fs.existsSync(path.join(this.groundTruthPath, 'snapshot_metadata.json'));
  }
  
  /**
   * Load ground truth Plan
   */
  loadPlan(): PlanData | null {
    const planPath = path.join(this.groundTruthPath, 'Plan.yaml');
    
    if (!fs.existsSync(planPath)) {
      return null;
    }
    
    try {
      const content = fs.readFileSync(planPath, 'utf8');
      const parsed = yaml.load(content) as any;
      
      return {
        version: parsed.version,
        updated: parsed.updated,
        confidence: parsed.confidence,
        phase: parsed.phase,
        goal: parsed.goal,
        timeline: parsed.timeline,
        successCriteria: parsed.successCriteria || [],
        constraints: parsed.constraints || []
      };
    } catch (error) {
      console.error('[GroundTruthSystem] Failed to load Plan.yaml:', error);
      return null;
    }
  }
  
  /**
   * Load ground truth Tasks
   */
  loadTasks(): TasksData | null {
    const tasksPath = path.join(this.groundTruthPath, 'Tasks.yaml');
    
    if (!fs.existsSync(tasksPath)) {
      return null;
    }
    
    try {
      const content = fs.readFileSync(tasksPath, 'utf8');
      const parsed = yaml.load(content) as any;
      
      return {
        version: parsed.version,
        updated: parsed.updated,
        bias: parsed.bias,
        active: parsed.active || [],
        blockers: parsed.blockers || [],
        completed: parsed.completed || []
      };
    } catch (error) {
      console.error('[GroundTruthSystem] Failed to load Tasks.yaml:', error);
      return null;
    }
  }
  
  /**
   * Load ground truth Context
   */
  loadContext(): ContextData | null {
    const contextPath = path.join(this.groundTruthPath, 'Context.yaml');
    
    if (!fs.existsSync(contextPath)) {
      return null;
    }
    
    try {
      const content = fs.readFileSync(contextPath, 'utf8');
      const parsed = yaml.load(content) as any;
      
      return {
        version: parsed.version,
        updated: parsed.updated,
        confidence: parsed.confidence,
        kpis_llm: parsed.kpis_llm || [],
        kpis_kernel: parsed.kpis_kernel || [],
        activeFiles: parsed.activeFiles || [],
        recentActivity: parsed.recentActivity || { cycles: 0, commits: 0, duration: '0h' },
        health: parsed.health || { memory: 'Unknown', eventLoop: 'Unknown', uptime: 'Unknown' },
        observations: parsed.observations || []
      };
    } catch (error) {
      console.error('[GroundTruthSystem] Failed to load Context.yaml:', error);
      return null;
    }
  }
  
  /**
   * Load metadata
   */
  loadMetadata(): GroundTruthMetadata | null {
    const metadataPath = path.join(this.groundTruthPath, 'snapshot_metadata.json');
    
    if (!fs.existsSync(metadataPath)) {
      return null;
    }
    
    try {
      const content = fs.readFileSync(metadataPath, 'utf8');
      return JSON.parse(content) as GroundTruthMetadata;
    } catch (error) {
      console.error('[GroundTruthSystem] Failed to load metadata:', error);
      return null;
    }
  }
  
  /**
   * Calculate combined hash (SHA-256 equivalent using simple hash)
   */
  private calculateHash(...contents: string[]): string {
    const combined = contents.join('|||');
    
    // Simple hash function (for production, use crypto.createHash('sha256'))
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
  
  /**
   * Verify ground truth integrity
   */
  verifyIntegrity(): { valid: boolean; error?: string } {
    if (!this.isEstablished()) {
      return { valid: false, error: 'Ground truth not established' };
    }
    
    try {
      // Load all files
      const plan = this.loadPlan();
      const tasks = this.loadTasks();
      const context = this.loadContext();
      const metadata = this.loadMetadata();
      
      if (!plan || !tasks || !context || !metadata) {
        return { valid: false, error: 'Failed to load ground truth files' };
      }
      
      // Recalculate hash
      const planYaml = yaml.dump(plan);
      const tasksYaml = yaml.dump(tasks);
      const contextYaml = yaml.dump(context);
      const currentHash = this.calculateHash(planYaml, tasksYaml, contextYaml);
      
      if (currentHash !== metadata.hash) {
        return { valid: false, error: `Hash mismatch: expected ${metadata.hash}, got ${currentHash}` };
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, error: `Integrity check failed: ${error}` };
    }
  }
  
  /**
   * Get drift report (compare current vs ground truth)
   */
  getDriftReport(currentPlan: PlanData, currentTasks: TasksData, currentContext: ContextData): {
    planDrift: number;
    tasksDrift: number;
    contextDrift: number;
    totalDrift: number;
  } {
    const gtPlan = this.loadPlan();
    const gtTasks = this.loadTasks();
    const gtContext = this.loadContext();
    
    if (!gtPlan || !gtTasks || !gtContext) {
      return { planDrift: 0, tasksDrift: 0, contextDrift: 0, totalDrift: 0 };
    }
    
    // Calculate drift per file (simple text diff)
    const planDrift = this.calculateTextDrift(gtPlan.goal, currentPlan.goal);
    const tasksDrift = this.calculateTasksDrift(gtTasks.active, currentTasks.active);
    const contextDrift = this.calculateArrayDrift(gtContext.activeFiles, currentContext.activeFiles);
    
    const totalDrift = (planDrift + tasksDrift + contextDrift) / 3;
    
    return {
      planDrift: Math.round(planDrift * 100),
      tasksDrift: Math.round(tasksDrift * 100),
      contextDrift: Math.round(contextDrift * 100),
      totalDrift: Math.round(totalDrift * 100)
    };
  }
  
  /**
   * Calculate text drift (Levenshtein-based)
   */
  private calculateTextDrift(original: string, current: string): number {
    const maxLen = Math.max(original.length, current.length);
    if (maxLen === 0) return 0;
    
    const distance = this.levenshteinDistance(original.toLowerCase(), current.toLowerCase());
    return distance / maxLen;
  }
  
  /**
   * Calculate tasks drift (added/removed)
   */
  private calculateTasksDrift(originalTasks: any[], currentTasks: any[]): number {
    const originalCount = originalTasks.length;
    const currentCount = currentTasks.length;
    const maxCount = Math.max(originalCount, currentCount);
    
    if (maxCount === 0) return 0;
    
    const diff = Math.abs(originalCount - currentCount);
    return diff / maxCount;
  }
  
  /**
   * Calculate array drift (for activeFiles, etc.)
   */
  private calculateArrayDrift(originalArray: string[], currentArray: string[]): number {
    const originalSet = new Set(originalArray);
    const currentSet = new Set(currentArray);
    
    const added = [...currentSet].filter(item => !originalSet.has(item)).length;
    const removed = [...originalSet].filter(item => !currentSet.has(item)).length;
    const total = Math.max(originalArray.length, currentArray.length);
    
    if (total === 0) return 0;
    
    return (added + removed) / (total * 2);
  }
  
    /**
     * Levenshtein distance
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
     * Save structural ADR to ground_truth/ADRs.yaml
     * Only called for ADRs with status="accepted" and tag="structural"
     */
    async saveADR(adr: ADRFromFile): Promise<void> {
        if (!this.isEstablished()) {
            console.warn('[GroundTruthSystem] Ground truth not established, skipping ADR save');
            return;
        }

        const adrsPath = path.join(this.groundTruthPath, 'ADRs.yaml');
        
        // Load existing ADRs or create new array
        let existingADRs: any[] = [];
        if (fs.existsSync(adrsPath)) {
            try {
                const content = fs.readFileSync(adrsPath, 'utf8');
                const parsed = yaml.load(content) as any;
                existingADRs = Array.isArray(parsed?.adrs) ? parsed.adrs : [];
            } catch (error) {
                console.error('[GroundTruthSystem] Failed to load existing ADRs:', error);
            }
        }

        // Check if ADR already exists
        if (existingADRs.some(a => a.id === adr.id)) {
            console.log(`[GroundTruthSystem] ADR ${adr.id} already in ground_truth, skipping`);
            return;
        }

        // Add new ADR
        existingADRs.push({
            id: adr.id,
            title: adr.title,
            status: adr.status,
            date: adr.date,
            author: adr.author,
            context: adr.context,
            decision: adr.decision,
            consequences: adr.consequences,
            saved_at: new Date().toISOString()
        });

        // Save to YAML
        const yamlContent = yaml.dump({ adrs: existingADRs });
        fs.writeFileSync(adrsPath, yamlContent, 'utf8');
        console.log(`[GroundTruthSystem] ✅ Saved structural ADR ${adr.id} to ground_truth`);
    }

    /**
     * Load ADRs from ground_truth/ADRs.yaml
     */
    loadADRs(): ADRFromFile[] {
        const adrsPath = path.join(this.groundTruthPath, 'ADRs.yaml');
        
        if (!fs.existsSync(adrsPath)) {
            return [];
        }

        try {
            const content = fs.readFileSync(adrsPath, 'utf8');
            const parsed = yaml.load(content) as any;
            const adrs = Array.isArray(parsed?.adrs) ? parsed.adrs : [];
            // Convert to ADRFromFile format (remove saved_at if present)
            return adrs.map((adr: any) => ({
                id: adr.id,
                title: adr.title,
                status: adr.status,
                date: adr.date,
                author: adr.author,
                context: adr.context,
                decision: adr.decision,
                consequences: adr.consequences
            } as ADRFromFile));
        } catch (error) {
            console.error('[GroundTruthSystem] Failed to load ADRs from ground_truth:', error);
            return [];
        }
    }
}

