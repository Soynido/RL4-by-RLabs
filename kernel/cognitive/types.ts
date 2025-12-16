/**
 * Reasoning Layer Types - Level 7
 * 
 * Types for pattern learning, forecasting, and correlation detection
 */

export interface ADR {
    id: string;
    title: string;
    status: 'proposed' | 'accepted' | 'deprecated' | 'superseded';
    createdAt: string;
    modifiedAt: string;
    author: string;
    context: string;
    decision: string;
    consequences: string;
    tags: string[];
    components: string[];
    relatedADRs: string[];
    evidenceIds: string[];
    constraints?: {
        timeline?: string;
        budget?: string;
        resources?: string;
    };
    risks?: Array<{
        risk: string;
        probability: 'low' | 'medium' | 'high';
        impact: 'low' | 'medium' | 'high';
        mitigation?: string;
    }>;
    tradeoffs?: Array<{
        option: string;
        pros: string[];
        cons: string[];
    }>;
}

export interface DecisionPattern {
    id: string;
    pattern: string; // Human-readable pattern description
    frequency: number; // How many times this pattern occurred
    confidence: number; // 0-1, reliability of the pattern
    impact: 'Stability' | 'Performance' | 'Security' | 'Cost' | 'User_Experience' | 'Technical_Debt';
    category: 'structural' | 'cognitive' | 'contextual';
    tags?: string[]; // Tags for correlation matching
    firstSeen: string; // ISO timestamp
    lastSeen: string; // ISO timestamp
    evidenceIds: string[]; // Related evidence IDs
    adrCorrelations?: string[]; // Related ADR IDs
    recommendation?: string; // Suggested action
}

export interface Correlation {
    id: string;
    pattern_id: string;
    event_id: string;
    correlation_score: number;
    direction: 'confirming' | 'diverging' | 'emerging';
    tags: string[];
    impact: string;
    timestamp: string;
}

export interface Forecast {
    forecast_id: string;
    predicted_decision: string; // What decision is likely
    decision_type: 'ADR_Proposal' | 'Risk_Alert' | 'Opportunity' | 'Refactor';
    rationale: string[]; // Drivers for this prediction
    confidence: number; // 0-1, how likely this is to happen
    suggested_timeframe: string; // e.g., "Q1 2026", "Next Sprint"
    related_patterns?: string[]; // Pattern IDs that support this
    urgency: 'low' | 'medium' | 'high' | 'critical';
    estimated_effort?: 'low' | 'medium' | 'high';
}

export interface ADRProposal {
    proposal_id: string;
    title: string;
    status: 'draft' | 'proposed' | 'accepted' | 'rejected';
    context: string; // Why this ADR is needed
    decision: string; // What decision is being proposed
    consequences: string[]; // Expected outcomes
    alternatives?: string[]; // Considered alternatives
    relatedForecast: string; // Forecast ID
    confidence: number;
    generated_at: string;
    proposed_by: 'system' | string;
    evidence_summary: {
        supporting_evidence: number;
        conflicting_evidence: number;
        neutral_evidence: number;
    };
}

export interface BiasAlert {
    id: string;
    type: 'groupthink' | 'overconfidence' | 'recency_bias' | 'confirmation_bias' | 'status_quo';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    affected_area: string; // What domain is affected
    recommendation: string;
    detected_at: string;
    relatedADRs?: string[];
}

export interface ReasoningSnapshot {
    snapshot_id: string;
    generated_at: string;
    version: string;
    
    patterns: {
        total: number;
        by_category: Record<string, number>;
        by_impact: Record<string, number>;
    };
    
    forecasts: {
        total: number;
        by_urgency: Record<string, number>;
        by_type: Record<string, number>;
    };
    
    correlations: {
        total: number;
        by_type: Record<string, number>;
    };
    
    adr_proposals: {
        total: number;
        by_status: Record<string, number>;
    };
    
    bias_alerts: {
        total: number;
        by_severity: Record<string, number>;
    };
}

