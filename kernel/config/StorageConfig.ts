/**
 * StorageConfig - Configuration Centralisée du Stockage
 * 
 * Centralise toutes les configurations liées au stockage :
 * - AppendOnlyWriter (queue sizes, overflow strategies)
 * - Rotation (file sizes, age limits)
 * - Cache (sizes, eviction policies)
 * - Memory Classes (retention policies)
 * 
 * Référence : docs/rl4-memory-contract.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { MemoryClass, MemoryClassConfig, MEMORY_CLASS_CONFIGS } from '../memory/MemoryClass';
import { OverflowStrategy } from '../AppendOnlyWriter';

export interface StorageConfig {
    appendOnlyWriter: {
        maxQueueSize: number;
        fsync: boolean;
    };
    rotation: {
        maxFileSizeMB: number;
        maxAgeDays: number;
        enableArchiving: boolean;
        enableCompression: boolean;
    };
    cache: {
        decisionStoreMaxSize: number;
        milIndexFlushIntervalMs: number;
    };
    memoryClasses: {
        [key in MemoryClass]: MemoryClassConfig;
    };
}

/**
 * Default storage configuration
 */
const DEFAULT_STORAGE_CONFIG: StorageConfig = {
    appendOnlyWriter: {
        maxQueueSize: 1000,
        fsync: false
    },
    rotation: {
        maxFileSizeMB: 100,
        maxAgeDays: 90,
        enableArchiving: false,
        enableCompression: false
    },
    cache: {
        decisionStoreMaxSize: 1000,
        milIndexFlushIntervalMs: 5000
    },
    memoryClasses: MEMORY_CLASS_CONFIGS
};

/**
 * Load storage configuration from file or return defaults
 */
export function loadStorageConfig(workspaceRoot: string): StorageConfig {
    const configPath = path.join(workspaceRoot, '.reasoning_rl4', 'storage_config.json');
    
    if (!fs.existsSync(configPath)) {
        return DEFAULT_STORAGE_CONFIG;
    }
    
    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const userConfig = JSON.parse(content);
        
        // Merge with defaults (user config overrides defaults)
        return {
            appendOnlyWriter: {
                ...DEFAULT_STORAGE_CONFIG.appendOnlyWriter,
                ...userConfig.appendOnlyWriter
            },
            rotation: {
                ...DEFAULT_STORAGE_CONFIG.rotation,
                ...userConfig.rotation
            },
            cache: {
                ...DEFAULT_STORAGE_CONFIG.cache,
                ...userConfig.cache
            },
            memoryClasses: {
                ...DEFAULT_STORAGE_CONFIG.memoryClasses,
                ...userConfig.memoryClasses
            }
        };
    } catch (error) {
        console.warn(`[StorageConfig] Failed to load config from ${configPath}, using defaults: ${error}`);
        return DEFAULT_STORAGE_CONFIG;
    }
}

/**
 * Save storage configuration to file
 */
export function saveStorageConfig(workspaceRoot: string, config: StorageConfig): void {
    const configPath = path.join(workspaceRoot, '.reasoning_rl4', 'storage_config.json');
    const configDir = path.dirname(configPath);
    
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
    
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
        console.error(`[StorageConfig] Failed to save config to ${configPath}: ${error}`);
        throw error;
    }
}

