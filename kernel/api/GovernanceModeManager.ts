/**
 * GovernanceModeManager — Gestion modes gouvernance (strict/flexible/exploratory/free/firstUse)
 * 
 * Module pour lire/écrire le mode gouvernance depuis Context.RL4 frontmatter
 * 
 * Gère les modes de gouvernance (strict/flexible/exploratory/free)
 * Ce module gère les modes gouvernance pour l'UI/webview
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { WriteTracker } from '../WriteTracker';
import { AtomicFS } from '../core/AtomicFS';
import { WriteAheadLog } from '../persistence/WriteAheadLog';

export type GovernanceMode = 'strict' | 'flexible' | 'exploratory' | 'free' | 'firstUse';

export class GovernanceModeManager {
    private rl4Path: string;
    private contextPath: string;

    constructor(rl4Path: string) {
        this.rl4Path = rl4Path;
        this.contextPath = path.join(rl4Path, 'Context.RL4');
    }

    /**
     * Get active governance mode from Context.RL4
     */
    getActiveMode(): GovernanceMode {
        if (!fs.existsSync(this.contextPath)) {
            return 'flexible'; // Default
        }

        try {
            const content = fs.readFileSync(this.contextPath, 'utf8');
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
            
            if (!frontmatterMatch) {
                return 'flexible';
            }

            const frontmatter: any = yaml.load(frontmatterMatch[1]) || {};
            const mode = frontmatter.mode || frontmatter.deviation_mode || 'flexible';
            
            // Validate mode
            const validModes: GovernanceMode[] = ['strict', 'flexible', 'exploratory', 'free', 'firstUse'];
            if (validModes.includes(mode as GovernanceMode)) {
                return mode as GovernanceMode;
            }
            
            console.warn(`[GovernanceModeManager] Invalid mode "${mode}", defaulting to flexible`);
            return 'flexible';
        } catch (error) {
            console.error('[GovernanceModeManager] Failed to read mode from Context.RL4:', error);
            return 'flexible';
        }
    }

    /**
     * Set governance mode in Context.RL4
     */
    setMode(mode: GovernanceMode): boolean {
        if (!fs.existsSync(this.contextPath)) {
            console.error('[GovernanceModeManager] Context.RL4 does not exist');
            return false;
        }

        try {
            const content = fs.readFileSync(this.contextPath, 'utf8');
            const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
            
            if (!frontmatterMatch) {
                console.error('[GovernanceModeManager] Failed to parse Context.RL4');
                return false;
            }

            let frontmatter: any = {};
            try {
                frontmatter = yaml.load(frontmatterMatch[1]) || {};
            } catch (e) {
                console.error('[GovernanceModeManager] Failed to parse frontmatter:', e);
                return false;
            }

            // Update mode (remove both mode and deviation_mode, set mode)
            delete frontmatter.deviation_mode;
            frontmatter.mode = mode;

            const markdown = frontmatterMatch[2];
            const newContent = `---\n${yaml.dump(frontmatter).trim()}\n---\n${markdown}`;

            // Mark as internal write
            const writeTracker = WriteTracker.getInstance();
            writeTracker.markInternalWrite(this.contextPath);

            // Write-Ahead Log
            const workspaceRoot = path.dirname(this.rl4Path);
            WriteAheadLog.getInstance(workspaceRoot).logSync('Context.RL4', newContent);

            // Atomic write
            AtomicFS.writeAtomicSync(this.contextPath, newContent);

            console.log(`[GovernanceModeManager] Mode set to: ${mode}`);
            return true;
        } catch (error) {
            console.error('[GovernanceModeManager] Failed to set mode:', error);
            return false;
        }
    }

    /**
     * Get mode constraints (for validation)
     */
    getModeConstraints(mode: GovernanceMode): {
        mode: GovernanceMode;
        allowed_priorities: string[];
        max_files_created: number;
        max_files_modified: number;
        allow_directory_creation: boolean;
        allow_refactoring: boolean;
        allow_helper_files: boolean;
        allow_text_rewriting: boolean;
    } {
        switch (mode) {
            case 'strict':
                return {
                    mode: 'strict',
                    allowed_priorities: ['P0'],
                    max_files_created: 0,
                    max_files_modified: 0,
                    allow_directory_creation: false,
                    allow_refactoring: false,
                    allow_helper_files: false,
                    allow_text_rewriting: false
                };
            case 'flexible':
                return {
                    mode: 'flexible',
                    allowed_priorities: ['P0', 'P1'],
                    max_files_created: 3,
                    max_files_modified: 5,
                    allow_directory_creation: false,
                    allow_refactoring: false,
                    allow_helper_files: false,
                    allow_text_rewriting: false
                };
            case 'exploratory':
                return {
                    mode: 'exploratory',
                    allowed_priorities: ['P0', 'P1', 'P2'],
                    max_files_created: 10,
                    max_files_modified: 15,
                    allow_directory_creation: false,
                    allow_refactoring: true,
                    allow_helper_files: true,
                    allow_text_rewriting: false
                };
            case 'free':
                return {
                    mode: 'free',
                    allowed_priorities: ['P0', 'P1', 'P2', 'P3'],
                    max_files_created: 999,
                    max_files_modified: 999,
                    allow_directory_creation: true,
                    allow_refactoring: true,
                    allow_helper_files: true,
                    allow_text_rewriting: true
                };
            case 'firstUse':
                return {
                    mode: 'firstUse',
                    allowed_priorities: ['P0'],
                    max_files_created: 3,
                    max_files_modified: 0,
                    allow_directory_creation: false,
                    allow_refactoring: false,
                    allow_helper_files: false,
                    allow_text_rewriting: false
                };
            default:
                return this.getModeConstraints('flexible');
        }
    }
}
