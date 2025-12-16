/**
 * RBOM Module Index - Reasoning Layer 6
 *
 * Exports the main RBOMLedger class for use across the RL6 system.
 */

import { RBOMLedger, RBOMEntry } from './RBOMLedger';

export { RBOMLedger, RBOMEntry };

// Global ledger instance for backward compatibility
let globalLedger: RBOMLedger | null = null;

/**
 * Get the global RBOMLedger instance
 */
export function getGlobalLedger(): RBOMLedger | null {
    return globalLedger;
}

/**
 * Set the global RBOMLedger instance
 */
export function setGlobalLedger(ledger: RBOMLedger): void {
    globalLedger = ledger;
}