/**
 * Kernel Configuration
 * 
 * Loads from .reasoning_rl4/kernel_config.json
 * Feature flags for gradual rollout
 */

import * as fs from 'fs';
import * as path from 'path';

export interface KernelConfig {
    USE_TIMER_REGISTRY: boolean;
    USE_APPEND_ONLY_IO: boolean;
    USE_EXEC_POOL: boolean;
    USE_STATE_REGISTRY: boolean;
    USE_HEALTH_MONITOR: boolean;
    
    exec_pool_size: number;
    exec_timeout_ms: number;
    health_check_interval_ms: number;
    state_snapshot_interval_ms: number;
    cognitive_cycle_interval_ms: number;
    TEST_MODE?: boolean; // ✅ P0-HARDENING-03: Explicit flag to enable fast cycles
}

export function loadKernelConfig(workspaceRoot: string): KernelConfig {
    const configPath = path.join(workspaceRoot, '.reasoning_rl4', 'kernel_config.json');
    
    const defaults: KernelConfig = {
        USE_TIMER_REGISTRY: true,
        USE_APPEND_ONLY_IO: true,
        USE_EXEC_POOL: true,
        USE_STATE_REGISTRY: true,
        USE_HEALTH_MONITOR: true,
        
        exec_pool_size: 2,
        exec_timeout_ms: 2000,
        health_check_interval_ms: 10000,
        state_snapshot_interval_ms: 600000,
        cognitive_cycle_interval_ms: 7200000, // ✅ P0-HARDENING-03: 2h production default (was 10s)
        TEST_MODE: false // ✅ P0-HARDENING-03: Explicit production mode
    };
    
    if (!fs.existsSync(configPath)) {
        // Create default config
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2));
        return defaults;
    }
    
    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const mergedConfig = { ...defaults, ...config };
        
        // ✅ P0-HARDENING-03: Validate production safety
        // If cognitive_cycle_interval_ms < 60000 (1 min) AND TEST_MODE not explicitly true → reject
        if (mergedConfig.cognitive_cycle_interval_ms < 60000 && mergedConfig.TEST_MODE !== true) {
            throw new Error(
                `❌ TEST MODE not allowed in production: cognitive_cycle_interval_ms = ${mergedConfig.cognitive_cycle_interval_ms}ms (< 60s). ` +
                `Set TEST_MODE: true in kernel_config.json to enable fast cycles.`
            );
        }
        
        return mergedConfig;
    } catch (error) {
        console.warn('⚠️ Failed to load kernel config, using defaults:', error);
        return defaults;
    }
}
