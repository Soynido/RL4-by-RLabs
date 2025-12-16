/******************************************************************************************
 * SnapshotData.ts — Raw Data Collection Types
 *
 * Defines structures for collecting and normalizing raw snapshot data
 * before conversion to PromptContext
 ******************************************************************************************/

export interface CodeSnapshot {
  files: CodeFileSnapshot[];
  dependencies: DependencySnapshot[];
  imports: ImportSnapshot[];
  exports: ExportSnapshot[];
  functions: FunctionSnapshot[];
  classes: ClassSnapshot[];
}

export interface CodeFileSnapshot {
  path: string;
  size: number;
  lastModified: number;
  language: string;
  lines: number;
  complexity: number;
  purposes: string[];
}

export interface DependencySnapshot {
  name: string;
  version: string;
  type: 'npm' | 'git' | 'local';
  dev: boolean;
  size?: number;
}

export interface ImportSnapshot {
  source: string;
  module: string;
  imports: string[];
  type: 'default' | 'named' | 'namespace' | 'side-effect';
  dynamic: boolean;
}

export interface ExportSnapshot {
  name: string;
  type: 'function' | 'class' | 'variable' | 'type';
  default: boolean;
  source: string;
}

export interface FunctionSnapshot {
  name: string;
  file: string;
  line: number;
  parameters: string[];
  returnType?: string;
  async: boolean;
  exported: boolean;
  complexity: number;
}

export interface ClassSnapshot {
  name: string;
  file: string;
  line: number;
  methods: MethodSnapshot[];
  properties: PropertySnapshot[];
  exported: boolean;
  extends?: string;
  implements?: string[];
}

export interface MethodSnapshot {
  name: string;
  parameters: string[];
  returnType?: string;
  async: boolean;
  static: boolean;
  visibility: 'public' | 'private' | 'protected';
  complexity: number;
}

export interface PropertySnapshot {
  name: string;
  type?: string;
  static: boolean;
  visibility: 'public' | 'private' | 'protected';
  readonly: boolean;
}

export interface HistorySnapshot {
  commits: CommitSnapshot[];
  branches: BranchSnapshot[];
  currentBranch: string;
  lastCommit: string;
  ahead: number;
  behind: number;
}

export interface CommitSnapshot {
  hash: string;
  message: string;
  author: string;
  timestamp: number;
  files: string[];
  type: 'feature' | 'fix' | 'refactor' | 'docs' | 'test' | 'chore';
  breaking: boolean;
}

export interface BranchSnapshot {
  name: string;
  remote: boolean;
  ahead: number;
  behind: number;
  lastCommit: string;
}

export interface TaskSnapshot {
  current: TaskItem[];
  completed: TaskItem[];
  planned: TaskItem[];
  blocked: TaskItem[];
}

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'todo' | 'in-progress' | 'review' | 'done' | 'blocked';
  assignee?: string;
  tags: string[];
  dependencies: string[];
  createdAt: number;
  updatedAt: number;
  dueAt?: number;
}

export interface ProjectSnapshot {
  name: string;
  description?: string;
  version: string;
  type: 'application' | 'library' | 'tool' | 'monorepo';
  framework?: string;
  language: string[];
  scripts: Record<string, string>;
  config: ProjectConfigSnapshot;
}

export interface ProjectConfigSnapshot {
  build: string[];
  test: string[];
  lint: string[];
  format: string[];
  deploy?: string[];
  environment: Record<string, string>;
  features: Record<string, boolean>;
}

export interface AnomalySnapshot {
  issues: AnomalyItem[];
  warnings: AnomalyItem[];
  suggestions: AnomalyItem[];
}

export interface AnomalyItem {
  id: string;
  type: 'error' | 'warning' | 'suggestion' | 'info';
  category: 'syntax' | 'logic' | 'performance' | 'security' | 'style' | 'dependency';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  rule?: string;
  fixAvailable: boolean;
  autoFixable: boolean;
}

// Main snapshot container
export interface SnapshotData {
  timestamp: number;
  sessionId: string;
  project: ProjectSnapshot;
  code: CodeSnapshot;
  history: HistorySnapshot;
  tasks: TaskSnapshot;
  anomalies: AnomalySnapshot;
  workingSet: string[];
  goals: string[];
}

// Type guards
export function isValidSnapshotData(obj: any): obj is SnapshotData {
  return obj &&
    typeof obj.timestamp === 'number' &&
    typeof obj.sessionId === 'string' &&
    typeof obj.project === 'object' &&
    typeof obj.code === 'object' &&
    typeof obj.history === 'object' &&
    typeof obj.tasks === 'object' &&
    typeof obj.anomalies === 'object' &&
    Array.isArray(obj.workingSet) &&
    Array.isArray(obj.goals);
}

export function createEmptySnapshot(sessionId?: string): SnapshotData {
  return {
    timestamp: Date.now(),
    sessionId: sessionId || '',
    project: {
      name: '',
      version: '1.0.0',
      type: 'application',
      language: [],
      scripts: {},
      config: {
        build: [],
        test: [],
        lint: [],
        format: [],
        environment: {},
        features: {}
      }
    },
    code: {
      files: [],
      dependencies: [],
      imports: [],
      exports: [],
      functions: [],
      classes: []
    },
    history: {
      commits: [],
      branches: [],
      currentBranch: 'main',
      lastCommit: '',
      ahead: 0,
      behind: 0
    },
    tasks: {
      current: [],
      completed: [],
      planned: [],
      blocked: []
    },
    anomalies: {
      issues: [],
      warnings: [],
      suggestions: []
    },
    workingSet: [],
    goals: []
  };
}