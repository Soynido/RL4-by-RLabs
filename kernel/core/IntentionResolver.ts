/**
 * IntentionResolver - Resolves KernelIntent from commands and context
 *
 * Rules:
 * - Command is the strong signal and is NEVER contradicted
 * - If command === "build_time_machine_prompt" → intent.kind = "timemachine" (point)
 * - Kernel can add refinements (mode, ptrScheme) without contradicting the command
 * - Mode advisory: Kernel suggests but command is authoritative
 */

import { KernelIntent } from './KernelIntent';

export interface IntentionResolutionContext {
  command: string;
  mode?: string;
  cycleContext?: any;
  projectState?: any;
}

export class IntentionResolver {
  /**
   * Resolve KernelIntent from command and context
   *
   * @param context - Command and optional context
   * @returns Resolved KernelIntent (command is never contradicted)
   */
  resolve(context: IntentionResolutionContext): KernelIntent {
    const { command, mode, cycleContext, projectState } = context;

    // Rule: Command is the strong signal - map directly to kind
    let kind: KernelIntent['kind'];
    let confidence: number;
    let advisory: boolean;

    // Direct command mapping (never contradicted)
    if (command === 'generate_snapshot') {
      kind = 'snapshot';
      confidence = 1.0;
      advisory = false;
    } else if (command === 'build_time_machine_prompt') {
      kind = 'timemachine';
      confidence = 1.0;
      advisory = false;
    } else if (command === 'generate_commit_prompt' || command === 'magic_pr') {
      kind = 'magic_pr';
      confidence = 1.0;
      advisory = false;
    } else {
      // Unknown command - default to snapshot with lower confidence
      kind = 'snapshot';
      confidence = 0.5;
      advisory = true;
    }

    // Resolve mode (from context or default)
    const resolvedMode: KernelIntent['mode'] = this.resolveMode(mode, cycleContext);

    // Determine ptrScheme (can be refined by Kernel without contradicting command)
    const ptrScheme: KernelIntent['ptrScheme'] = this.resolvePtrScheme(projectState);

    return {
      kind,
      mode: resolvedMode,
      source: {
        command,
        confidence,
        advisory
      },
      ptrScheme
    };
  }

  /**
   * Resolve governance mode
   */
  private resolveMode(
    mode?: string,
    cycleContext?: any
  ): KernelIntent['mode'] {
    // Priority: explicit mode > cycleContext > default
    if (mode) {
      const validModes: KernelIntent['mode'][] = ['strict', 'flexible', 'exploratory', 'free', 'firstUse'];
      if (validModes.includes(mode as KernelIntent['mode'])) {
        return mode as KernelIntent['mode'];
      }
    }

    // Check cycleContext
    if (cycleContext?.deviation_mode) {
      const validModes: KernelIntent['mode'][] = ['strict', 'flexible', 'exploratory', 'free', 'firstUse'];
      if (validModes.includes(cycleContext.deviation_mode as KernelIntent['mode'])) {
        return cycleContext.deviation_mode as KernelIntent['mode'];
      }
    }

    // Default
    return 'flexible';
  }

  /**
   * Resolve pointer scheme (Kernel can refine this)
   */
  private resolvePtrScheme(projectState?: any): KernelIntent['ptrScheme'] {
    // For now, default to mil-his-v1
    // Can be refined based on projectState in the future
    return 'mil-his-v1';
  }
}
