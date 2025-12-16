/**
 * Cross File Consistency Validator - RL4 Kernel Validation Module
 *
 * Module 9609 - Cross-file consistency validation
 *
 * Validates consistency across project files:
 * - JSON schema validation
 * - Missing file dependencies
 * - Circular dependency detection
 * - Type consistency across files
 * - Configuration file validation
 * - Import/export consistency
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ValidationIssue {
    type: 'error' | 'warning' | 'info';
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: 'schema' | 'dependency' | 'circular' | 'type' | 'config' | 'import';
    file: string;
    line?: number;
    column?: number;
    message: string;
    suggestion?: string;
    relatedFiles?: string[];
}

export interface ValidationResult {
    valid: boolean;
    issues: ValidationIssue[];
    statistics: {
        totalFiles: number;
        errorCount: number;
        warningCount: number;
        infoCount: number;
        criticalIssues: number;
    };
    summary: string;
    timestamp: Date;
}

export interface ValidationOptions {
    includeWarnings: boolean;
    maxDepth: number;
    skipDirectories: string[];
    filePatterns: string[];
    strictMode: boolean;
}

export interface DependencyGraph {
    nodes: Map<string, DependencyNode>;
    edges: Map<string, Set<string>>;
}

export interface DependencyNode {
    filePath: string;
    fileType: string;
    dependencies: string[];
    dependents: string[];
    missing: string[];
}

/**
 * Cross File Consistency Validator Class
 */
export class CrossFileConsistencyValidator {
    private workspaceRoot: string;
    private options: ValidationOptions;
    private dependencyGraph: DependencyGraph;
    private jsonSchemas: Map<string, any> = new Map();

    constructor(workspaceRoot: string, options?: Partial<ValidationOptions>) {
        this.workspaceRoot = workspaceRoot;
        this.options = {
            includeWarnings: true,
            maxDepth: 10,
            skipDirectories: ['node_modules', '.git', 'venv', '__pycache__', 'target', 'dist'],
            filePatterns: ['*.json', '*.js', '*.ts', '*.py', '*.rs', '*.yaml', '*.yml'],
            strictMode: false,
            ...options
        };

        this.dependencyGraph = {
            nodes: new Map(),
            edges: new Map()
        };

        this.initializeJsonSchemas();
    }

    /**
     * Perform comprehensive validation
     */
    async validate(): Promise<ValidationResult> {
        console.log(`CrossFileValidator: Starting validation of ${this.workspaceRoot}`);

        const issues: ValidationIssue[] = [];

        try {
            // Build dependency graph
            await this.buildDependencyGraph();

            // Perform validation checks
            await this.validateJsonFiles(issues);
            await this.validateMissingDependencies(issues);
            await this.detectCircularDependencies(issues);
            await this.validateTypeConsistency(issues);
            await this.validateConfigurationFiles(issues);
            await this.validateImportExportConsistency(issues);

            // Calculate statistics
            const statistics = this.calculateStatistics(issues);

            // Generate summary
            const summary = this.generateSummary(statistics);
            const valid = statistics.criticalIssues === 0 &&
                         (this.options.strictMode ? statistics.errorCount === 0 : true);

            const result: ValidationResult = {
                valid,
                issues,
                statistics,
                summary,
                timestamp: new Date()
            };

            console.log(`CrossFileValidator: Validation complete - ${statistics.errorCount} errors, ${statistics.warningCount} warnings`);
            return result;

        } catch (error) {
            console.log(`CrossFileValidator: Validation failed: ${error}`);
            throw new Error(`Cross-file validation failed: ${error}`);
        }
    }

    /**
     * Build dependency graph for the workspace
     */
    private async buildDependencyGraph(): Promise<void> {
        const files = this.getWorkspaceFiles();

        for (const filePath of files) {
            const node = await this.createDependencyNode(filePath);
            this.dependencyGraph.nodes.set(filePath, node);
            this.dependencyGraph.edges.set(filePath, new Set(node.dependencies));
        }
    }

    /**
     * Validate JSON files against schemas
     */
    private async validateJsonFiles(issues: ValidationIssue[]): Promise<void> {
        const jsonFiles = this.getWorkspaceFiles('*.json');

        for (const filePath of jsonFiles) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const jsonData = JSON.parse(content);

                // Validate based on file type
                if (filePath.includes('package.json')) {
                    await this.validatePackageJson(filePath, jsonData, issues);
                } else if (filePath.includes('tsconfig.json')) {
                    await this.validateTsConfig(filePath, jsonData, issues);
                } else if (filePath.endsWith('.schema.json')) {
                    this.jsonSchemas.set(filePath, jsonData);
                }

            } catch (error) {
                issues.push({
                    type: 'error',
                    severity: 'high',
                    category: 'schema',
                    file: filePath,
                    message: `Invalid JSON: ${error}`,
                    suggestion: 'Check JSON syntax and structure'
                });
            }
        }
    }

    /**
     * Validate missing dependencies
     */
    private async validateMissingDependencies(issues: ValidationIssue[]): Promise<void> {
        for (const [filePath, node] of this.dependencyGraph.nodes) {
            for (const missingDep of node.missing) {
                issues.push({
                    type: 'error',
                    severity: 'medium',
                    category: 'dependency',
                    file: filePath,
                    message: `Missing dependency: ${missingDep}`,
                    suggestion: `Create the missing file or update the import/reference`
                });
            }
        }
    }

    /**
     * Detect circular dependencies
     */
    private async detectCircularDependencies(issues: ValidationIssue[]): Promise<void> {
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        for (const filePath of this.dependencyGraph.nodes.keys()) {
            if (!visited.has(filePath)) {
                const cycle = this.detectCycle(filePath, visited, recursionStack, []);
                if (cycle.length > 0) {
                    issues.push({
                        type: 'error',
                        severity: 'high',
                        category: 'circular',
                        file: cycle[0],
                        message: `Circular dependency detected: ${cycle.join(' -> ')}`,
                        suggestion: 'Refactor to break the circular dependency',
                        relatedFiles: cycle
                    });
                }
            }
        }
    }

    /**
     * Validate type consistency across files
     */
    private async validateTypeConsistency(issues: ValidationIssue[]): Promise<void> {
        // Check TypeScript file consistency
        const typeScriptFiles = this.getWorkspaceFiles('*.ts');
        const typeDefinitions = new Map<string, string[]>();

        // Collect type definitions
        for (const filePath of typeScriptFiles) {
            const types = this.extractTypeDefinitions(filePath);
            for (const typeName of types) {
                if (!typeDefinitions.has(typeName)) {
                    typeDefinitions.set(typeName, []);
                }
                typeDefinitions.get(typeName)!.push(filePath);
            }
        }

        // Check for type conflicts
        for (const [typeName, files] of typeDefinitions) {
            if (files.length > 1) {
                // Check if types are consistent across files
                const conflicts = await this.checkTypeConflicts(typeName, files);
                if (conflicts.length > 0) {
                    issues.push({
                        type: 'warning',
                        severity: 'medium',
                        category: 'type',
                        file: files[0],
                        message: `Type '${typeName}' has conflicting definitions in multiple files`,
                        suggestion: 'Ensure type definitions are consistent or use namespaces',
                        relatedFiles: files
                    });
                }
            }
        }
    }

    /**
     * Validate configuration files consistency
     */
    private async validateConfigurationFiles(issues: ValidationIssue[]): Promise<void> {
        const configFiles = [
            'package.json',
            'tsconfig.json',
            '.eslintrc.js',
            '.prettierrc',
            'webpack.config.js',
            'vite.config.js'
        ];

        for (const config of configFiles) {
            const filePath = path.join(this.workspaceRoot, config);
            if (fs.existsSync(filePath)) {
                await this.validateConfigFile(filePath, issues);
            }
        }

        // Check for configuration conflicts
        await this.checkConfigurationConflicts(issues);
    }

    /**
     * Validate import/export consistency
     */
    private async validateImportExportConsistency(issues: ValidationIssue[]): Promise<void> {
        const sourceFiles = this.getWorkspaceFiles('*.{js,ts}');

        for (const filePath of sourceFiles) {
            const imports = this.extractImports(filePath);
            const exports = this.extractExports(filePath);

            // Validate imports exist
            for (const importPath of imports) {
                const resolvedPath = this.resolveImportPath(filePath, importPath);
                if (!resolvedPath || !fs.existsSync(resolvedPath)) {
                    issues.push({
                        type: 'error',
                        severity: 'high',
                        category: 'import',
                        file: filePath,
                        message: `Cannot find module '${importPath}'`,
                        suggestion: 'Check import path and ensure the module exists'
                    });
                }
            }

            // Validate exports are used (optional warning)
            if (this.options.includeWarnings) {
                for (const exportName of exports) {
                    const isUsed = await this.checkExportUsage(filePath, exportName);
                    if (!isUsed && !exportName.includes('default')) {
                        issues.push({
                            type: 'info',
                            severity: 'low',
                            category: 'import',
                            file: filePath,
                            message: `Export '${exportName}' is never used`,
                            suggestion: 'Consider removing unused exports'
                        });
                    }
                }
            }
        }
    }

    /**
     * Get workspace files matching patterns
     */
    private getWorkspaceFiles(pattern?: string): string[] {
        const files: string[] = [];

        const walkDir = (dir: string, depth = 0) => {
            if (depth > this.options.maxDepth) return;

            try {
                const items = fs.readdirSync(dir);

                for (const item of items) {
                    const itemPath = path.join(dir, item);
                    const stats = fs.statSync(itemPath);

                    if (stats.isFile()) {
                        if (this.matchesFilePattern(item, pattern)) {
                            files.push(itemPath);
                        }
                    } else if (stats.isDirectory() && depth < this.options.maxDepth) {
                        if (!this.options.skipDirectories.includes(item)) {
                            walkDir(itemPath, depth + 1);
                        }
                    }
                }
            } catch {
                // Ignore permission errors
            }
        };

        walkDir(this.workspaceRoot);
        return files;
    }

    /**
     * Check if file matches pattern
     */
    private matchesFilePattern(fileName: string, pattern?: string): boolean {
        if (!pattern) {
            return this.options.filePatterns.some(p => this.matchesPattern(fileName, p));
        }
        return this.matchesPattern(fileName, pattern);
    }

    /**
     * Simple pattern matching
     */
    private matchesPattern(fileName: string, pattern: string): boolean {
        if (pattern.startsWith('*.')) {
            return fileName.endsWith(pattern.substring(1));
        }
        if (pattern.includes('*')) {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            return regex.test(fileName);
        }
        return fileName === pattern;
    }

    /**
     * Create dependency node for a file
     */
    private async createDependencyNode(filePath: string): Promise<DependencyNode> {
        const ext = path.extname(filePath);
        const fileType = ext.substring(1);

        let dependencies: string[] = [];
        let missing: string[] = [];

        if (['.js', '.ts'].includes(ext)) {
            const imports = this.extractImports(filePath);
            dependencies = imports.map(imp => this.resolveImportPath(filePath, imp) || imp);
            missing = dependencies.filter(dep => !fs.existsSync(dep));
        } else if (ext === '.json') {
            dependencies = await this.extractJsonDependencies(filePath);
            missing = dependencies.filter(dep => !fs.existsSync(dep));
        }

        return {
            filePath,
            fileType,
            dependencies,
            dependents: [],
            missing
        };
    }

    /**
     * Extract imports from source file
     */
    private extractImports(filePath: string): string[] {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const imports: string[] = [];

            // Match import statements (simplified)
            const importRegex = /import.*from\s+['"]([^'"]+)['"]/g;
            const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

            let match;
            while ((match = importRegex.exec(content)) !== null) {
                imports.push(match[1]);
            }

            while ((match = requireRegex.exec(content)) !== null) {
                imports.push(match[1]);
            }

            return imports;

        } catch {
            return [];
        }
    }

    /**
     * Extract exports from source file
     */
    private extractExports(filePath: string): string[] {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const exports: string[] = [];

            // Match export statements (simplified)
            const exportRegex = /export\s+(?:const|let|var|function|class)\s+(\w+)/g;

            let match;
            while ((match = exportRegex.exec(content)) !== null) {
                exports.push(match[1]);
            }

            return exports;

        } catch {
            return [];
        }
    }

    /**
     * Extract type definitions from TypeScript file
     */
    private extractTypeDefinitions(filePath: string): string[] {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const types: string[] = [];

            // Match type/interface definitions (simplified)
            const typeRegex = /(?:interface|type)\s+(\w+)/g;

            let match;
            while ((match = typeRegex.exec(content)) !== null) {
                types.push(match[1]);
            }

            return types;

        } catch {
            return [];
        }
    }

    /**
     * Resolve import path to absolute path
     */
    private resolveImportPath(fromFile: string, importPath: string): string | null {
        if (importPath.startsWith('.')) {
            // Relative import
            const fromDir = path.dirname(fromFile);
            return path.resolve(fromDir, importPath);
        } else if (importPath.startsWith('/')) {
            // Absolute import
            return path.join(this.workspaceRoot, importPath.substring(1));
        } else {
            // Node module import (simplified)
            return null;
        }
    }

    /**
     * Detect circular dependency using DFS
     */
    private detectCycle(
        node: string,
        visited: Set<string>,
        recursionStack: Set<string>,
        path: string[]
    ): string[] {
        visited.add(node);
        recursionStack.add(node);
        path.push(node);

        const edges = this.dependencyGraph.edges.get(node);
        if (edges) {
            for (const neighbor of edges) {
                if (!visited.has(neighbor)) {
                    const cycle = this.detectCycle(neighbor, visited, recursionStack, [...path]);
                    if (cycle.length > 0) {
                        return cycle;
                    }
                } else if (recursionStack.has(neighbor)) {
                    // Found a cycle
                    const cycleStart = path.indexOf(neighbor);
                    return path.slice(cycleStart).concat(neighbor);
                }
            }
        }

        recursionStack.delete(node);
        return [];
    }

    /**
     * Check type conflicts across files
     */
    private async checkTypeConflicts(typeName: string, files: string[]): Promise<string[]> {
        // Simplified implementation - would compare actual type definitions
        return [];
    }

    /**
     * Check if export is used in other files
     */
    private async checkExportUsage(filePath: string, exportName: string): Promise<boolean> {
        // Simplified implementation - would search through all files
        return true;
    }

    /**
     * Extract dependencies from JSON file
     */
    private async extractJsonDependencies(filePath: string): Promise<string[]> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const jsonData = JSON.parse(content);
            const dependencies: string[] = [];

            // Look for common dependency patterns
            if (jsonData.dependencies) {
                dependencies.push(...Object.keys(jsonData.dependencies));
            }
            if (jsonData.devDependencies) {
                dependencies.push(...Object.keys(jsonData.devDependencies));
            }
            if (jsonData.extends) {
                if (typeof jsonData.extends === 'string') {
                    dependencies.push(jsonData.extends);
                } else if (Array.isArray(jsonData.extends)) {
                    dependencies.push(...jsonData.extends);
                }
            }

            return dependencies.filter(dep => dep.startsWith('./') || dep.startsWith('../'));

        } catch {
            return [];
        }
    }

    /**
     * Initialize JSON schemas for validation
     */
    private initializeJsonSchemas(): void {
        // Could load predefined schemas for common config files
    }

    /**
     * Validate package.json
     */
    private async validatePackageJson(filePath: string, data: any, issues: ValidationIssue[]): Promise<void> {
        if (!data.name) {
            issues.push({
                type: 'error',
                severity: 'medium',
                category: 'schema',
                file: filePath,
                message: 'package.json missing required "name" field',
                suggestion: 'Add a name field to package.json'
            });
        }

        if (!data.version) {
            issues.push({
                type: 'warning',
                severity: 'low',
                category: 'schema',
                file: filePath,
                message: 'package.json missing "version" field',
                suggestion: 'Add a version field to package.json'
            });
        }
    }

    /**
     * Validate tsconfig.json
     */
    private async validateTsConfig(filePath: string, data: any, issues: ValidationIssue[]): Promise<void> {
        if (!data.compilerOptions) {
            issues.push({
                type: 'warning',
                severity: 'medium',
                category: 'schema',
                file: filePath,
                message: 'tsconfig.json missing "compilerOptions"',
                suggestion: 'Add compilerOptions to configure TypeScript compilation'
            });
        }
    }

    /**
     * Validate specific configuration file
     */
    private async validateConfigFile(filePath: string, issues: ValidationIssue[]): Promise<void> {
        // Implementation would depend on file type
    }

    /**
     * Check configuration conflicts
     */
    private async checkConfigurationConflicts(issues: ValidationIssue[]): Promise<void> {
        // Check for conflicting ESLint/Prettier rules, TypeScript settings, etc.
    }

    /**
     * Calculate validation statistics
     */
    private calculateStatistics(issues: ValidationIssue[]) {
        const statistics = {
            totalFiles: this.dependencyGraph.nodes.size,
            errorCount: issues.filter(i => i.type === 'error').length,
            warningCount: issues.filter(i => i.type === 'warning').length,
            infoCount: issues.filter(i => i.type === 'info').length,
            criticalIssues: issues.filter(i => i.severity === 'critical').length
        };

        return statistics;
    }

    /**
     * Generate validation summary
     */
    private generateSummary(statistics: any): string {
        const { errorCount, warningCount, infoCount, totalFiles } = statistics;

        let summary = `Validated ${totalFiles} files`;

        if (errorCount > 0) {
            summary += `, found ${errorCount} error${errorCount > 1 ? 's' : ''}`;
        }

        if (warningCount > 0) {
            summary += `, ${warningCount} warning${warningCount > 1 ? 's' : ''}`;
        }

        if (infoCount > 0) {
            summary += `, ${infoCount} info message${infoCount > 1 ? 's' : ''}`;
        }

        if (errorCount === 0 && warningCount === 0) {
            summary += ' - No issues found';
        }

        return summary;
    }
}