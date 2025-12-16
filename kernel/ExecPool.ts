// extension/kernel/ExecPool.ts
import { TimerRegistry, TimerToken } from "./TimerRegistry";
import { v4 as uuidv4 } from "uuid";

/**
 * ExecPool RL6 – Version développée
 * ---------------------------------
 * - Concurrency isolation
 * - Queue backpressure
 * - Soft timeout (abort)
 * - Hard timeout (forced fail)
 * - Race-condition safe cleanup
 * - Deterministic scheduling
 * - Safe event dispatch (no crash on callback error)
 */

export interface ExecPoolOptions {
  maxConcurrency: number;
  queueLimit: number;
  defaultTimeoutMs: number;
  hardKillDelayMs: number;
  onTaskStart?: (info: ExecTaskStartEvent) => void;
  onTaskEnd?: (info: ExecTaskEndEvent) => void;
  onTaskError?: (info: ExecTaskErrorEvent) => void;
  onTaskTimeout?: (info: ExecTaskTimeoutEvent) => void;
}

export interface ExecTaskStartEvent {
  taskId: string;
  submittedAt: number;
  startedAt: number;
}

export interface ExecTaskEndEvent {
  taskId: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface ExecTaskErrorEvent {
  taskId: string;
  error: any;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface ExecTaskTimeoutEvent {
  taskId: string;
  startedAt: number;
  timeoutAt: number;
  durationMs: number;
}

export interface ExecPoolTask<T> {
  id: string;
  fn: (ctx: ExecTaskContext) => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: any) => void;
  submittedAt: number;
}

export interface ExecTaskContext {
  abortSignal: AbortSignal;
  timer: TimerToken;
}

export class ExecPool {
  private options: ExecPoolOptions;
  private running = 0;
  private queue: ExecPoolTask<any>[] = [];
  private timerRegistry: TimerRegistry;

  constructor(options: ExecPoolOptions, timerRegistry: TimerRegistry) {
    this.options = options;
    this.timerRegistry = timerRegistry;
  }

  submit<T>(fn: (ctx: ExecTaskContext) => Promise<T>): Promise<T> {
    if (this.queue.length >= this.options.queueLimit) {
      throw new Error("ExecPool queue limit exceeded");
    }

    return new Promise((resolve, reject) => {
      const task: ExecPoolTask<T> = {
        id: uuidv4(),
        fn,
        resolve,
        reject,
        submittedAt: Date.now(),
      };

      this.queue.push(task);
      this.process();
    });
  }

  /**
   * Execute a shell command (convenience method for GitCommitListener)
   */
  async run(command: string, options?: { cwd?: string }): Promise<{ stdout: string; stderr: string; code: number }> {
    return this.submit(async (ctx) => {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      try {
        const result = await execAsync(command, { 
          cwd: options?.cwd,
          signal: ctx.abortSignal 
        });
        return {
          stdout: result.stdout,
          stderr: result.stderr,
          code: 0
        };
      } catch (error: any) {
        return {
          stdout: error.stdout || '',
          stderr: error.stderr || '',
          code: error.code || 1
        };
      }
    });
  }

  /**
   * Deterministic FIFO scheduling
   */
  private process() {
    while (this.running < this.options.maxConcurrency && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.execute(task);
    }
  }

  /**
   * Executes a task with:
   *  - abortSignal
   *  - soft timeout
   *  - hard timeout
   *  - safe cleanup
   */
  private async execute(task: ExecPoolTask<any>) {
    this.running++;

    const start = Date.now();

    // Event dispatch safe wrapper
    const safe = (cb: Function | undefined, payload: any) => {
      try { cb?.(payload); } catch { /* never crash */ }
    };

    safe(this.options.onTaskStart, {
      taskId: task.id,
      submittedAt: task.submittedAt,
      startedAt: start,
    });

    let resolvedOrRejected = false;

    const abortController = new AbortController();

    // Soft timeout → abort
    const softTimerId = `execpool:${task.id}:soft`;
    this.timerRegistry.registerTimeout(
      softTimerId,
      () => {
        abortController.abort();

        const now = Date.now();
        safe(this.options.onTaskTimeout, {
          taskId: task.id,
          startedAt: start,
          timeoutAt: now,
          durationMs: now - start,
        });

        // Hard kill: forced rejection if task still pending
        const hardTimerId = `execpool:${task.id}:hard`;
        this.timerRegistry.registerTimeout(
          hardTimerId,
          () => {
            if (!resolvedOrRejected) {
              resolvedOrRejected = true;
              task.reject(new Error(`Task ${task.id} hard-killed after timeout`));
            }
          },
          this.options.hardKillDelayMs
        );
      },
      this.options.defaultTimeoutMs
    );

    // Get timer token for context
    const timerToken = this.timerRegistry.getTimer(softTimerId);
    if (!timerToken) {
      throw new Error(`Failed to get timer token for ${softTimerId}`);
    }

    const ctx: ExecTaskContext = {
      abortSignal: abortController.signal,
      timer: timerToken,
    };

    try {
      const result = await task.fn(ctx);

      if (!resolvedOrRejected) {
        resolvedOrRejected = true;
        task.resolve(result);

        const now = Date.now();
        safe(this.options.onTaskEnd, {
          taskId: task.id,
          startedAt: start,
          endedAt: now,
          durationMs: now - start,
        });
      }
    } catch (err) {
      if (!resolvedOrRejected) {
        resolvedOrRejected = true;
        task.reject(err);

        const now = Date.now();
        safe(this.options.onTaskError, {
          taskId: task.id,
          error: err,
          startedAt: start,
          endedAt: now,
          durationMs: now - start,
        });
      }
    } finally {
      this.timerRegistry.cancel(softTimerId);
      this.running--;
      this.process();
    }
  }
}