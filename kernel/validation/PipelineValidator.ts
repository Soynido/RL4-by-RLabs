export interface PipelineValidationResult {
    warnings: string[];
    errors: string[];
    actions?: string[];
}

/**
 * PipelineValidator (lightweight stub)
 * - Ensures results bundle has expected structure
 * - Can be expanded with schema validation later
 */
export class PipelineValidator {
    constructor(private rl4Path: string) {}

    async validateResultsBundle(_results: any): Promise<PipelineValidationResult> {
        return { warnings: [], errors: [] };
    }
}


