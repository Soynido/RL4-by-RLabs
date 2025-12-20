/**
 * KernelIntent - Explicit intention object for prompt generation
 *
 * The Kernel is sovereign over intention decisions (mode advisory).
 * The command from the user is the strong signal and is never contradicted.
 *
 * This object makes intentions visible, loggable, and stable.
 */

export interface KernelIntent {
  /**
   * Kind of prompt to generate
   * - "snapshot": Standard context snapshot calibration
   * - "timemachine": Historical analysis between two dates
   * - "magic_pr": Commit enrichment and PR generation
   * - "custom": Reserved for future intentions (debug, audit, explain, replay, etc.)
   */
  kind: "snapshot" | "timemachine" | "magic_pr" | "custom";

  /**
   * Governance mode affecting data filtering and structure
   */
  mode: "strict" | "flexible" | "exploratory" | "free" | "firstUse";

  /**
   * Source of the intention decision
   */
  source: {
    /**
     * Original command that triggered this intent
     * Examples: "generate_snapshot", "build_time_machine_prompt", etc.
     */
    command: string;

    /**
     * Confidence level in the intention resolution (0.0-1.0)
     * Based on clarity of the command
     */
    confidence: number;

    /**
     * Whether this is an advisory suggestion from Kernel
     * - true: Kernel suggests refinements/adjustments
     * - false: Direct command from user (never contradicted)
     */
    advisory: boolean;
  };

  /**
   * Pointer scheme for references in the snapshot
   */
  ptrScheme: "mil-his-v1" | "internal-v1";
}
