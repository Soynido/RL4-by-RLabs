import * as path from 'path';
import { AppendOnlyWriter } from '../AppendOnlyWriter';
import type { ILogger } from '../core/ILogger';
type RL4Mode = string;

export type KernelPhaseName = 'assemble_context' | 'pipeline_validation' | 'apply_results' | string;

export interface KernelPhaseMetric {
  name: KernelPhaseName;
  duration_ms: number;
}

export interface LLMCallMetric {
  name: 'patterns' | 'correlations' | 'forecasts' | 'adr_generation' | 'terminal_patterns' | 'ad_hoc' | string;
  duration_ms: number;
  success: boolean;
  error?: string;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  retries?: number;
  mode?: 'live' | 'fallback' | 'safe_blocked' | 'error' | 'unknown';
  prompt_chars_original?: number;
  prompt_chars_optimized?: number;
  prompt_final_chars?: number;
  prompt_hash?: string;
  prompt_format_time_ms?: number;
  prompt_optimize_time_ms?: number;
  prompt_total_time_ms?: number;
  prompt_compression_ratio?: number;
}

export interface LoopHealthSnapshot {
  cycle_id: number;
  timestamp: string;
  deviation_mode: RL4Mode;
  ledger_safe_mode: boolean;
  kernel: {
    total_ms: number;
    phases: KernelPhaseMetric[];
  };
  core: {
    total_ms: number;
    calls: LLMCallMetric[];
  };
  separation: {
    kernel_share: number;
    core_share: number;
    adapter_failures: number;
    facts_only_enforced: boolean;
  };
  health: {
    success: boolean;
    total_duration_ms: number;
    degradation_score: number;
    drivers: {
      ratio_drift: number;
      adapter_penalty: number;
      duration_penalty: number;
      safe_mode_penalty: number;
      success_penalty: number;
    };
  };
  llm: {
    latency_p95_ms: number;
    latency_p99_ms: number;
    average_latency_ms: number;
    tokens_in_total: number;
    tokens_out_total: number;
    total_cost_usd: number;
    total_retries: number;
    call_count: number;
    success_count: number;
    execution_mode_histogram: Record<string, number>;
    safe_mode_ratio: number;
    adapter_failure_ratio: number;
    retry_distribution: Record<string, number>;
    prompt_metrics?: {
      avg_prompt_chars_original?: number;
      avg_prompt_chars_optimized?: number;
      avg_prompt_final_chars?: number;
      avg_format_time_ms?: number;
      avg_optimize_time_ms?: number;
      avg_total_time_ms?: number;
      avg_compression_ratio?: number;
    };
  };
}

interface CycleMetricsMeta {
  cycleId: number;
  deviationMode: RL4Mode;
  ledgerSafeMode: boolean;
  totalDurationMs: number;
  resultSuccess: boolean;
  timestamp: string;
}

/**
 * Tracks kernel/core timings per cognitive cycle and persists a loop health snapshot.
 */
export class CognitiveMetricsTracker {
  private writer: AppendOnlyWriter;
  private llmWriter: AppendOnlyWriter;
  private kernelPhases: KernelPhaseMetric[] = [];
  private llmCalls: LLMCallMetric[] = [];
  private activeCycleId: number | null = null;
  private factsOnlyEnforced = false;
  private lastSnapshot: LoopHealthSnapshot | null = null;

  constructor(private workspaceRoot: string, private logger: ILogger) {
    const metricsPath = path.join(workspaceRoot, '.reasoning_rl4', 'diagnostics', 'metrics', 'cycle-metrics.jsonl');
    this.writer = new AppendOnlyWriter(metricsPath, { fsync: false, mkdirRecursive: true });
    const llmMetricsPath = path.join(workspaceRoot, '.reasoning_rl4', 'diagnostics', 'metrics', 'llm-metrics.jsonl');
    this.llmWriter = new AppendOnlyWriter(llmMetricsPath, { fsync: false, mkdirRecursive: true });
  }

  startCycle(cycleId: number): void {
    this.activeCycleId = cycleId;
    this.kernelPhases = [];
    this.llmCalls = [];
    this.factsOnlyEnforced = false;
  }

  recordKernelPhase(name: KernelPhaseMetric['name'], durationMs: number): void {
    if (this.activeCycleId === null) {
      return;
    }
    const duration = Number(Math.max(durationMs, 0).toFixed(3));
    this.kernelPhases.push({ name, duration_ms: duration });
  }

  recordLLMCall(metric: LLMCallMetric): void {
    if (this.activeCycleId === null) {
      return;
    }
    const duration = Number(Math.max(metric.duration_ms, 0).toFixed(3));
    this.llmCalls.push({
      ...metric,
      duration_ms: duration,
      success: metric.success,
      tokens_in: metric.tokens_in ?? 0,
      tokens_out: metric.tokens_out ?? 0,
      cost_usd: metric.cost_usd ?? 0,
      retries: metric.retries ?? 0,
      mode: metric.mode ?? 'unknown'
    });
  }

  markFactsValidationPassed(): void {
    if (this.activeCycleId === null) return;
    this.factsOnlyEnforced = true;
  }

  getLastSnapshot(): LoopHealthSnapshot | null {
    return this.lastSnapshot;
  }

  async finalizeCycle(meta: CycleMetricsMeta): Promise<LoopHealthSnapshot> {
    if (this.activeCycleId === null) {
      const zeroLLM = this.zeroLLMSummary();
      return this.lastSnapshot ?? {
        cycle_id: meta.cycleId,
        timestamp: meta.timestamp,
        deviation_mode: meta.deviationMode,
        ledger_safe_mode: meta.ledgerSafeMode,
        kernel: { total_ms: 0, phases: [] },
        core: { total_ms: 0, calls: [] },
        separation: {
          kernel_share: 0,
          core_share: 0,
          adapter_failures: 0,
          facts_only_enforced: false
        },
        health: {
          success: meta.resultSuccess,
          total_duration_ms: meta.totalDurationMs,
          degradation_score: meta.resultSuccess ? 0 : 1,
          drivers: {
            ratio_drift: 0,
            adapter_penalty: 0,
            duration_penalty: 0,
            safe_mode_penalty: meta.ledgerSafeMode ? 0.5 : 0,
            success_penalty: meta.resultSuccess ? 0 : 0.5
          }
        },
        llm: zeroLLM
      };
    }

    const kernelTotal = Number(
      this.kernelPhases.reduce((sum, phase) => sum + phase.duration_ms, 0).toFixed(3)
    );
    const coreTotal = Number(
      this.llmCalls.reduce((sum, call) => sum + call.duration_ms, 0).toFixed(3)
    );
    const denominator = kernelTotal + coreTotal;
    const kernelShare = denominator === 0 ? 0 : Number((kernelTotal / denominator).toFixed(4));
    const coreShare = denominator === 0 ? 0 : Number((coreTotal / denominator).toFixed(4));
    const adapterFailures = this.llmCalls.filter(call => !call.success).length;
    const adapterTotal = this.llmCalls.length;
    const degradation = this.calculateDegradationScore(kernelShare, meta, adapterFailures, adapterTotal);

    const llmStats = this.summarizeLLMCalls(meta);

    const snapshot: LoopHealthSnapshot = {
      cycle_id: meta.cycleId,
      timestamp: meta.timestamp,
      deviation_mode: meta.deviationMode,
      ledger_safe_mode: meta.ledgerSafeMode,
      kernel: {
        total_ms: kernelTotal,
        phases: [...this.kernelPhases]
      },
      core: {
        total_ms: coreTotal,
        calls: [...this.llmCalls]
      },
      separation: {
        kernel_share: kernelShare,
        core_share: coreShare,
        adapter_failures: adapterFailures,
        facts_only_enforced: this.factsOnlyEnforced
      },
      health: {
        success: meta.resultSuccess,
        total_duration_ms: Number(Math.max(meta.totalDurationMs, 0).toFixed(3)),
        degradation_score: degradation.score,
        drivers: degradation.drivers
      },
      llm: llmStats.summary
    };

    try {
      await this.writer.append(snapshot);
      await this.writer.flush();
      await this.llmWriter.append({
        cycle_id: meta.cycleId,
        timestamp: meta.timestamp,
        deviation_mode: meta.deviationMode,
        ledger_safe_mode: meta.ledgerSafeMode,
        ...llmStats.logEntry
      });
      await this.llmWriter.flush();
      this.lastSnapshot = snapshot;
    } catch (error) {
      this.logger.warning(`⚠️ Failed to persist loop health metrics: ${error}`);
    } finally {
      this.activeCycleId = null;
    }

    return snapshot;
  }

  private calculateDegradationScore(
    kernelShare: number,
    meta: CycleMetricsMeta,
    adapterFailures: number,
    adapterTotal: number
  ): { score: number; drivers: LoopHealthSnapshot['health']['drivers'] } {
    const ratioDrift = Number(Math.min(1, Math.abs(kernelShare - 0.5) * 2).toFixed(4));
    const adapterPenalty = adapterTotal === 0 ? 0 : Number(Math.min(1, adapterFailures / adapterTotal).toFixed(4));
    const durationPenalty = Number(
      Math.min(1, Math.max(meta.totalDurationMs - 2500, 0) / 7500).toFixed(4)
    );
    const safeModePenalty = meta.ledgerSafeMode ? 0.5 : 0;
    const successPenalty = meta.resultSuccess ? 0 : 0.5;

    const score = Number(
      Math.min(
        1,
        ratioDrift * 0.35 +
          adapterPenalty * 0.3 +
          durationPenalty * 0.2 +
          safeModePenalty * 0.1 +
          successPenalty * 0.05
      ).toFixed(3)
    );

    return {
      score,
      drivers: {
        ratio_drift: ratioDrift,
        adapter_penalty: adapterPenalty,
        duration_penalty: durationPenalty,
        safe_mode_penalty: Number(safeModePenalty.toFixed(3)),
        success_penalty: Number(successPenalty.toFixed(3))
      }
    };
  }

  private summarizeLLMCalls(meta: CycleMetricsMeta): {
    summary: LoopHealthSnapshot['llm'];
    logEntry: {
      latency_p95_ms: number;
      average_latency_ms: number;
      tokens_in_total: number;
      tokens_out_total: number;
      total_cost_usd: number;
      total_retries: number;
      call_count: number;
      success_count: number;
    };
  } {
    const latencies = this.llmCalls.map(call => call.duration_ms).sort((a, b) => a - b);
    const callCount = this.llmCalls.length;
    const successCount = this.llmCalls.filter(call => call.success).length;
    const percentileValue = (p: number): number => {
      if (callCount === 0) return 0;
      const index = Math.min(latencies.length - 1, Math.floor((latencies.length - 1) * p));
      return latencies[index];
    };
    const latencyP95 = percentileValue(0.95);
    const latencyP99 = percentileValue(0.99);
    const avgLatency =
      callCount === 0
        ? 0
        : latencies.reduce((sum, value) => sum + value, 0) / callCount;
    const tokensIn = this.llmCalls.reduce((sum, call) => sum + (call.tokens_in ?? 0), 0);
    const tokensOut = this.llmCalls.reduce((sum, call) => sum + (call.tokens_out ?? 0), 0);
    const costUsd = this.llmCalls.reduce((sum, call) => sum + (call.cost_usd ?? 0), 0);
    const retries = this.llmCalls.reduce((sum, call) => sum + (call.retries ?? 0), 0);

    const executionModeHistogram: Record<string, number> = {};
    const retryDistribution: Record<string, number> = {};
    let safeModeCalls = 0;
    const promptAggregate = {
      original: { sum: 0, count: 0 },
      optimized: { sum: 0, count: 0 },
      finalChars: { sum: 0, count: 0 },
      formatTime: { sum: 0, count: 0 },
      optimizeTime: { sum: 0, count: 0 },
      totalTime: { sum: 0, count: 0 },
      compression: { sum: 0, count: 0 }
    };

    for (const call of this.llmCalls) {
      const mode = call.mode ?? 'unknown';
      executionModeHistogram[mode] = (executionModeHistogram[mode] || 0) + 1;
      if (mode === 'safe_blocked') {
        safeModeCalls++;
      }
      const retriesKey = String(call.retries ?? 0);
      retryDistribution[retriesKey] = (retryDistribution[retriesKey] || 0) + 1;

      if (typeof call.prompt_chars_original === 'number') {
        promptAggregate.original.sum += call.prompt_chars_original;
        promptAggregate.original.count++;
      }
      if (typeof call.prompt_chars_optimized === 'number') {
        promptAggregate.optimized.sum += call.prompt_chars_optimized;
        promptAggregate.optimized.count++;
      }
      if (typeof call.prompt_final_chars === 'number') {
        promptAggregate.finalChars.sum += call.prompt_final_chars;
        promptAggregate.finalChars.count++;
      }
      if (typeof call.prompt_format_time_ms === 'number') {
        promptAggregate.formatTime.sum += call.prompt_format_time_ms;
        promptAggregate.formatTime.count++;
      }
      if (typeof call.prompt_optimize_time_ms === 'number') {
        promptAggregate.optimizeTime.sum += call.prompt_optimize_time_ms;
        promptAggregate.optimizeTime.count++;
      }
      if (typeof call.prompt_total_time_ms === 'number') {
        promptAggregate.totalTime.sum += call.prompt_total_time_ms;
        promptAggregate.totalTime.count++;
      }
      if (typeof call.prompt_compression_ratio === 'number') {
        promptAggregate.compression.sum += call.prompt_compression_ratio;
        promptAggregate.compression.count++;
      }
    }

    const promptMetrics =
      Object.values(promptAggregate).some(item => item.count > 0)
        ? {
            avg_prompt_chars_original:
              promptAggregate.original.count > 0
                ? Number((promptAggregate.original.sum / promptAggregate.original.count).toFixed(2))
                : undefined,
            avg_prompt_chars_optimized:
              promptAggregate.optimized.count > 0
                ? Number((promptAggregate.optimized.sum / promptAggregate.optimized.count).toFixed(2))
                : undefined,
            avg_prompt_final_chars:
              promptAggregate.finalChars.count > 0
                ? Number((promptAggregate.finalChars.sum / promptAggregate.finalChars.count).toFixed(2))
                : undefined,
            avg_format_time_ms:
              promptAggregate.formatTime.count > 0
                ? Number((promptAggregate.formatTime.sum / promptAggregate.formatTime.count).toFixed(2))
                : undefined,
            avg_optimize_time_ms:
              promptAggregate.optimizeTime.count > 0
                ? Number((promptAggregate.optimizeTime.sum / promptAggregate.optimizeTime.count).toFixed(2))
                : undefined,
            avg_total_time_ms:
              promptAggregate.totalTime.count > 0
                ? Number((promptAggregate.totalTime.sum / promptAggregate.totalTime.count).toFixed(2))
                : undefined,
            avg_compression_ratio:
              promptAggregate.compression.count > 0
                ? Number((promptAggregate.compression.sum / promptAggregate.compression.count).toFixed(4))
                : undefined
          }
        : undefined;

    const summary: LoopHealthSnapshot['llm'] = {
      latency_p95_ms: Number(latencyP95.toFixed(3)),
      latency_p99_ms: Number(latencyP99.toFixed(3)),
      average_latency_ms: Number(avgLatency.toFixed(3)),
      tokens_in_total: Number(tokensIn.toFixed(3)),
      tokens_out_total: Number(tokensOut.toFixed(3)),
      total_cost_usd: Number(costUsd.toFixed(6)),
      total_retries: retries,
      call_count: callCount,
      success_count: successCount,
      execution_mode_histogram: executionModeHistogram,
      safe_mode_ratio: callCount === 0 ? 0 : Number((safeModeCalls / callCount).toFixed(4)),
      adapter_failure_ratio:
        callCount === 0 ? 0 : Number(((callCount - successCount) / callCount).toFixed(4)),
      retry_distribution: retryDistribution,
      prompt_metrics: promptMetrics
    };

    return {
      summary,
      logEntry: summary
    };
  }

  private zeroLLMSummary(): LoopHealthSnapshot['llm'] {
    return {
      latency_p95_ms: 0,
      latency_p99_ms: 0,
      average_latency_ms: 0,
      tokens_in_total: 0,
      tokens_out_total: 0,
      total_cost_usd: 0,
      total_retries: 0,
      call_count: 0,
      success_count: 0,
      execution_mode_histogram: {},
      safe_mode_ratio: 0,
      adapter_failure_ratio: 0,
      retry_distribution: {},
      prompt_metrics: undefined
    };
  }
}


