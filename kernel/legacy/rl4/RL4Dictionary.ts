/**
 * RL4 Dictionary - Cognitive Pattern Dictionary for Reasoning Layer 4
 *
 * Modules 8342, 9319, 9609 - Cognitive pattern recognition and interpretation
 *
 * Provides:
 * - Pattern definitions and categorization
 * - Intent inference from context
 * - Relevance scoring for patterns
 * - Semantic mapping for cognitive processing
 * - Heuristics for pattern matching
 */

import * as path from 'path';
import { RL4Messages } from './RL4Messages';

export namespace RL4Dictionary {
    // ============================================================================
    // PATTERN DEFINITIONS
    // ============================================================================

    export interface PatternDefinition {
        id: string;
        name: string;
        category: PatternCategory;
        keywords: string[];
        filePatterns: string[];
        commandPatterns: string[];
        gitMessagePatterns: RegExp[];
        weight: number;
        confidence: number;
        contextRequirements: string[];
        implications: string[];
        relatedPatterns: string[];
    }

    export enum PatternCategory {
        REFACTORING = 'refactoring',
        FEATURE_DEVELOPMENT = 'feature_development',
        BUG_FIX = 'bug_fix',
        DOCUMENTATION = 'documentation',
        TESTING = 'testing',
        CONFIGURATION = 'configuration',
        MAINTENANCE = 'maintenance',
        PERFORMANCE_OPTIMIZATION = 'performance_optimization',
        SECURITY_HARDENING = 'security_hardening',
        RESEARCH = 'research',
        LEARNING = 'learning',
        EXPLORATION = 'exploration'
    }

    export interface CognitiveCategory {
        id: string;
        name: string;
        description: string;
        characteristics: string[];
        behavioralIndicators: string[];
        temporalPatterns: string[];
        workingMemoryRequirements: 'low' | 'medium' | 'high';
        complexityLevel: 'simple' | 'moderate' | 'complex';
    }

    export interface InterpretationRule {
        id: string;
        name: string;
        conditions: RuleCondition[];
        actions: RuleAction[];
        priority: number;
        confidence: number;
        context: string[];
    }

    export interface RuleCondition {
        type: 'file_pattern' | 'keyword' | 'temporal' | 'frequency' | 'sequence';
        operator: 'equals' | 'contains' | 'matches' | 'greater_than' | 'less_than' | 'within';
        value: any;
        weight: number;
    }

    export interface RuleAction {
        type: 'classify' | 'score' | 'tag' | 'flag' | 'route';
        parameters: Record<string, any>;
    }

    export interface SemanticMapping {
        fromTerm: string;
        toConcept: string;
        confidence: number;
        context: string[];
        synonyms: string[];
    }

    export interface HeuristicRule {
        id: string;
        name: string;
        description: string;
        trigger: HeuristicTrigger;
        evaluation: HeuristicEvaluation;
        result: HeuristicResult;
    }

    export interface HeuristicTrigger {
        eventType: string[];
        conditions: any;
        timeWindow?: number; // milliseconds
        minOccurrences?: number;
    }

    export interface HeuristicEvaluation {
        algorithm: string;
        parameters: Record<string, any>;
        threshold: number;
    }

    export interface HeuristicResult {
        classification: string;
        confidence: number;
        metadata?: Record<string, any>;
    }

    // ============================================================================
    // MAIN DICTIONARY CLASS
    // ============================================================================

    export class RL4CognitiveDictionary {
        private patterns: Map<string, PatternDefinition> = new Map();
        private categories: Map<PatternCategory, CognitiveCategory> = new Map();
        private rules: Map<string, InterpretationRule> = new Map();
        private semanticMappings: Map<string, SemanticMapping> = new Map();
        private heuristics: Map<string, HeuristicRule> = new Map();

        constructor() {
            this.initializePatterns();
            this.initializeCategories();
            this.initializeRules();
            this.initializeSemanticMappings();
            this.initializeHeuristics();
        }

        // ========================================================================
        // PATTERN MATCHING API
        // ========================================================================

        /**
         * Get pattern category based on file extension
         */
        getPatternCategory(extension: string): PatternCategory {
            const ext = extension.toLowerCase();

            // Direct mappings
            const extensionMappings: Record<string, PatternCategory> = {
                '.md': PatternCategory.DOCUMENTATION,
                '.rst': PatternCategory.DOCUMENTATION,
                '.txt': PatternCategory.DOCUMENTATION,
                '.test.js': PatternCategory.TESTING,
                '.test.ts': PatternCategory.TESTING,
                '.spec.js': PatternCategory.TESTING,
                '.spec.ts': PatternCategory.TESTING,
                '.test.py': PatternCategory.TESTING,
                '_test.rb': PatternCategory.TESTING,
                '.config.js': PatternCategory.CONFIGURATION,
                '.config.ts': PatternCategory.CONFIGURATION,
                '.json': PatternCategory.CONFIGURATION,
                '.yaml': PatternCategory.CONFIGURATION,
                '.yml': PatternCategory.CONFIGURATION,
                '.toml': PatternCategory.CONFIGURATION,
                '.ini': PatternCategory.CONFIGURATION,
                '.env': PatternCategory.CONFIGURATION
            };

            if (extensionMappings[ext]) {
                return extensionMappings[ext];
            }

            // Pattern-based matching
            if (ext.includes('config') || ext.includes('rc')) {
                return PatternCategory.CONFIGURATION;
            }

            if (ext.includes('test') || ext.includes('spec')) {
                return PatternCategory.TESTING;
            }

            if (ext.includes('doc') || ext.includes('readme')) {
                return PatternCategory.DOCUMENTATION;
            }

            // Default based on language
            const codeExtensions = ['.js', '.ts', '.py', '.rs', '.java', '.cpp', '.c', '.go', '.rb', '.php'];
            if (codeExtensions.includes(ext)) {
                return PatternCategory.FEATURE_DEVELOPMENT; // Default for code files
            }

            return PatternCategory.MAINTENANCE;
        }

        /**
         * Infer intent from context
         */
        inferIntentFromContext(context: any): {
            intent: PatternCategory;
            confidence: number;
            reasoning: string[];
            relatedPatterns: string[];
        } {
            const scores = new Map<PatternCategory, number>();
            const reasoning: string[] = [];
            const relatedPatterns: Set<string> = new Set();

            // Analyze file patterns
            if (context.files) {
                for (const file of context.files) {
                    const category = this.getPatternCategory(path.extname(file));
                    scores.set(category, (scores.get(category) || 0) + 1);

                    // Find related patterns
                    for (const [id, pattern] of this.patterns) {
                        if (pattern.category === category) {
                            relatedPatterns.add(id);
                        }
                    }
                }
            }

            // Analyze git messages
            if (context.gitMessages) {
                for (const message of context.gitMessages) {
                    const intent = this.analyzeGitMessage(message);
                    scores.set(intent, (scores.get(intent) || 0) + 2); // Higher weight for git messages
                    reasoning.push(`Git message suggests ${intent}: ${message}`);
                }
            }

            // Analyze commands
            if (context.commands) {
                for (const command of context.commands) {
                    const intent = this.analyzeCommand(command);
                    scores.set(intent, (scores.get(intent) || 0) + 1.5);
                    reasoning.push(`Command suggests ${intent}: ${command}`);
                }
            }

            // Analyze temporal patterns
            if (context.timeWindow) {
                const temporalIntent = this.analyzeTemporalPatterns(context);
                if (temporalIntent) {
                    scores.set(temporalIntent, (scores.get(temporalIntent) || 0) + 1);
                    reasoning.push(`Temporal pattern suggests ${temporalIntent}`);
                }
            }

            // Determine highest scoring intent
            let maxScore = 0;
            let primaryIntent = PatternCategory.MAINTENANCE; // Default

            for (const [intent, score] of scores) {
                if (score > maxScore) {
                    maxScore = score;
                    primaryIntent = intent;
                }
            }

            // Calculate confidence
            const totalScore = Array.from(scores.values()).reduce((a, b) => a + b, 0);
            const confidence = totalScore > 0 ? maxScore / totalScore : 0;

            return {
                intent: primaryIntent,
                confidence: Math.min(confidence, 1),
                reasoning,
                relatedPatterns: Array.from(relatedPatterns)
            };
        }

        /**
         * Compute relevance score for a pattern
         */
        computeRelevanceScore(patternId: string, context: any): number {
            const pattern = this.patterns.get(patternId);
            if (!pattern) return 0;

            let score = 0;

            // Base score from pattern weight
            score += pattern.weight * 0.3;

            // File pattern matching
            if (context.files) {
                for (const file of context.files) {
                    for (const filePattern of pattern.filePatterns) {
                        if (this.matchesPattern(file, filePattern)) {
                            score += 0.2;
                        }
                    }
                }
            }

            // Keyword matching
            if (context.text) {
                for (const keyword of pattern.keywords) {
                    if (context.text.toLowerCase().includes(keyword.toLowerCase())) {
                        score += 0.1;
                    }
                }
            }

            // Context requirements
            let contextScore = 0;
            for (const requirement of pattern.contextRequirements) {
                if (this.contextMatches(requirement, context)) {
                    contextScore++;
                }
            }
            score += (contextScore / Math.max(pattern.contextRequirements.length, 1)) * 0.2;

            // Temporal relevance
            if (context.timestamp) {
                const timeRelevance = this.calculateTemporalRelevance(pattern, context.timestamp);
                score += timeRelevance * 0.2;
            }

            return Math.min(score, 1);
        }

        /**
         * Classify event using pattern matching and rules
         */
        classifyEvent(event: any): {
            classification: PatternCategory;
            patternId?: string;
            confidence: number;
            appliedRules: string[];
        } {
            const appliedRules: string[] = [];
            let bestClassification = PatternCategory.MAINTENANCE;
            let bestPatternId: string | undefined;
            let bestConfidence = 0;

            // Apply interpretation rules
            for (const [ruleId, rule] of this.rules) {
                if (this.evaluateRule(rule, event)) {
                    appliedRules.push(ruleId);

                    // Execute rule actions
                    for (const action of rule.actions) {
                        if (action.type === 'classify') {
                            const classification = action.parameters.category as PatternCategory;
                            const confidence = rule.confidence;

                            if (confidence > bestConfidence) {
                                bestClassification = classification;
                                bestConfidence = confidence;
                            }
                        } else if (action.type === 'tag') {
                            bestPatternId = action.parameters.patternId;
                        }
                    }
                }
            }

            // Direct pattern matching
            if (event.payload?.filePath) {
                const category = this.getPatternCategory(path.extname(event.payload.filePath));
                if (bestConfidence < 0.5) {
                    bestClassification = category;
                    bestConfidence = 0.6; // Moderate confidence for direct file classification
                }
            }

            return {
                classification: bestClassification,
                patternId: bestPatternId,
                confidence: bestConfidence,
                appliedRules
            };
        }

        // ========================================================================
        // SEMANTIC OPERATIONS
        // ========================================================================

        /**
         * Map term to concept using semantic mappings
         */
        mapToConcept(term: string, context?: string[]): {
            concept: string;
            confidence: number;
            mappings: SemanticMapping[];
        } {
            const normalizedTerm = term.toLowerCase().trim();
            const mappings: SemanticMapping[] = [];

            // Find direct mappings
            for (const [key, mapping] of this.semanticMappings) {
                if (key === normalizedTerm || mapping.synonyms.includes(normalizedTerm)) {
                    // Check context compatibility
                    if (!context || context.length === 0 || mapping.context.some(c => context.includes(c))) {
                        mappings.push(mapping);
                    }
                }
            }

            if (mappings.length === 0) {
                return {
                    concept: term,
                    confidence: 0,
                    mappings: []
                };
            }

            // Sort by confidence
            mappings.sort((a, b) => b.confidence - a.confidence);

            return {
                concept: mappings[0].toConcept,
                confidence: mappings[0].confidence,
                mappings
            };
        }

        /**
         * Get semantic similarity between two terms
         */
        getSemanticSimilarity(term1: string, term2: string): number {
            const concept1 = this.mapToConcept(term1);
            const concept2 = this.mapToConcept(term2);

            if (concept1.concept === concept2.concept) {
                return (concept1.confidence + concept2.confidence) / 2;
            }

            return 0;
        }

        // ========================================================================
        // PRIVATE INITIALIZATION METHODS
        // ========================================================================

        private initializePatterns(): void {
            const patterns: PatternDefinition[] = [
                {
                    id: 'refactor_extract_function',
                    name: 'Extract Function Refactoring',
                    category: PatternCategory.REFACTORING,
                    keywords: ['extract', 'refactor', 'simplify', 'clean'],
                    filePatterns: ['**/*.{js,ts,py,java,cpp,rs}'],
                    commandPatterns: ['git mv', 'refactor', 'extract'],
                    gitMessagePatterns: [/refactor/i, /extract/i, /simplify/i],
                    weight: 0.8,
                    confidence: 0.7,
                    contextRequirements: ['multiple_file_changes', 'function_signatures'],
                    implications: ['improved_maintainability', 'reduced_complexity'],
                    relatedPatterns: ['refactor_rename', 'refactor_restructure']
                },
                {
                    id: 'feature_new_component',
                    name: 'New Component Development',
                    category: PatternCategory.FEATURE_DEVELOPMENT,
                    keywords: ['feature', 'add', 'create', 'implement', 'new'],
                    filePatterns: ['**/*.{js,ts,py,java,rs}', 'src/components/**', 'lib/**'],
                    commandPatterns: ['create', 'new', 'add'],
                    gitMessagePatterns: [/feature/i, /add/i, /create/i, /implement/i],
                    weight: 0.9,
                    confidence: 0.8,
                    contextRequirements: ['new_files', 'component_structure'],
                    implications: ['increased_functionality', 'code_expansion'],
                    relatedPatterns: ['feature_new_api', 'feature_new_ui']
                },
                {
                    id: 'bug_fix_critical',
                    name: 'Critical Bug Fix',
                    category: PatternCategory.BUG_FIX,
                    keywords: ['fix', 'bug', 'issue', 'error', 'crash'],
                    filePatterns: ['**/*.{js,ts,py,java,rs}'],
                    commandPatterns: ['fix', 'patch', 'hotfix'],
                    gitMessagePatterns: [/fix/i, /bug/i, /error/i, /issue/i],
                    weight: 0.85,
                    confidence: 0.75,
                    contextRequirements: ['error_logs', 'reproduction_steps'],
                    implications: ['improved_stability', 'reduced_errors'],
                    relatedPatterns: ['bug_fix_minor', 'bug_fix_security']
                },
                {
                    id: 'doc_api_reference',
                    name: 'API Documentation',
                    category: PatternCategory.DOCUMENTATION,
                    keywords: ['doc', 'document', 'api', 'reference', 'readme'],
                    filePatterns: ['**/*.md', '**/*.rst', 'docs/**', 'README*'],
                    commandPatterns: ['doc', 'readme', 'api'],
                    gitMessagePatterns: [/doc/i, /readme/i, /api.*doc/i],
                    weight: 0.6,
                    confidence: 0.8,
                    contextRequirements: ['api_changes', 'code_examples'],
                    implications: ['improved_documentation', 'better_onboarding'],
                    relatedPatterns: ['doc_user_guide', 'doc_tutorial']
                },
                {
                    id: 'test_unit_coverage',
                    name: 'Unit Test Coverage',
                    category: PatternCategory.TESTING,
                    keywords: ['test', 'spec', 'coverage', 'assert', 'mock'],
                    filePatterns: ['**/*.test.*', '**/*.spec.*', '**/__tests__/**', 'test/**'],
                    commandPatterns: ['test', 'jest', 'pytest', 'mocha'],
                    gitMessagePatterns: [/test/i, /spec/i, /coverage/i],
                    weight: 0.7,
                    confidence: 0.8,
                    contextRequirements: ['test_framework', 'assertions'],
                    implications: ['improved_reliability', 'better_code_quality'],
                    relatedPatterns: ['test_integration', 'test_e2e']
                },
                {
                    id: 'config_environment',
                    name: 'Environment Configuration',
                    category: PatternCategory.CONFIGURATION,
                    keywords: ['config', 'env', 'setting', 'environment', 'deploy'],
                    filePatterns: ['**/.env*', '**/config.*', '**/*.json', '**/*.yaml', '**/*.toml'],
                    commandPatterns: ['config', 'env', 'deploy'],
                    gitMessagePatterns: [/config/i, /env/i, /deploy/i],
                    weight: 0.5,
                    confidence: 0.7,
                    contextRequirements: ['environment_vars', 'deployment_settings'],
                    implications: ['environment_configuration', 'deployment_readiness'],
                    relatedPatterns: ['config_build', 'config_ci']
                }
            ];

            for (const pattern of patterns) {
                this.patterns.set(pattern.id, pattern);
            }
        }

        private initializeCategories(): void {
            const categories: CognitiveCategory[] = [
                {
                    id: 'refactoring',
                    name: 'Code Refactoring',
                    description: 'Improving code structure without changing functionality',
                    characteristics: ['code_structure_change', 'preserves_behavior', 'reduces_complexity'],
                    behavioralIndicators: ['file_moves', 'function_extractions', 'renaming'],
                    temporalPatterns: ['short_bursts', 'focused_work', 'minimal_new_features'],
                    workingMemoryRequirements: 'medium',
                    complexityLevel: 'moderate'
                },
                {
                    id: 'feature_development',
                    name: 'Feature Development',
                    description: 'Adding new functionality to the system',
                    characteristics: ['new_code', 'feature_implementation', 'api_changes'],
                    behavioralIndicators: ['file_creation', 'function_addition', 'interface_changes'],
                    temporalPatterns: ['extended_sessions', 'iterative_development', 'testing_cycles'],
                    workingMemoryRequirements: 'high',
                    complexityLevel: 'complex'
                },
                {
                    id: 'bug_fix',
                    name: 'Bug Fixing',
                    description: 'Resolving issues and errors in existing code',
                    characteristics: ['error_resolution', 'minimal_changes', 'focused_solutions'],
                    behavioralIndicators: ['targeted_changes', 'rollback_patterns', 'hotfixes'],
                    temporalPatterns: ['urgent_sessions', 'quick_turnaround', 'testing_focus'],
                    workingMemoryRequirements: 'low',
                    complexityLevel: 'simple'
                },
                {
                    id: 'documentation',
                    name: 'Documentation',
                    description: 'Creating and updating project documentation',
                    characteristics: ['explanatory_text', 'examples', 'reference_material'],
                    behavioralIndicators: ['markdown_editing', 'readme_updates', 'api_docs'],
                    temporalPatterns: ['steady_pace', 'long_sessions', 'research_integration'],
                    workingMemoryRequirements: 'medium',
                    complexityLevel: 'moderate'
                },
                {
                    id: 'testing',
                    name: 'Testing',
                    description: 'Writing and maintaining test suites',
                    characteristics: ['test_cases', 'assertions', 'coverage_analysis'],
                    behavioralIndicators: ['test_file_creation', 'mock_objects', 'test_running'],
                    temporalPatterns: ['iterative_cycles', 'bug_fix_followup', 'feature_validation'],
                    workingMemoryRequirements: 'medium',
                    complexityLevel: 'moderate'
                },
                {
                    id: 'configuration',
                    name: 'Configuration',
                    description: 'Managing project configuration and deployment settings',
                    characteristics: ['environment_setup', 'build_configuration', 'deployment_settings'],
                    behavioralIndicators: ['config_file_editing', 'environment_variables', 'ci_cd_setup'],
                    temporalPatterns: ['setup_sessions', 'periodic_updates', 'deployment_preparation'],
                    workingMemoryRequirements: 'low',
                    complexityLevel: 'simple'
                }
            ];

            for (const category of categories) {
                this.categories.set(category.id as PatternCategory, category);
            }
        }

        private initializeRules(): void {
            const rules: InterpretationRule[] = [
                {
                    id: 'refactor_detection',
                    name: 'Detect Refactoring Activity',
                    conditions: [
                        {
                            type: 'keyword',
                            operator: 'contains',
                            value: 'refactor',
                            weight: 0.8
                        },
                        {
                            type: 'file_pattern',
                            operator: 'matches',
                            value: '**/*.{js,ts,py,java}',
                            weight: 0.5
                        }
                    ],
                    actions: [
                        {
                            type: 'classify',
                            parameters: { category: PatternCategory.REFACTORING }
                        }
                    ],
                    priority: 1,
                    confidence: 0.8,
                    context: ['file_events', 'git_messages']
                },
                {
                    id: 'feature_detection',
                    name: 'Detect Feature Development',
                    conditions: [
                        {
                            type: 'keyword',
                            operator: 'contains',
                            value: 'feature',
                            weight: 0.7
                        },
                        {
                            type: 'frequency',
                            operator: 'greater_than',
                            value: 5,
                            weight: 0.3
                        }
                    ],
                    actions: [
                        {
                            type: 'classify',
                            parameters: { category: PatternCategory.FEATURE_DEVELOPMENT }
                        }
                    ],
                    priority: 2,
                    confidence: 0.7,
                    context: ['git_messages', 'file_creation']
                }
            ];

            for (const rule of rules) {
                this.rules.set(rule.id, rule);
            }
        }

        private initializeSemanticMappings(): void {
            const mappings: SemanticMapping[] = [
                {
                    fromTerm: 'refactor',
                    toConcept: 'code_improvement',
                    confidence: 0.9,
                    context: ['development', 'maintenance'],
                    synonyms: ['refactoring', 'restructure', 'clean', 'improve']
                },
                {
                    fromTerm: 'bug',
                    toConcept: 'error_resolution',
                    confidence: 0.95,
                    context: ['development', 'testing'],
                    synonyms: ['issue', 'error', 'problem', 'defect', 'fault']
                },
                {
                    fromTerm: 'feature',
                    toConcept: 'functionality_addition',
                    confidence: 0.9,
                    context: ['development', 'planning'],
                    synonyms: ['enhancement', 'addition', 'new', 'implement']
                },
                {
                    fromTerm: 'test',
                    toConcept: 'validation',
                    confidence: 0.85,
                    context: ['development', 'quality'],
                    synonyms: ['spec', 'assertion', 'verification', 'check']
                },
                {
                    fromTerm: 'doc',
                    toConcept: 'documentation',
                    confidence: 0.95,
                    context: ['development', 'communication'],
                    synonyms: ['documentation', 'readme', 'guide', 'manual', 'reference']
                },
                {
                    fromTerm: 'config',
                    toConcept: 'configuration',
                    confidence: 0.9,
                    context: ['development', 'deployment'],
                    synonyms: ['configuration', 'setup', 'settings', 'environment']
                }
            ];

            for (const mapping of mappings) {
                this.semanticMappings.set(mapping.fromTerm, mapping);
                for (const synonym of mapping.synonyms) {
                    this.semanticMappings.set(synonym, mapping);
                }
            }
        }

        private initializeHeuristics(): void {
            const heuristics: HeuristicRule[] = [
                {
                    id: 'burst_activity_detection',
                    name: 'Detect Burst Activity Patterns',
                    description: 'Detects patterns of high-frequency file operations within short time windows',
                    trigger: {
                        eventType: ['file_event'],
                        conditions: { minCount: 10 },
                        timeWindow: 60000 // 1 minute
                    },
                    evaluation: {
                        algorithm: 'frequency_analysis',
                        parameters: { threshold: 5 },
                        threshold: 0.7
                    },
                    result: {
                        classification: 'burst_activity',
                        confidence: 0
                    }
                },
                {
                    id: 'context_switch_detection',
                    name: 'Detect Context Switching',
                    description: 'Identifies patterns of rapid switching between different directories or work contexts',
                    trigger: {
                        eventType: ['file_event'],
                        conditions: { directoryChanges: true },
                        timeWindow: 300000 // 5 minutes
                    },
                    evaluation: {
                        algorithm: 'entropy_analysis',
                        parameters: { maxEntropy: 2.0 },
                        threshold: 0.6
                    },
                    result: {
                        classification: 'context_switch',
                        confidence: 0
                    }
                }
            ];

            for (const heuristic of heuristics) {
                this.heuristics.set(heuristic.id, heuristic);
            }
        }

        // ========================================================================
        // PRIVATE HELPER METHODS
        // ========================================================================

        private analyzeGitMessage(message: string): PatternCategory {
            const lowerMessage = message.toLowerCase();

            if (lowerMessage.includes('refactor') || lowerMessage.includes('extract')) {
                return PatternCategory.REFACTORING;
            }
            if (lowerMessage.includes('fix') || lowerMessage.includes('bug') || lowerMessage.includes('error')) {
                return PatternCategory.BUG_FIX;
            }
            if (lowerMessage.includes('feature') || lowerMessage.includes('add') || lowerMessage.includes('implement')) {
                return PatternCategory.FEATURE_DEVELOPMENT;
            }
            if (lowerMessage.includes('test') || lowerMessage.includes('spec')) {
                return PatternCategory.TESTING;
            }
            if (lowerMessage.includes('doc') || lowerMessage.includes('readme')) {
                return PatternCategory.DOCUMENTATION;
            }
            if (lowerMessage.includes('config') || lowerMessage.includes('env')) {
                return PatternCategory.CONFIGURATION;
            }

            return PatternCategory.MAINTENANCE;
        }

        private analyzeCommand(command: string): PatternCategory {
            const lowerCommand = command.toLowerCase();

            if (lowerCommand.includes('test') || lowerCommand.includes('jest') || lowerCommand.includes('pytest')) {
                return PatternCategory.TESTING;
            }
            if (lowerCommand.includes('build') || lowerCommand.includes('compile')) {
                return PatternCategory.CONFIGURATION;
            }
            if (lowerCommand.includes('deploy') || lowerCommand.includes('publish')) {
                return PatternCategory.CONFIGURATION;
            }
            if (lowerCommand.includes('doc') || lowerCommand.includes('readme')) {
                return PatternCategory.DOCUMENTATION;
            }

            return PatternCategory.MAINTENANCE;
        }

        private analyzeTemporalPatterns(context: any): PatternCategory | null {
            // Simplified temporal analysis
            if (context.sessionDuration && context.sessionDuration > 7200000) { // 2+ hours
                return PatternCategory.FEATURE_DEVELOPMENT;
            }

            if (context.rapidContextSwitches && context.rapidContextSwitches > 5) {
                return PatternCategory.MAINTENANCE;
            }

            return null;
        }

        private matchesPattern(str: string, pattern: string): boolean {
            if (pattern === str) return true;
            if (pattern.includes('*')) {
                const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                return regex.test(str);
            }
            return false;
        }

        private contextMatches(requirement: string, context: any): boolean {
            // Simplified context matching
            if (requirement === 'multiple_file_changes') {
                return context.fileCount && context.fileCount > 1;
            }
            if (requirement === 'new_files') {
                return context.newFiles && context.newFiles.length > 0;
            }
            if (requirement === 'error_logs') {
                return context.errors && context.errors.length > 0;
            }

            return false;
        }

        private calculateTemporalRelevance(pattern: PatternDefinition, timestamp: Date): number {
            // Simplified temporal relevance calculation
            const now = new Date();
            const age = now.getTime() - timestamp.getTime();
            const daysOld = age / (1000 * 60 * 60 * 24);

            // Recent patterns are more relevant
            if (daysOld < 1) return 0.3;
            if (daysOld < 7) return 0.2;
            if (daysOld < 30) return 0.1;
            return 0;
        }

        private evaluateRule(rule: InterpretationRule, event: any): boolean {
            // Simplified rule evaluation
            for (const condition of rule.conditions) {
                let matches = false;

                switch (condition.type) {
                    case 'keyword':
                        matches = this.evaluateKeywordCondition(condition, event);
                        break;
                    case 'file_pattern':
                        matches = this.evaluateFilePatternCondition(condition, event);
                        break;
                    case 'frequency':
                        matches = this.evaluateFrequencyCondition(condition, event);
                        break;
                }

                if (!matches) {
                    return false;
                }
            }

            return true;
        }

        private evaluateKeywordCondition(condition: RuleCondition, event: any): boolean {
            const text = event.payload?.message || event.payload?.text || '';
            return text.toLowerCase().includes(condition.value.toLowerCase());
        }

        private evaluateFilePatternCondition(condition: RuleCondition, event: any): boolean {
            const filePath = event.payload?.filePath;
            if (!filePath) return false;

            return this.matchesPattern(filePath, condition.value);
        }

        private evaluateFrequencyCondition(condition: RuleCondition, event: any): boolean {
            // Simplified frequency evaluation
            return false; // Would need actual frequency data
        }
    }

    // ============================================================================
    // GLOBAL DICTIONARY INSTANCE
    // ============================================================================

    export const RL4_DICTIONARY = new RL4CognitiveDictionary();

    // ============================================================================
    // CONVENIENCE EXPORTS
    // ============================================================================

    export function getPatternCategory(extension: string): PatternCategory {
        return RL4_DICTIONARY.getPatternCategory(extension);
    }

    export function inferIntentFromContext(context: any) {
        return RL4_DICTIONARY.inferIntentFromContext(context);
    }

    export function computeRelevanceScore(patternId: string, context: any): number {
        return RL4_DICTIONARY.computeRelevanceScore(patternId, context);
    }

    export function classifyEvent(event: any) {
        return RL4_DICTIONARY.classifyEvent(event);
    }

    export function mapToConcept(term: string, context?: string[]) {
        return RL4_DICTIONARY.mapToConcept(term, context);
    }

    export function getSemanticSimilarity(term1: string, term2: string): number {
        return RL4_DICTIONARY.getSemanticSimilarity(term1, term2);
    }
}