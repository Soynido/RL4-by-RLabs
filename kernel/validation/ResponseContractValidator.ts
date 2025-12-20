export interface ResponseValidationResult {
    ok: boolean;
    errors: string[];
}

/**
 * ResponseContractValidator (stub)
 * Ensures a response object contains required fields.
 */
export class ResponseContractValidator {
    constructor(private requiredFields: string[] = []) {}

    validate(response: any): ResponseValidationResult {
        const errors: string[] = [];
        for (const field of this.requiredFields) {
            if (!(field in (response || {}))) {
                errors.push(`Missing field: ${field}`);
            }
        }
        return { ok: errors.length === 0, errors };
    }
}


