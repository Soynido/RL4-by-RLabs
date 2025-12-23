// Core types for the WebView store and data contracts (aligned with RL6 backend).

export type GovernanceMode = 'strict' | 'flexible' | 'exploratory' | 'free' | 'firstUse';

export interface WorkspaceEvidence {
  git_commits: number;
  git_age_days: number;
  git_contributors: number;
  files_count: number;
  source_files_count: number;
  has_package_json: boolean;
  has_git: boolean;
  recent_activity: boolean;
  first_commit_date: string | null;
  last_commit_date: string | null;
  recent_commits_3_months: number;
}

export interface WorkspaceStateFromKernel {
  mode: 'existing' | 'new' | 'ambiguous';
  confidence: number;
  evidence: WorkspaceEvidence;
  recommendation: string;
  isLargeProject: boolean;
  requiresGitHubConnect: boolean;
  largeProjectReason?: string;
  firstUseMode?: 'standard' | 'extended';
  firstUseReasons?: string[];
}

export interface RepoDelta {
  totalFiles: number;
  modified: number;
  untracked: number;
  staged: number;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  lastSnapshotTime?: number;
}

export interface PlanDrift {
  lastUpdated: string;
  driftLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendations: string[];
  hoursSinceUpdate: number;
}

export interface BlindspotSignal {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  timestamp: string;
  description: string;
}

export interface Blindspots {
  bursts: number;
  gaps: number;
  samples: number;
  signals: BlindspotSignal[];
}

export interface CapturedItem {
  id?: string;
  title?: string;
  description?: string;
}

export interface Task {
  id: string;
  title: string;
  source?: 'local' | 'rl4' | 'captured';
  completed?: boolean;
  priority?: 'P0' | 'P1' | 'P2' | 'P3' | 'local';
  promotionState?: 'promotedPending' | 'canonical';
  canonicalized?: boolean;
  priorityMissing?: boolean;
  updatedAt?: string;
}

export interface KernelStatus {
  running?: boolean;
  uptime?: number;
  timers?: number;
  queueSize?: number;
  version?: string;
}

// Slice contracts
export interface UISlice {
  activeTab: 'control' | 'dev' | 'timemachine' | 'insights' | 'about' | 'rebuild';
  theme: 'ghost' | 'mint' | 'uv';
  kernelReady: boolean;
  bootPhase: 'booting' | 'detecting' | 'hydrating' | 'ready' | 'error';
  safeMode: boolean;
  safeModeReason: string | null;
  setActiveTab: (tab: UISlice['activeTab']) => void;
  setTheme: (theme: UISlice['theme']) => void;
  setKernelReady: (ready: boolean) => void;
  setBootPhase: (phase: UISlice['bootPhase']) => void;
  setSafeMode: (safe: boolean) => void;
  setSafeModeReason: (reason: string | null) => void;
}

export interface WorkspaceSlice {
  workspace: WorkspaceStateFromKernel | null;
  mode: GovernanceMode;
  onboardingComplete: boolean;
  onboardingStep: number;
  onboardingHints: any[];
  rebuildResult: { success: boolean; cyclesIndexed?: number } | null;
  setWorkspace: (ws: WorkspaceStateFromKernel | null) => void;
  setMode: (mode: GovernanceMode) => void;
  setOnboardingComplete: (complete: boolean) => void;
  setOnboardingStep: (step: number) => void;
  setOnboardingHints: (hints: any[]) => void;
  setRebuildResult: (result: { success: boolean; cyclesIndexed?: number } | null) => void;
}

export interface DevSlice {
  localTasks: Task[];
  capturedItems: CapturedItem[];
  rl4Tasks: Task[];
  taskFilter: 'all' | 'P0' | 'P1' | 'P2';
  autoTasksCount: number;
  setLocalTasks: (tasks: Task[]) => void;
  setCapturedItems: (items: CapturedItem[]) => void;
  setRL4Tasks: (tasks: Task[]) => void;
  setTaskFilter: (filter: DevSlice['taskFilter']) => void;
  setAutoTasksCount: (count: number) => void;
}

export interface InsightsSlice {
  repoDelta: RepoDelta | null;
  planDrift: PlanDrift | null;
  blindspots: Blindspots | null;
  currentPhase: string;
  lastRefresh: number;
  setRepoDelta: (delta: RepoDelta | null) => void;
  setPlanDrift: (drift: PlanDrift | null) => void;
  setBlindspots: (b: Blindspots | null) => void;
  setCurrentPhase: (phase: string) => void;
  setInsightsRefreshed: () => void;
}

export interface TimeMachineSlice {
  startDate: string;
  endDate: string;
  minDate: string | null;
  maxDate: string;
  loading: boolean;
  timeMachinePrompt: string | null;
  error: string | null;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
  setMinDate: (v: string | null) => void;
  setMaxDate: (v: string) => void;
  setTMLoading: (v: boolean) => void;
  setTMPrompt: (p: string | null) => void;
  setTMError: (e: string | null) => void;
}

export interface SnapshotSlice {
  loading: boolean;
  snapshotPrompt: string | null;
  lastSnapshotIso: string | null;
  filesChanged: number;
  success: boolean;
  setSnapshotLoading: (v: boolean) => void;
  setSnapshotPrompt: (p: string | null) => void;
  setLastSnapshotIso: (iso: string | null) => void;
  setFilesChanged: (n: number) => void;
  setSnapshotSuccess: (v: boolean) => void;
}

export type StoreState = UISlice &
  WorkspaceSlice &
  DevSlice &
  InsightsSlice &
  TimeMachineSlice &
  SnapshotSlice;

