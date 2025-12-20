/**
 * Project Analyzer - RL4 Kernel Analysis Module
 *
 * Module 9297 - Workspace quality analysis and metrics
 *
 * Performs comprehensive workspace analysis:
 * - Structure analysis (folder organization, file distribution)
 * - Quality metrics (code density, documentation coverage)
 * - Change velocity analysis (git history, file hotspots)
 * - Risk assessment (complexity, coupling, technical debt indicators)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { ProjectDetector, ProjectType, ProjectMetadata } from '../detection/ProjectDetector';

export interface QualityMetrics {
    structureScore: number;        // 0-100 - folder organization quality
    documentationScore: number;    // 0-100 - documentation coverage
    testCoverageScore: number;     // 0-100 - test coverage estimate
    maintainabilityScore: number;  // 0-100 - code maintainability
    consistencyScore: number;      // 0-100 - naming/style consistency
}

export interface ChangeMetrics {
    totalCommits: number;
    activeDays: number;
    averageCommitsPerDay: number;
    hotspots: FileHotspot[];
    changeVelocity: 'low' | 'medium' | 'high';
    lastCommitDate: Date;
    contributors: number;
}

export interface FileHotspot {
    filePath: string;
    changeCount: number;
    contributors: number;
    lastChange: Date;
    complexity: 'low' | 'medium' | 'high';
}

export interface RiskIndicators {
    complexityRisk: 'low' | 'medium' | 'high';
    couplingRisk: 'low' | 'medium' | 'high';
    knowledgeSilos: string[];
    technicalDebt: TechnicalDebtItem[];
    securityRisks: SecurityRisk[];
}

export interface TechnicalDebtItem {
    type: 'complexity' | 'duplication' | 'outdated' | 'missing-docs';
    severity: 'low' | 'medium' | 'high';
    description: string;
    fileCount: number;
}

export interface SecurityRisk {
    type: 'dependency' | 'hardcoded-secrets' | 'insecure-config';
    severity: 'low' | 'medium' | 'high';
    description: string;
    location?: string;
}

export interface ProjectAnalysis {
    workspaceRoot: string;
    metadata: ProjectMetadata;
    quality: QualityMetrics;
    changes: ChangeMetrics;
    risks: RiskIndicators;
    recommendations: Recommendation[];
    summary: {
        overallScore: number;
        strengths: string[];
        weaknesses: string[];
        priority: 'low' | 'medium' | 'high';
    };
    analysisTimestamp: Date;
}

export interface Recommendation {
    category: 'structure' | 'quality' | 'security' | 'performance';
    priority: 'low' | 'medium' | 'high';
    title: string;
    description: string;
    effort: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
}

/**
 * Project Analyzer Class
 */
export class ProjectAnalyzer {
    private workspaceRoot: string;
    private projectDetector: ProjectDetector;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.projectDetector = new ProjectDetector(workspaceRoot);
    }

    /**
     * Perform comprehensive project analysis
     */
    async analyze(): Promise<ProjectAnalysis> {
        console.log(`ProjectAnalyzer: Starting analysis of ${this.workspaceRoot}`);

        try {
            // Get project metadata
            const detectionResult = await this.projectDetector.detectProjectType();
            const metadata = detectionResult.metadata;

            // Perform analysis modules
            const quality = await this.analyzeQuality(metadata);
            const changes = await this.analyzeChanges();
            const risks = await this.analyzeRisks(metadata);
            const recommendations = await this.generateRecommendations(quality, changes, risks, metadata);
            const summary = this.generateSummary(quality, changes, risks, recommendations);

            const analysis: ProjectAnalysis = {
                workspaceRoot: this.workspaceRoot,
                metadata,
                quality,
                changes,
                risks,
                recommendations,
                summary,
                analysisTimestamp: new Date()
            };

            console.log(`ProjectAnalyzer: Analysis completed - Overall score: ${summary.overallScore}`);
            return analysis;

        } catch (error) {
            console.log(`ProjectAnalyzer: Analysis failed: ${error}`);
            throw new Error(`Project analysis failed: ${error}`);
        }
    }

    /**
     * Analyze project quality metrics
     */
    private async analyzeQuality(metadata: ProjectMetadata): Promise<QualityMetrics> {
        console.log('ProjectAnalyzer: Analyzing quality metrics...');

        const structureScore = await this.analyzeStructure(metadata);
        const documentationScore = await this.analyzeDocumentation(metadata);
        const testCoverageScore = await this.estimateTestCoverage(metadata);
        const maintainabilityScore = await this.analyzeMaintainability(metadata);
        const consistencyScore = await this.analyzeConsistency(metadata);

        return {
            structureScore,
            documentationScore,
            testCoverageScore,
            maintainabilityScore,
            consistencyScore
        };
    }

    /**
     * Analyze project structure quality
     */
    private async analyzeStructure(metadata: ProjectMetadata): Promise<number> {
        let score = 50; // Base score

        try {
            // Check for standard project structure
            const standardDirs = this.getStandardDirectories(metadata.type);
            const existingDirs = standardDirs.filter(dir =>
                fs.existsSync(path.join(this.workspaceRoot, dir))
            );

            score += existingDirs.length * 8; // +8 points per standard directory

            // Check for clean separation of concerns
            const hasSrcDir = fs.existsSync(path.join(this.workspaceRoot, 'src'));
            const hasTestDir = fs.existsSync(path.join(this.workspaceRoot, 'test')) ||
                            fs.existsSync(path.join(this.workspaceRoot, 'tests')) ||
                            fs.existsSync(path.join(this.workspaceRoot, '__tests__'));

            if (hasSrcDir) score += 15;
            if (hasTestDir) score += 10;

            // Check for configuration files in root (should be minimal)
            const rootFiles = fs.readdirSync(this.workspaceRoot);
            const configFiles = rootFiles.filter(file =>
                file.startsWith('.') || file.includes('config')
            );

            // Too many config files in root is bad
            if (configFiles.length > 5) {
                score -= (configFiles.length - 5) * 3;
            }

            // Check for proper nesting depth
            const maxDepth = this.getMaxDirectoryDepth();
            if (maxDepth > 8) {
                score -= (maxDepth - 8) * 5;
            }

            return Math.max(0, Math.min(100, score));

        } catch (error) {
            console.log(`ProjectAnalyzer: Structure analysis failed: ${error}`);
            return 30; // Low default score on error
        }
    }

    /**
     * Analyze documentation coverage
     */
    private async analyzeDocumentation(metadata: ProjectMetadata): Promise<number> {
        let score = 0;
        let totalFiles = 0;
        let documentedFiles = 0;

        try {
            const walkDir = (dir: string, depth = 0) => {
                if (depth > 5) return; // Limit depth

                const items = fs.readdirSync(dir);

                for (const item of items) {
                    const itemPath = path.join(dir, item);
                    const stats = fs.statSync(itemPath);

                    if (stats.isFile()) {
                        const ext = path.extname(item);
                        const isCodeFile = this.isCodeFile(ext, metadata.type);

                        if (isCodeFile) {
                            totalFiles++;
                            if (this.hasDocumentation(itemPath, ext)) {
                                documentedFiles++;
                            }
                        }
                    } else if (stats.isDirectory() && depth < 5) {
                        // Skip common non-source directories
                        if (!['node_modules', '.git', 'venv', '__pycache__', 'target', 'dist'].includes(item)) {
                            walkDir(itemPath, depth + 1);
                        }
                    }
                }
            };

            walkDir(this.workspaceRoot);

            // Base score from documentation coverage
            if (totalFiles > 0) {
                score = Math.round((documentedFiles / totalFiles) * 70);
            }

            // Bonus points for documentation files
            const docFiles = ['README.md', 'README.rst', 'CHANGELOG.md', 'CONTRIBUTING.md'];
            for (const docFile of docFiles) {
                if (fs.existsSync(path.join(this.workspaceRoot, docFile))) {
                    score += 5;
                }
            }

            // Check for API documentation
            if (fs.existsSync(path.join(this.workspaceRoot, 'docs')) ||
                fs.existsSync(path.join(this.workspaceRoot, 'documentation'))) {
                score += 10;
            }

            return Math.min(100, score);

        } catch (error) {
            console.log(`ProjectAnalyzer: Documentation analysis failed: ${error}`);
            return 20;
        }
    }

    /**
     * Estimate test coverage
     */
    private async estimateTestCoverage(metadata: ProjectMetadata): Promise<number> {
        let score = 0;

        try {
            // Look for test files and directories
            const testPatterns = this.getTestPatterns(metadata.type);
            let testFiles = 0;
            let sourceFiles = 0;

            const walkDir = (dir: string, depth = 0) => {
                if (depth > 5) return;

                const items = fs.readdirSync(dir);

                for (const item of items) {
                    const itemPath = path.join(dir, item);
                    const stats = fs.statSync(itemPath);

                    if (stats.isFile()) {
                        const isTest = testPatterns.some(pattern => item.includes(pattern));
                        const isSource = this.isSourceFile(item, metadata.type);

                        if (isTest) {
                            testFiles++;
                        } else if (isSource) {
                            sourceFiles++;
                        }
                    } else if (stats.isDirectory() && depth < 5) {
                        if (!['node_modules', '.git', 'venv', '__pycache__', 'target'].includes(item)) {
                            walkDir(itemPath, depth + 1);
                        }
                    }
                }
            };

            walkDir(this.workspaceRoot);

            // Calculate coverage ratio
            if (sourceFiles > 0) {
                const ratio = testFiles / sourceFiles;
                score = Math.min(80, Math.round(ratio * 100));
            }

            // Bonus points for test configuration
            const testConfigs = this.getTestConfigs(metadata.type);
            for (const config of testConfigs) {
                if (fs.existsSync(path.join(this.workspaceRoot, config))) {
                    score += 5;
                }
            }

            // Check for CI/CD configuration
            const ciConfigs = ['.github/workflows', '.gitlab-ci.yml', 'Jenkinsfile', '.travis.yml'];
            for (const config of ciConfigs) {
                if (fs.existsSync(path.join(this.workspaceRoot, config))) {
                    score += 5;
                }
            }

            return Math.min(100, score);

        } catch (error) {
            console.log(`ProjectAnalyzer: Test coverage analysis failed: ${error}`);
            return 10;
        }
    }

    /**
     * Analyze code maintainability
     */
    private async analyzeMaintainability(metadata: ProjectMetadata): Promise<number> {
        let score = 50; // Base score

        try {
            // Analyze file sizes (smaller files are generally more maintainable)
            const fileSizes = this.getFileSizes(metadata.type);
            const avgFileSize = fileSizes.reduce((a, b) => a + b, 0) / fileSizes.length;

            if (avgFileSize < 1000) score += 20;  // < 1KB average
            else if (avgFileSize < 5000) score += 10;  // < 5KB average
            else if (avgFileSize > 20000) score -= 20;  // > 20KB average

            // Check for extremely large files
            const largeFiles = fileSizes.filter(size => size > 50000).length;
            score -= largeFiles * 5;

            // Analyze directory structure complexity
            const maxDepth = this.getMaxDirectoryDepth();
            if (maxDepth <= 4) score += 15;
            else if (maxDepth <= 6) score += 5;
            else score -= (maxDepth - 6) * 5;

            // Check for dependency complexity
            const complexityScore = await this.analyzeDependencyComplexity(metadata);
            score += complexityScore;

            return Math.max(0, Math.min(100, score));

        } catch (error) {
            console.log(`ProjectAnalyzer: Maintainability analysis failed: ${error}`);
            return 30;
        }
    }

    /**
     * Analyze naming and style consistency
     */
    private async analyzeConsistency(metadata: ProjectMetadata): Promise<number> {
        let score = 70; // Base score

        try {
            const patterns = this.getConsistencyPatterns(metadata.type);
            const violations = this.checkConsistencyViolations(patterns);

            score -= violations.length * 3;

            // Bonus for style guide configuration
            const styleConfigs = this.getStyleConfigs(metadata.type);
            for (const config of styleConfigs) {
                if (fs.existsSync(path.join(this.workspaceRoot, config))) {
                    score += 10;
                }
            }

            return Math.max(0, Math.min(100, score));

        } catch (error) {
            console.log(`ProjectAnalyzer: Consistency analysis failed: ${error}`);
            return 50;
        }
    }

    /**
     * Analyze change metrics using git history
     */
    private async analyzeChanges(): Promise<ChangeMetrics> {
        let changes: ChangeMetrics = {
            totalCommits: 0,
            activeDays: 0,
            averageCommitsPerDay: 0,
            hotspots: [],
            changeVelocity: 'low',
            lastCommitDate: new Date(),
            contributors: 0
        };

        try {
            if (!this.hasGitRepository()) {
                return changes;
            }

            // Get commit statistics
            const commitStats = this.getGitCommitStats();
            changes.totalCommits = commitStats.totalCommits;
            changes.activeDays = commitStats.activeDays;
            changes.averageCommitsPerDay = commitStats.averageCommitsPerDay;
            changes.lastCommitDate = commitStats.lastCommitDate;
            changes.contributors = commitStats.contributors;

            // Determine change velocity
            const dailyAvg = changes.averageCommitsPerDay;
            if (dailyAvg > 5) changes.changeVelocity = 'high';
            else if (dailyAvg > 1) changes.changeVelocity = 'medium';

            // Find file hotspots
            changes.hotspots = this.findFileHotspots();

        } catch (error) {
            console.log(`ProjectAnalyzer: Change analysis failed: ${error}`);
        }

        return changes;
    }

    /**
     * Analyze risk indicators
     */
    private async analyzeRisks(metadata: ProjectMetadata): Promise<RiskIndicators> {
        const risks: RiskIndicators = {
            complexityRisk: 'low',
            couplingRisk: 'low',
            knowledgeSilos: [],
            technicalDebt: [],
            securityRisks: []
        };

        try {
            // Analyze complexity risk
            risks.complexityRisk = this.assessComplexityRisk(metadata);

            // Analyze coupling risk
            risks.couplingRisk = this.assessCouplingRisk(metadata);

            // Find knowledge silos (files with single contributors)
            risks.knowledgeSilos = this.findKnowledgeSilos();

            // Assess technical debt
            risks.technicalDebt = this.assessTechnicalDebt(metadata);

            // Check for security risks
            risks.securityRisks = this.assessSecurityRisks(metadata);

        } catch (error) {
            console.log(`ProjectAnalyzer: Risk analysis failed: ${error}`);
        }

        return risks;
    }

    /**
     * Generate recommendations based on analysis
     */
    private async generateRecommendations(
        quality: QualityMetrics,
        changes: ChangeMetrics,
        risks: RiskIndicators,
        metadata: ProjectMetadata
    ): Promise<Recommendation[]> {
        const recommendations: Recommendation[] = [];

        // Quality recommendations
        if (quality.structureScore < 60) {
            recommendations.push({
                category: 'structure',
                priority: 'medium',
                title: 'Improve Project Structure',
                description: 'Consider reorganizing files to follow standard project layout patterns',
                effort: 'medium',
                impact: 'medium'
            });
        }

        if (quality.documentationScore < 40) {
            recommendations.push({
                category: 'quality',
                priority: 'high',
                title: 'Add Documentation',
                description: 'Improve code documentation and add README files',
                effort: 'medium',
                impact: 'high'
            });
        }

        if (quality.testCoverageScore < 30) {
            recommendations.push({
                category: 'quality',
                priority: 'high',
                title: 'Increase Test Coverage',
                description: 'Add comprehensive tests to improve code reliability',
                effort: 'high',
                impact: 'high'
            });
        }

        // Risk recommendations
        if (risks.complexityRisk === 'high') {
            recommendations.push({
                category: 'structure',
                priority: 'high',
                title: 'Reduce Code Complexity',
                description: 'Break down complex functions and classes into smaller, more manageable pieces',
                effort: 'high',
                impact: 'high'
            });
        }

        if (risks.securityRisks.length > 0) {
            recommendations.push({
                category: 'security',
                priority: 'high',
                title: 'Address Security Risks',
                description: 'Fix identified security vulnerabilities and implement security best practices',
                effort: 'medium',
                impact: 'high'
            });
        }

        return recommendations;
    }

    /**
     * Generate analysis summary
     */
    private generateSummary(
        quality: QualityMetrics,
        changes: ChangeMetrics,
        risks: RiskIndicators,
        recommendations: Recommendation[]
    ) {
        const overallScore = Math.round(
            (quality.structureScore + quality.documentationScore +
             quality.testCoverageScore + quality.maintainabilityScore +
             quality.consistencyScore) / 5
        );

        const strengths: string[] = [];
        const weaknesses: string[] = [];

        if (quality.structureScore > 70) strengths.push('Well-organized project structure');
        if (quality.documentationScore > 60) strengths.push('Good documentation coverage');
        if (quality.testCoverageScore > 50) strengths.push('Adequate test coverage');
        if (changes.changeVelocity === 'high') strengths.push('Active development');

        if (quality.structureScore < 40) weaknesses.push('Poor project organization');
        if (quality.documentationScore < 30) weaknesses.push('Insufficient documentation');
        if (quality.testCoverageScore < 20) weaknesses.push('Low test coverage');
        if (risks.complexityRisk === 'high') weaknesses.push('High code complexity');

        const highPriorityRecs = recommendations.filter(r => r.priority === 'high').length;

        // Normalize priority to strict union type
        const normalizePriority = (p: string): "low" | "medium" | "high" => {
            if (p === "high" || p === "medium" || p === "low") return p;
            return "medium";
        };

        const priority = normalizePriority(
            highPriorityRecs > 3 ? 'high' : highPriorityRecs > 0 ? 'medium' : 'low'
        );

        return {
            overallScore,
            strengths,
            weaknesses,
            priority
        };
    }

    // Helper methods (simplified implementations)

    private getStandardDirectories(type: ProjectType): string[] {
        const common = ['src', 'docs', 'tests'];

        switch (type) {
            case ProjectType.NODE_JS:
                return [...common, 'lib', 'bin', 'config'];
            case ProjectType.PYTHON:
                return [...common, 'lib', 'scripts', 'requirements'];
            case ProjectType.RUST:
                return [...common, 'examples', 'benches'];
            default:
                return common;
        }
    }

    private isCodeFile(ext: string, type: ProjectType): boolean {
        const codeExtensions = {
            [ProjectType.NODE_JS]: ['.js', '.ts', '.jsx', '.tsx'],
            [ProjectType.PYTHON]: ['.py'],
            [ProjectType.RUST]: ['.rs'],
            [ProjectType.MONO_REPO]: ['.js', '.ts', '.py', '.rs', '.go'],
            [ProjectType.UNKNOWN]: ['.js', '.ts', '.py', '.rs', '.java', '.cpp', '.c']
        };

        return codeExtensions[type]?.includes(ext) || false;
    }

    private hasDocumentation(filePath: string, ext: string): boolean {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');

            // Check for common documentation patterns
            for (let i = 0; i < Math.min(20, lines.length); i++) {
                const line = lines[i].trim();
                if (line.startsWith('/**') || line.startsWith('"""') ||
                    line.startsWith('"""') || line.includes('@param') ||
                    line.includes('@return') || line.includes('@description')) {
                    return true;
                }
            }

            return false;
        } catch {
            return false;
        }
    }

    private getTestPatterns(type: ProjectType): string[] {
        const patterns = {
            [ProjectType.NODE_JS]: ['test', 'spec', '.test.', '.spec.'],
            [ProjectType.PYTHON]: ['test_', '_test.', 'test_', 'conftest.py'],
            [ProjectType.RUST]: ['test', '_test.rs'],
            [ProjectType.MONO_REPO]: ['test', 'spec', '.test.', '.spec.'],
            [ProjectType.UNKNOWN]: ['test', 'spec']
        };

        return patterns[type] || patterns[ProjectType.UNKNOWN];
    }

    private isSourceFile(fileName: string, type: ProjectType): boolean {
        const ext = path.extname(fileName);
        const isTestFile = this.getTestPatterns(type).some(pattern => fileName.includes(pattern));
        return this.isCodeFile(ext, type) && !isTestFile;
    }

    private getTestConfigs(type: ProjectType): string[] {
        const configs = {
            [ProjectType.NODE_JS]: ['jest.config.js', 'vitest.config.js', 'karma.conf.js'],
            [ProjectType.PYTHON]: ['pytest.ini', 'tox.ini', 'setup.cfg'],
            [ProjectType.RUST]: ['Cargo.toml'],
            [ProjectType.MONO_REPO]: ['jest.config.js', 'vitest.config.js'],
            [ProjectType.UNKNOWN]: []
        };

        return configs[type] || [];
    }

    private getFileSizes(type: ProjectType): number[] {
        const sizes: number[] = [];

        const walkDir = (dir: string, depth = 0) => {
            if (depth > 5) return;

            try {
                const items = fs.readdirSync(dir);

                for (const item of items) {
                    const itemPath = path.join(dir, item);
                    const stats = fs.statSync(itemPath);

                    if (stats.isFile() && this.isCodeFile(path.extname(item), type)) {
                        sizes.push(stats.size);
                    } else if (stats.isDirectory() && depth < 5) {
                        if (!['node_modules', '.git', 'venv', '__pycache__', 'target', 'dist'].includes(item)) {
                            walkDir(itemPath, depth + 1);
                        }
                    }
                }
            } catch {
                // Ignore permission errors
            }
        };

        walkDir(this.workspaceRoot);
        return sizes;
    }

    private getMaxDirectoryDepth(): number {
        let maxDepth = 0;

        const walkDir = (dir: string, depth: number) => {
            maxDepth = Math.max(maxDepth, depth);

            try {
                const items = fs.readdirSync(dir);

                for (const item of items) {
                    const itemPath = path.join(dir, item);
                    const stats = fs.statSync(itemPath);

                    if (stats.isDirectory() && depth < 10) {
                        walkDir(itemPath, depth + 1);
                    }
                }
            } catch {
                // Ignore permission errors
            }
        };

        walkDir(this.workspaceRoot, 0);
        return maxDepth;
    }

    private async analyzeDependencyComplexity(metadata: ProjectMetadata): Promise<number> {
        // Simplified implementation
        return 0; // Would analyze package.json, Cargo.toml, requirements.txt, etc.
    }

    private getConsistencyPatterns(type: ProjectType): any[] {
        return []; // Would define naming patterns for consistency checking
    }

    private checkConsistencyViolations(patterns: any[]): any[] {
        return []; // Would check file naming, code style consistency
    }

    private getStyleConfigs(type: ProjectType): string[] {
        const configs = {
            [ProjectType.NODE_JS]: ['.eslintrc.js', '.prettierrc', 'tsconfig.json'],
            [ProjectType.PYTHON]: ['.pylintrc', '.flake8', 'pyproject.toml'],
            [ProjectType.RUST]: ['.rustfmt.toml', 'clippy.toml'],
            [ProjectType.MONO_REPO]: ['.eslintrc.js', '.prettierrc'],
            [ProjectType.UNKNOWN]: []
        };

        return configs[type] || [];
    }

    private hasGitRepository(): boolean {
        return fs.existsSync(path.join(this.workspaceRoot, '.git'));
    }

    private getGitCommitStats() {
        // Simplified git statistics (would use git log commands)
        return {
            totalCommits: 0,
            activeDays: 0,
            averageCommitsPerDay: 0,
            lastCommitDate: new Date(),
            contributors: 0
        };
    }

    private findFileHotspots(): FileHotspot[] {
        return []; // Would analyze git log to find frequently changed files
    }

    private assessComplexityRisk(metadata: ProjectMetadata): 'low' | 'medium' | 'high' {
        return 'low'; // Would analyze cyclomatic complexity, file sizes, etc.
    }

    private assessCouplingRisk(metadata: ProjectMetadata): 'low' | 'medium' | 'high' {
        return 'low'; // Would analyze import dependencies, coupling metrics
    }

    private findKnowledgeSilos(): string[] {
        return []; // Would find files with only one contributor
    }

    private assessTechnicalDebt(metadata: ProjectMetadata): TechnicalDebtItem[] {
        return []; // Would analyze code smells, duplication, etc.
    }

    private assessSecurityRisks(metadata: ProjectMetadata): SecurityRisk[] {
        return []; // Would check for hardcoded secrets, outdated deps, etc.
    }
}