/**
 * SCFFormatter - Formatage SCFDocument → Markdown Prompt
 * 
 * Formate un SCFDocument en prompt Markdown compressé pour le LLM.
 * 
 * Format : références courtes, opcodes cognitifs, instructions explicites
 * 
 * Référence : northstar.md Section 11.12
 */

import { SCFDocument } from './SCFTypes';

export class SCFFormatter {
  /**
   * Formate un SCFDocument en prompt Markdown
   */
  format(scf: SCFDocument, resolved?: any): string {
    let prompt = '# RL4-SCF (Semantic Compression Frame)\n\n';
    
    // Anchor
    prompt += `## Anchor\n`;
    prompt += `- Event ID: ${scf.anchor.event_id || 'N/A'}\n`;
    prompt += `- Timestamp: ${new Date(scf.anchor.timestamp).toISOString()}\n`;
    prompt += `- Window: ${Math.round(scf.anchor.window_ms / 1000)}s\n\n`;
    
    // Références
    prompt += `## References\n`;
    prompt += `- Events: ${scf.refs.events.length} (${scf.refs.events.slice(0, 5).join(', ')}${scf.refs.events.length > 5 ? '...' : ''})\n`;
    prompt += `- Decisions: ${scf.refs.decisions.length}\n`;
    prompt += `- Files: ${scf.refs.files.length}\n`;
    prompt += `- Patterns: ${scf.refs.patterns.length}\n\n`;
    
    // Opérateurs
    prompt += `## Operators\n\n`;
    for (const op of scf.operators) {
      prompt += this.formatOperator(op);
      prompt += '\n';
    }
    
    // Contraintes
    if (scf.constraints.max_tokens || scf.constraints.focus_areas?.length) {
      prompt += `## Constraints\n`;
      if (scf.constraints.max_tokens) {
        prompt += `- Max tokens: ${scf.constraints.max_tokens}\n`;
      }
      if (scf.constraints.focus_areas?.length) {
        prompt += `- Focus areas: ${scf.constraints.focus_areas.join(', ')}\n`;
      }
      prompt += '\n';
    }
    
    return prompt;
  }

  /**
   * Formate un opérateur SCF
   */
  private formatOperator(op: any): string {
    switch (op.op) {
      case 'PHASE':
        return `**PHASE**: ${op.name} (${op.events.length} events, ${Math.round(op.duration_ms / 1000)}s)`;
      
      case 'PATTERN_CANDIDATE':
        return `**PATTERN_CANDIDATE**: ${op.id} (confidence: ${op.confidence}, events: ${op.events.length}, based_on: ${op.based_on.length} signals)`;
      
      case 'CORRELATE_CANDIDATE':
        return `**CORRELATE_CANDIDATE**: ${op.from} → ${op.to} (type: ${op.type}, strength: ${op.strength})`;
      
      case 'ANALYZE':
        return `**ANALYZE**: ${op.target}\n  Queries: ${op.queries.join(', ')}`;
      
      case 'GENERATE':
        return `**GENERATE**: ${op.outputs.join(', ')}`;
      
      default:
        return `**${op.op}**: ${JSON.stringify(op)}`;
    }
  }
}

