/**
 * System Status Types
 * Used for About tab and system health
 */

export interface SystemStatus {
    gitDeltaFixed: boolean;
    codecReady: boolean;
    diagnosticsReady: boolean;
    lastCheck: string;
    version: string;
}

export interface FAQItem {
    question: string;
    answer: string;
    category: 'codec' | 'logs' | 'general' | 'troubleshooting';
}

export interface PlanDrift {
    lastUpdated: string;
    driftLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    recommendations: string[];
    hoursSinceUpdate: number;
}

export interface Blindspots {
    bursts: number;
    gaps: number;
    samples: number;
    signals: BlindspotSignal[];
}

export interface BlindspotSignal {
    type: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    timestamp: string;
    description: string;
}

export interface TimeMachineResult {
    prompt: string;
    metrics: {
        range: { start: string; end: string };
        cyclesObserved: number;
        safeModeEvents: number;
        avgCognitiveLoad?: number;
        finalBytes: number;
    };
}