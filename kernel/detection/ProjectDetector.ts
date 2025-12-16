/**
 * Project Detector - RL4 Kernel Detection Module
 *
 * Module 9158 - Project type detection for workspace analysis
 *
 * Detects project types based on file system patterns:
 * - Node.js (package.json, node_modules, *.js, *.ts)
 * - Python (requirements.txt, setup.py, *.py, venv/, __pycache__)
 * - Rust (Cargo.toml, src/, *.rs)
 * - MonoRepo (lerna.json, packages/, nx.json, pnpm-workspace.yaml)
 * - Unknown (fallback)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export enum ProjectType {
    NODE_JS = 'nodejs',
    PYTHON = 'python',
    RUST = 'rust',
    MONO_REPO = 'monorepo',
    UNKNOWN = 'unknown'
}

export interface ProjectMetadata {
    name: string;
    type: ProjectType;
    version?: string;
    description?: string;
    languages: string[];
    frameworks: string[];
    tools: string[];
    packageManager?: string;
    buildSystem?: string;
    testFramework?: string;
    hasGit: boolean;
    estimatedComplexity: 'low' | 'medium' | 'high';
    fileCount: number;
    directoryCount: number;
    lastModified: Date;
}

export interface DetectionResult {
    confidence: number;
    metadata: ProjectMetadata;
    indicators: string[];
    warnings: string[];
}

/**
 * Project Detector Class
 */
export class ProjectDetector {
    private workspaceRoot: string;
    private cache: Map<string, DetectionResult> = new Map();

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * Detect project type with confidence scoring
     */
    async detectProjectType(): Promise<DetectionResult> {
        const cacheKey = this.workspaceRoot;

        // Check cache first
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey)!;
            // Cache valid for 5 minutes
            if (Date.now() - cached.metadata.lastModified.getTime() < 5 * 60 * 1000) {
                return cached;
            }
        }

        try {
            const result = await this.performDetection();
            this.cache.set(cacheKey, result);
            return result;

        } catch (error) {
            console.log(`ProjectDetector: Detection failed: ${error}`);
            return this.createUnknownResult(error);
        }
    }

    /**
     * Perform the actual detection logic
     */
    private async performDetection(): Promise<DetectionResult> {
        const indicators: string[] = [];
        const warnings: string[] = [];

        // Check if workspace exists
        if (!fs.existsSync(this.workspaceRoot)) {
            throw new Error(`Workspace does not exist: ${this.workspaceRoot}`);
        }

        // Get basic file system info
        const stats = await this.getWorkspaceStats();
        const hasGit = this.hasGitRepository();

        // Detect project type
        const nodeResult = this.detectNodeJs();
        const pythonResult = this.detectPython();
        const rustResult = this.detectRust();
        const monoResult = this.detectMonoRepo();

        // Determine primary project type
        let primaryType: ProjectType;
        let confidence: number;

        if (monoResult.confidence > 0.7) {
            primaryType = ProjectType.MONO_REPO;
            confidence = monoResult.confidence;
            indicators.push(...monoResult.indicators);
        } else if (nodeResult.confidence > pythonResult.confidence &&
                   nodeResult.confidence > rustResult.confidence) {
            primaryType = ProjectType.NODE_JS;
            confidence = nodeResult.confidence;
            indicators.push(...nodeResult.indicators);
        } else if (pythonResult.confidence > rustResult.confidence) {
            primaryType = ProjectType.PYTHON;
            confidence = pythonResult.confidence;
            indicators.push(...pythonResult.indicators);
        } else if (rustResult.confidence > 0.5) {
            primaryType = ProjectType.RUST;
            confidence = rustResult.confidence;
            indicators.push(...rustResult.indicators);
        } else {
            primaryType = ProjectType.UNKNOWN;
            confidence = 0.3;
        }

        // Build metadata
        const metadata = await this.buildMetadata(primaryType, stats, hasGit);

        // Add warnings if needed
        if (confidence < 0.5) {
            warnings.push(`Low detection confidence (${Math.round(confidence * 100)}%)`);
        }

        if (stats.fileCount === 0) {
            warnings.push('Empty workspace detected');
        }

        return {
            confidence,
            metadata,
            indicators,
            warnings
        };
    }

    /**
     * Detect Node.js project
     */
    private detectNodeJs(): { confidence: number; indicators: string[] } {
        const indicators: string[] = [];
        let confidence = 0;

        // Check for package.json
        const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            confidence += 0.4;
            indicators.push('Found package.json');
        }

        // Check for node_modules (weight less as it's generated)
        const nodeModulesPath = path.join(this.workspaceRoot, 'node_modules');
        if (fs.existsSync(nodeModulesPath)) {
            confidence += 0.1;
            indicators.push('Found node_modules directory');
        }

        // Check for Node.js files
        const jsFiles = this.countFiles('*.js', 3);
        const tsFiles = this.countFiles('*.ts', 3);

        if (jsFiles > 0) {
            confidence += Math.min(0.3, jsFiles * 0.1);
            indicators.push(`Found ${jsFiles} .js files`);
        }

        if (tsFiles > 0) {
            confidence += Math.min(0.3, tsFiles * 0.1);
            indicators.push(`Found ${tsFiles} .ts files`);
        }

        // Check for Node.js config files
        const npmrcPath = path.join(this.workspaceRoot, '.npmrc');
        if (fs.existsSync(npmrcPath)) {
            confidence += 0.1;
            indicators.push('Found .npmrc');
        }

        return { confidence: Math.min(confidence, 1), indicators };
    }

    /**
     * Detect Python project
     */
    private detectPython(): { confidence: number; indicators: string[] } {
        const indicators: string[] = [];
        let confidence = 0;

        // Check for requirements.txt
        const requirementsPath = path.join(this.workspaceRoot, 'requirements.txt');
        if (fs.existsSync(requirementsPath)) {
            confidence += 0.3;
            indicators.push('Found requirements.txt');
        }

        // Check for setup.py or pyproject.toml
        const setupPyPath = path.join(this.workspaceRoot, 'setup.py');
        const pyprojectPath = path.join(this.workspaceRoot, 'pyproject.toml');

        if (fs.existsSync(setupPyPath)) {
            confidence += 0.3;
            indicators.push('Found setup.py');
        }

        if (fs.existsSync(pyprojectPath)) {
            confidence += 0.3;
            indicators.push('Found pyproject.toml');
        }

        // Check for Python files
        const pyFiles = this.countFiles('*.py', 3);
        if (pyFiles > 0) {
            confidence += Math.min(0.3, pyFiles * 0.05);
            indicators.push(`Found ${pyFiles} .py files`);
        }

        // Check for Python directories
        const venvPath = path.join(this.workspaceRoot, 'venv');
        const pycachePath = path.join(this.workspaceRoot, '__pycache__');

        if (fs.existsSync(venvPath) || fs.existsSync(pycachePath)) {
            confidence += 0.1;
            indicators.push('Found Python environment directory');
        }

        return { confidence: Math.min(confidence, 1), indicators };
    }

    /**
     * Detect Rust project
     */
    private detectRust(): { confidence: number; indicators: string[] } {
        const indicators: string[] = [];
        let confidence = 0;

        // Check for Cargo.toml
        const cargoTomlPath = path.join(this.workspaceRoot, 'Cargo.toml');
        if (fs.existsSync(cargoTomlPath)) {
            confidence += 0.5;
            indicators.push('Found Cargo.toml');
        }

        // Check for src directory with .rs files
        const srcPath = path.join(this.workspaceRoot, 'src');
        if (fs.existsSync(srcPath)) {
            const rsFiles = this.countFiles('*.rs', 5, srcPath);
            if (rsFiles > 0) {
                confidence += Math.min(0.4, rsFiles * 0.1);
                indicators.push(`Found ${rsFiles} .rs files in src/`);
            }
        }

        // Check for Cargo.lock
        const cargoLockPath = path.join(this.workspaceRoot, 'Cargo.lock');
        if (fs.existsSync(cargoLockPath)) {
            confidence += 0.1;
            indicators.push('Found Cargo.lock');
        }

        return { confidence: Math.min(confidence, 1), indicators };
    }

    /**
     * Detect MonoRepo
     */
    private detectMonoRepo(): { confidence: number; indicators: string[] } {
        const indicators: string[] = [];
        let confidence = 0;

        // Check for common monorepo config files
        const lernaPath = path.join(this.workspaceRoot, 'lerna.json');
        const nxPath = path.join(this.workspaceRoot, 'nx.json');
        const pnpmWorkspacePath = path.join(this.workspaceRoot, 'pnpm-workspace.yaml');
        const yarnWorkspacePath = path.join(this.workspaceRoot, 'package.json');

        if (fs.existsSync(lernaPath)) {
            confidence += 0.4;
            indicators.push('Found lerna.json');
        }

        if (fs.existsSync(nxPath)) {
            confidence += 0.4;
            indicators.push('Found nx.json');
        }

        if (fs.existsSync(pnpmWorkspacePath)) {
            confidence += 0.3;
            indicators.push('Found pnpm-workspace.yaml');
        }

        // Check for workspace config in package.json
        if (fs.existsSync(yarnWorkspacePath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(yarnWorkspacePath, 'utf8'));
                if (packageJson.workspaces) {
                    confidence += 0.3;
                    indicators.push('Found workspaces in package.json');
                }
            } catch {
                // Ignore JSON parse errors
            }
        }

        // Check for packages directory
        const packagesPath = path.join(this.workspaceRoot, 'packages');
        if (fs.existsSync(packagesPath)) {
            confidence += 0.2;
            indicators.push('Found packages/ directory');
        }

        return { confidence: Math.min(confidence, 1), indicators };
    }

    /**
     * Build project metadata
     */
    private async buildMetadata(type: ProjectType, stats: any, hasGit: boolean): Promise<ProjectMetadata> {
        const metadata: ProjectMetadata = {
            name: path.basename(this.workspaceRoot),
            type,
            languages: [],
            frameworks: [],
            tools: [],
            hasGit,
            fileCount: stats.fileCount,
            directoryCount: stats.directoryCount,
            lastModified: stats.lastModified,
            estimatedComplexity: this.estimateComplexity(stats.fileCount, stats.directoryCount)
        };

        // Extract type-specific metadata
        switch (type) {
            case ProjectType.NODE_JS:
                await this.extractNodeJsMetadata(metadata);
                break;
            case ProjectType.PYTHON:
                await this.extractPythonMetadata(metadata);
                break;
            case ProjectType.RUST:
                await this.extractRustMetadata(metadata);
                break;
            case ProjectType.MONO_REPO:
                await this.extractMonoRepoMetadata(metadata);
                break;
        }

        return metadata;
    }

    /**
     * Extract Node.js specific metadata
     */
    private async extractNodeJsMetadata(metadata: ProjectMetadata): Promise<void> {
        const packageJsonPath = path.join(this.workspaceRoot, 'package.json');

        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

                metadata.name = packageJson.name || metadata.name;
                metadata.version = packageJson.version;
                metadata.description = packageJson.description;

                // Detect languages from scripts and dependencies
                if (packageJson.scripts) {
                    metadata.frameworks = Object.keys(packageJson.scripts);
                }

                // Detect package manager
                if (fs.existsSync(path.join(this.workspaceRoot, 'yarn.lock'))) {
                    metadata.packageManager = 'yarn';
                } else if (fs.existsSync(path.join(this.workspaceRoot, 'pnpm-lock.yaml'))) {
                    metadata.packageManager = 'pnpm';
                } else {
                    metadata.packageManager = 'npm';
                }

                metadata.languages = ['javascript', 'typescript'];
                metadata.tools = ['node', 'npm'];

                if (packageJson.devDependencies) {
                    if (packageJson.devDependencies.typescript) {
                        metadata.tools.push('typescript');
                    }
                    if (packageJson.devDependencies.jest) {
                        metadata.testFramework = 'jest';
                    }
                    if (packageJson.devDependencies.mocha) {
                        metadata.testFramework = 'mocha';
                    }
                }

            } catch (error) {
                console.log(`ProjectDetector: Failed to parse package.json: ${error}`);
            }
        }
    }

    /**
     * Extract Python specific metadata
     */
    private async extractPythonMetadata(metadata: ProjectMetadata): Promise<void> {
        const setupPyPath = path.join(this.workspaceRoot, 'setup.py');
        const pyprojectPath = path.join(this.workspaceRoot, 'pyproject.toml');

        if (fs.existsSync(pyprojectPath)) {
            try {
                const pyprojectContent = fs.readFileSync(pyprojectPath, 'utf8');
                // Basic parsing (could be enhanced with proper TOML parser)
                if (pyprojectContent.includes('name = ')) {
                    const nameMatch = pyprojectContent.match(/name\s*=\s*["']([^"']+)["']/);
                    if (nameMatch) {
                        metadata.name = nameMatch[1];
                    }
                }
            } catch (error) {
                console.log(`ProjectDetector: Failed to parse pyproject.toml: ${error}`);
            }
        }

        metadata.languages = ['python'];
        metadata.tools = ['python', 'pip'];
        metadata.packageManager = 'pip';
    }

    /**
     * Extract Rust specific metadata
     */
    private async extractRustMetadata(metadata: ProjectMetadata): Promise<void> {
        const cargoTomlPath = path.join(this.workspaceRoot, 'Cargo.toml');

        if (fs.existsSync(cargoTomlPath)) {
            try {
                const cargoContent = fs.readFileSync(cargoTomlPath, 'utf8');
                // Basic parsing (could be enhanced with proper TOML parser)
                if (cargoContent.includes('[package]')) {
                    const nameMatch = cargoContent.match(/name\s*=\s*"([^"]+)"/);
                    const versionMatch = cargoContent.match(/version\s*=\s*"([^"]+)"/);

                    if (nameMatch) metadata.name = nameMatch[1];
                    if (versionMatch) metadata.version = versionMatch[1];
                }
            } catch (error) {
                console.log(`ProjectDetector: Failed to parse Cargo.toml: ${error}`);
            }
        }

        metadata.languages = ['rust'];
        metadata.tools = ['rust', 'cargo'];
        metadata.buildSystem = 'cargo';
    }

    /**
     * Extract MonoRepo specific metadata
     */
    private async extractMonoRepoMetadata(metadata: ProjectMetadata): Promise<void> {
        const packagesPath = path.join(this.workspaceRoot, 'packages');

        if (fs.existsSync(packagesPath)) {
            try {
                const packages = fs.readdirSync(packagesPath);
                metadata.frameworks = packages;
                metadata.estimatedComplexity = packages.length > 5 ? 'high' :
                                           packages.length > 2 ? 'medium' : 'low';
            } catch (error) {
                console.log(`ProjectDetector: Failed to read packages directory: ${error}`);
            }
        }

        metadata.tools = ['lerna', 'nx'];
    }

    /**
     * Get workspace statistics
     */
    private async getWorkspaceStats(): Promise<any> {
        let fileCount = 0;
        let directoryCount = 0;
        let lastModified = new Date(0);

        try {
            const walkDir = (dir: string, depth = 0) => {
                if (depth > 10) return; // Limit depth to prevent infinite loops

                const items = fs.readdirSync(dir);

                for (const item of items) {
                    const itemPath = path.join(dir, item);
                    const stats = fs.statSync(itemPath);

                    if (stats.isFile()) {
                        fileCount++;
                        lastModified = new Date(Math.max(lastModified.getTime(), stats.mtime.getTime()));
                    } else if (stats.isDirectory()) {
                        directoryCount++;
                        // Skip common directories that would slow down detection
                        if (!['node_modules', '.git', 'venv', '__pycache__', 'target'].includes(item)) {
                            walkDir(itemPath, depth + 1);
                        }
                    }
                }
            };

            walkDir(this.workspaceRoot);

        } catch (error) {
            console.log(`ProjectDetector: Failed to get workspace stats: ${error}`);
        }

        return { fileCount, directoryCount, lastModified };
    }

    /**
     * Check if workspace has git repository
     */
    private hasGitRepository(): boolean {
        const gitPath = path.join(this.workspaceRoot, '.git');
        return fs.existsSync(gitPath);
    }

    /**
     * Count files matching pattern up to maxDepth
     */
    private countFiles(pattern: string, maxDepth: number, baseDir = this.workspaceRoot): number {
        let count = 0;
        const glob = require('glob'); // Note: would need glob package or manual implementation

        // Simple implementation without external dependencies
        try {
            const walkDir = (dir: string, depth: number) => {
                if (depth > maxDepth) return;

                const items = fs.readdirSync(dir);

                for (const item of items) {
                    const itemPath = path.join(dir, item);
                    const stats = fs.statSync(itemPath);

                    if (stats.isFile() && this.matchesPattern(item, pattern)) {
                        count++;
                    } else if (stats.isDirectory() && depth < maxDepth) {
                        walkDir(itemPath, depth + 1);
                    }
                }
            };

            walkDir(baseDir, 0);

        } catch (error) {
            console.log(`ProjectDetector: Failed to count ${pattern} files: ${error}`);
        }

        return count;
    }

    /**
     * Simple pattern matching (supports *.extension)
     */
    private matchesPattern(filename: string, pattern: string): boolean {
        if (pattern.startsWith('*.')) {
            const ext = pattern.substring(2);
            return filename.endsWith('.' + ext);
        }
        return filename === pattern;
    }

    /**
     * Estimate project complexity based on file/directory count
     */
    private estimateComplexity(fileCount: number, directoryCount: number): 'low' | 'medium' | 'high' {
        const totalItems = fileCount + directoryCount * 3; // Weight directories more heavily

        if (totalItems < 50) return 'low';
        if (totalItems < 200) return 'medium';
        return 'high';
    }

    /**
     * Create fallback unknown result
     */
    private createUnknownResult(error: any): DetectionResult {
        return {
            confidence: 0.1,
            metadata: {
                name: path.basename(this.workspaceRoot),
                type: ProjectType.UNKNOWN,
                languages: [],
                frameworks: [],
                tools: [],
                hasGit: false,
                fileCount: 0,
                directoryCount: 0,
                lastModified: new Date(),
                estimatedComplexity: 'low'
            },
            indicators: [],
            warnings: [`Detection failed: ${error}`]
        };
    }
}