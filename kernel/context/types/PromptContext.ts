/******************************************************************************************
 * PromptContext.ts — Core Context Types for RL6
 *
 * Defines the fundamental data structures for cognitive context representation
 * Decoupled from any specific encoding or protocol
 ******************************************************************************************/

export interface PromptContextMetadata {
  sessionId: string;
  llmModel: string;
  contextWindow: number;
  encodingTime: number;
  ptrScheme: "mil-his-v1" | "internal-v1";
}

export interface Layer {
  id: number;
  name: string;
  weight: number; // 0-999
  parent: number | "ROOT";
}

export interface Topic {
  id: number;
  name: string;
  weight: number; // 0-999
  refs: number[];
}

export interface TimelineEvent {
  id: number;
  time: number; // Unix timestamp
  type: "query" | "response" | "reflection" | "decision";
  ptr: string;
}

export interface Decision {
  id: number;
  type: "accept" | "reject" | "modify" | "defer";
  weight: number; // 0-999
  inputs: number[];
}

export interface Insight {
  id: number;
  type: "pattern" | "anomaly" | "correlation" | "causation";
  salience: number; // 0-999
  links: number[];
}

export interface HumanSummary {
  type: "brief" | "detailed" | "technical";
  text: string;
}

export interface PromptContext {
  metadata: PromptContextMetadata;
  layers: Layer[];
  topics: Topic[];
  timeline: TimelineEvent[];
  decisions: Decision[];
  insights: Insight[];
  humanSummary?: HumanSummary;
}

// Type guards
export function isValidLayer(obj: any): obj is Layer {
  return obj &&
    typeof obj.id === 'number' &&
    typeof obj.name === 'string' &&
    typeof obj.weight === 'number' &&
    (obj.parent === 'ROOT' || typeof obj.parent === 'number');
}

export function isValidTopic(obj: any): obj is Topic {
  return obj &&
    typeof obj.id === 'number' &&
    typeof obj.name === 'string' &&
    typeof obj.weight === 'number' &&
    Array.isArray(obj.refs) &&
    obj.refs.every((r: any) => typeof r === 'number');
}

export function isValidTimelineEvent(obj: any): obj is TimelineEvent {
  return obj &&
    typeof obj.id === 'number' &&
    typeof obj.time === 'number' &&
    ['query', 'response', 'reflection', 'decision'].includes(obj.type) &&
    typeof obj.ptr === 'string';
}

export function isValidDecision(obj: any): obj is Decision {
  return obj &&
    typeof obj.id === 'number' &&
    ['accept', 'reject', 'modify', 'defer'].includes(obj.type) &&
    typeof obj.weight === 'number' &&
    Array.isArray(obj.inputs) &&
    obj.inputs.every((i: any) => typeof i === 'number');
}

export function isValidInsight(obj: any): obj is Insight {
  return obj &&
    typeof obj.id === 'number' &&
    ['pattern', 'anomaly', 'correlation', 'causation'].includes(obj.type) &&
    typeof obj.salience === 'number' &&
    Array.isArray(obj.links) &&
    obj.links.every((l: any) => typeof l === 'number');
}

export function isValidHumanSummary(obj: any): obj is HumanSummary {
  return obj &&
    ['brief', 'detailed', 'technical'].includes(obj.type) &&
    typeof obj.text === 'string';
}

export function isValidPromptContext(obj: any): obj is PromptContext {
  return obj &&
    typeof obj.metadata === 'object' &&
    Array.isArray(obj.layers) && obj.layers.every(isValidLayer) &&
    Array.isArray(obj.topics) && obj.topics.every(isValidTopic) &&
    Array.isArray(obj.timeline) && obj.timeline.every(isValidTimelineEvent) &&
    Array.isArray(obj.decisions) && obj.decisions.every(isValidDecision) &&
    Array.isArray(obj.insights) && obj.insights.every(isValidInsight) &&
    (!obj.humanSummary || isValidHumanSummary(obj.humanSummary));
}