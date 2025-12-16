import * as path from 'path';

const GOVERNANCE_DIR = 'governance';
const GOVERNANCE_FILES = new Set(['Plan.RL4', 'Tasks.RL4', 'Context.RL4', 'ADRs.RL4']);

export function isGovernanceFile(fileName: string): boolean {
  return GOVERNANCE_FILES.has(fileName);
}

export function getGovernanceRelativePath(fileName: string): string {
  return isGovernanceFile(fileName) ? `${GOVERNANCE_DIR}/${fileName}` : fileName;
}

export function getGovernanceAbsolutePath(basePath: string, fileName: string): string {
  return isGovernanceFile(fileName)
    ? path.join(basePath, GOVERNANCE_DIR, fileName)
    : path.join(basePath, fileName);
}

export function getGovernanceSegments(fileName: string): string[] {
  return isGovernanceFile(fileName) ? [GOVERNANCE_DIR, fileName] : [fileName];
}

