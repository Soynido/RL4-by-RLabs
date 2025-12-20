/******************************************************************************************
 * PromptSnapshot.ts - DTO Canonique du système RL4
 *
 * Structure SOUVERAINE et UNIVERSELLE pour tous les snapshots dans RL4.
 * Remplace les 3 PromptContext incompatibles par une définition unique.
 *
 * Règles non négociables :
 * 1. DTO PUR = pas de logique, pas de validation, pas de méthodes
 * 2. DONNÉES BRUTES = structures plates, serialisables, déterministes
 * 3. STABILITÉ VERSIONNÉE = chaque changement structurel = nouvelle version
 * 4. MÉTADONNÉES ESSENTIELLES = traçabilité minimale sans détails runtime
 * 5. KIND DISCRIMINANTS = discrimination par champ 'kind' (pas de marqueurs privés)
 ******************************************************************************************/

// === DÉFINITION DE VERSION SOUVERAINE ===

export const PROMPT_SNAPSHOT_VERSION = "snapshot-v1" as const;

// === INTERFACES TYPEDSCRIPT (DTO PUR) ===

export interface PromptSnapshotLayer {
  kind: "layer";
  id: number;
  name: string;
  weight: number;
  parent: number | "ROOT";
}

export interface PromptSnapshotTopic {
  kind: "topic";
  id: number;
  name: string;
  weight: number;
  refs: number[];
}

export interface PromptSnapshotEvent {
  kind: "event";
  id: number;
  time: number;
  type: "query" | "response" | "reflection" | "decision";
  ptr: string;
}

export interface PromptSnapshotDecision {
  kind: "decision";
  id: number;
  type: "accept" | "reject" | "modify" | "defer";
  weight: number;
  inputs: number[];
}

export interface PromptSnapshotInsight {
  kind: "insight";
  id: number;
  type: "pattern" | "anomaly" | "correlation" | "causation";
  salience: number;
  links: number[];
}

export interface PromptSnapshotIntegrity {
  totalWeight: number;
  layerCount: number;
  topicCount: number;
  eventCount: number;
  decisionCount: number;
  insightCount: number;
}

export interface PromptSnapshotSource {
  type: "runtime" | "replay" | "import";
  component: string;
  version?: string;
  artifacts?: string[]; // Optional: documents source artifacts (e.g., ["SnapshotData", "PromptContext"])
}

export interface PromptSnapshot {
  version: typeof PROMPT_SNAPSHOT_VERSION;
  timestamp: number;
  sessionId?: string;
  checksum: string;
  layers: PromptSnapshotLayer[];
  topics: PromptSnapshotTopic[];
  timeline: PromptSnapshotEvent[];
  decisions: PromptSnapshotDecision[];
  insights: PromptSnapshotInsight[];
  source: PromptSnapshotSource;
  generationTime: number;
  sourceVersion?: string;
  schema: "strict-v1" | "legacy-v1";
  integrity: PromptSnapshotIntegrity;
}