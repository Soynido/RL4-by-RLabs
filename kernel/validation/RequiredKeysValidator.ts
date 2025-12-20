export class RequiredKeysValidator {
    constructor(private requiredKeys: string[]) {}

    validate(obj: any): { ok: boolean; missing: string[] } {
        const missing = this.requiredKeys.filter(k => !(k in (obj || {})));
        return { ok: missing.length === 0, missing };
    }
}


