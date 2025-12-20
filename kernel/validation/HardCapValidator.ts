export class HardCapValidator {
    constructor(private maxItems: number = 1000) {}

    validate(items: any[]): { ok: boolean; reason?: string } {
        if (!Array.isArray(items)) return { ok: false, reason: 'Invalid items array' };
        if (items.length > this.maxItems) {
            return { ok: false, reason: `Hard cap exceeded (${items.length}/${this.maxItems})` };
        }
        return { ok: true };
    }
}


