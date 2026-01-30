/**
 * Worker Manager
 * Manages spawning, monitoring, and restarting worker processes.
 * Implements automatic restart with backoff and crash detection.
 */

import { fork, type ChildProcess, type Serializable } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createLogger } from '../logging/logger.js';
import { HeartbeatMonitor, type HeartbeatData, type HeartbeatStats } from './heartbeat-monitor.js';

const log = createLogger('worker-manager');

export type WorkerConfig = {
  /** Path to the worker script */
  scriptPath: string;
  /** Arguments to pass to the worker */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Maximum restart attempts (default: 10) */
  maxRestarts: number;
  /** Restart backoff initial delay in ms (default: 1000) */
  restartDelayMs: number;
  /** Maximum restart delay in ms (default: 30000) */
  maxRestartDelayMs: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number;
  /** Time window in ms to reset restart count (default: 60000) */
  restartWindowMs: number;
  /** Startup timeout - how long to wait for worker ready signal (default: 60000) */
  startupTimeoutMs?: number;
  /** Heartbeat monitoring config */
  heartbeat?: {
    intervalMs?: number;
    timeoutMs?: number;
    missedThreshold?: number;
  };
};

export type WorkerState = 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed' | 'hung';

export type WorkerStats = {
  state: WorkerState;
  pid: number | null;
  startedAt: number | null;
  uptime: number;
  restartCount: number;
  lastRestartAt: number | null;
  lastExitCode: number | null;
  lastExitSignal: string | null;
  heartbeat: HeartbeatStats;
};

export type WorkerEvents = {
  'started': (pid: number) => void;
  'stopped': (code: number | null, signal: string | null) => void;
  'crashed': (code: number | null, signal: string | null) => void;
  'hung': (missedHeartbeats: number) => void;
  'restarting': (attempt: number, delayMs: number) => void;
  'max-restarts': (restartCount: number) => void;
  'message': (message: unknown) => void;
  'heartbeat': (data: HeartbeatData) => void;
};

const DEFAULT_CONFIG: Omit<WorkerConfig, 'scriptPath'> = {
  maxRestarts: 10,
  restartDelayMs: 1000,
  maxRestartDelayMs: 30_000,
  backoffMultiplier: 2,
  restartWindowMs: 60_000,
};

export interface WorkerManager {
  on<E extends keyof WorkerEvents>(event: E, listener: WorkerEvents[E]): this;
  emit<E extends keyof WorkerEvents>(event: E, ...args: Parameters<WorkerEvents[E]>): boolean;
}

export class WorkerManager extends EventEmitter {
  private readonly config: WorkerConfig;
  private worker: ChildProcess | null = null;
  private state: WorkerState = 'stopped';
  private startedAt: number | null = null;
  private restartCount = 0;
  private consecutiveRestarts = 0;
  private lastRestartAt: number | null = null;
  private lastExitCode: number | null = null;
  private lastExitSignal: string | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly heartbeatMonitor: HeartbeatMonitor;
  private shouldRestart = true;

  constructor(config: WorkerConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.heartbeatMonitor = new HeartbeatMonitor({
      intervalMs: config.heartbeat?.intervalMs ?? 5000,
      timeoutMs: config.heartbeat?.timeoutMs ?? 15000,
      missedThreshold: config.heartbeat?.missedThreshold ?? 3,
      onHeartbeat: (data) => {
        this.emit('heartbeat', data);
      },
      onDead: (missedCount) => {
        this.handleHungWorker(missedCount);
      },
    });
  }

  /**
   * Start the worker process
   */
  async start(): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') {
      log.warn('Worker already running or starting');
      return;
    }

    this.shouldRestart = true;
    this.state = 'starting';

    try {
      await this.spawnWorker();
    } catch (error) {
      this.state = 'crashed';
      throw error;
    }
  }

  private async spawnWorker(): Promise<void> {
    log.info(`Spawning worker: ${this.config.scriptPath}`);

    const env = {
      ...process.env,
      ...this.config.env,
      CLAWDBOT_WORKER: '1',
      CLAWDBOT_WORKER_PID: String(process.pid),
    };

    this.worker = fork(this.config.scriptPath, this.config.args ?? [], {
      env,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    // Pipe stdout/stderr
    this.worker.stdout?.on('data', (data: Buffer) => {
      process.stdout.write(`[worker] ${data.toString()}`);
    });

    this.worker.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(`[worker:err] ${data.toString()}`);
    });

    // Handle messages from worker
    this.worker.on('message', (message: unknown) => {
      this.handleWorkerMessage(message);
    });

    // Handle worker exit
    this.worker.on('exit', (code, signal) => {
      this.handleWorkerExit(code, signal);
    });

    // Handle errors
    this.worker.on('error', (error) => {
      log.error(`Worker error: ${String(error)}`);
      this.handleWorkerExit(1, null);
    });

    // Wait for worker to signal ready
    await this.waitForReady(this.config.startupTimeoutMs ?? 60_000);

    this.state = 'running';
    this.startedAt = Date.now();
    this.heartbeatMonitor.start();

    log.info(`Worker started with PID ${this.worker.pid}`);
    this.emit('started', this.worker.pid!);
  }

  private async waitForReady(timeoutMs: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Worker startup timeout'));
      }, timeoutMs);

      const handler = (message: unknown) => {
        if (isReadyMessage(message)) {
          clearTimeout(timer);
          this.worker?.off('message', handler);
          resolve();
        }
      };

      this.worker?.on('message', handler);

      // Also resolve if worker exits during startup
      this.worker?.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('Worker exited during startup'));
      });
    });
  }

  private handleWorkerMessage(message: unknown): void {
    if (isHeartbeatMessage(message)) {
      this.heartbeatMonitor.recordHeartbeat(message.heartbeat);
      return;
    }

    this.emit('message', message);
  }

  private handleWorkerExit(code: number | null, signal: string | null): void {
    this.heartbeatMonitor.stop();
    this.worker = null;
    this.lastExitCode = code;
    this.lastExitSignal = signal;

    const wasRunning = this.state === 'running';
    const uptime = this.startedAt ? Date.now() - this.startedAt : 0;

    log.warn(`Worker exited`, { code, signal, uptime, wasRunning });

    if (this.state === 'stopping') {
      this.state = 'stopped';
      this.emit('stopped', code, signal);
      return;
    }

    this.state = 'crashed';
    this.emit('crashed', code, signal);

    if (this.shouldRestart) {
      this.scheduleRestart();
    }
  }

  private handleHungWorker(missedHeartbeats: number): void {
    log.error(`Worker appears hung - ${missedHeartbeats} missed heartbeats`);
    this.state = 'hung';
    this.emit('hung', missedHeartbeats);

    // Force kill the worker
    this.killWorker('SIGKILL');
  }

  private scheduleRestart(): void {
    const now = Date.now();

    // Check if we're within the restart window
    if (this.lastRestartAt && now - this.lastRestartAt > this.config.restartWindowMs) {
      this.consecutiveRestarts = 0;
    }

    this.consecutiveRestarts++;
    this.restartCount++;

    if (this.consecutiveRestarts > this.config.maxRestarts) {
      log.error(`Max restart attempts (${this.config.maxRestarts}) exceeded`);
      this.emit('max-restarts', this.restartCount);
      this.shouldRestart = false;
      return;
    }

    // Calculate backoff delay
    const delay = Math.min(
      this.config.restartDelayMs * Math.pow(this.config.backoffMultiplier, this.consecutiveRestarts - 1),
      this.config.maxRestartDelayMs,
    );

    log.info(`Scheduling restart in ${delay}ms (attempt ${this.consecutiveRestarts})`);
    this.emit('restarting', this.consecutiveRestarts, delay);

    this.restartTimer = setTimeout(async () => {
      this.restartTimer = null;
      this.lastRestartAt = Date.now();
      this.heartbeatMonitor.reset();

      try {
        await this.spawnWorker();
      } catch (error) {
        log.error(`Failed to restart worker: ${String(error)}`);
        this.scheduleRestart();
      }
    }, delay);
  }

  /**
   * Stop the worker process gracefully
   */
  async stop(timeoutMs: number = 10000): Promise<void> {
    if (!this.worker || this.state === 'stopped' || this.state === 'stopping') {
      return;
    }

    this.shouldRestart = false;
    this.state = 'stopping';

    // Cancel any pending restart
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    log.info('Stopping worker gracefully...');

    // Send shutdown message
    this.sendMessage({ type: 'shutdown' });

    // Wait for graceful shutdown
    const exitPromise = new Promise<void>((resolve) => {
      this.worker?.once('exit', () => resolve());
    });

    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        if (this.worker) {
          log.warn('Worker did not exit gracefully, killing...');
          this.killWorker('SIGTERM');
        }
        resolve();
      }, timeoutMs);
    });

    await Promise.race([exitPromise, timeoutPromise]);

    // Force kill if still running
    if (this.worker) {
      log.warn('Force killing worker...');
      this.killWorker('SIGKILL');
    }

    this.state = 'stopped';
    this.heartbeatMonitor.stop();
  }

  private killWorker(signal: NodeJS.Signals): void {
    if (!this.worker) return;

    try {
      this.worker.kill(signal);
    } catch (error) {
      log.error(`Failed to kill worker: ${String(error)}`);
    }
  }

  /**
   * Send a message to the worker
   */
  sendMessage(message: Serializable): boolean {
    if (!this.worker || !this.worker.connected) {
      return false;
    }

    try {
      this.worker.send(message);
      return true;
    } catch (error) {
      log.error(`Failed to send message to worker: ${String(error)}`);
      return false;
    }
  }

  /**
   * Get current worker stats
   */
  getStats(): WorkerStats {
    return {
      state: this.state,
      pid: this.worker?.pid ?? null,
      startedAt: this.startedAt,
      uptime: this.startedAt ? Date.now() - this.startedAt : 0,
      restartCount: this.restartCount,
      lastRestartAt: this.lastRestartAt,
      lastExitCode: this.lastExitCode,
      lastExitSignal: this.lastExitSignal,
      heartbeat: this.heartbeatMonitor.getStats(),
    };
  }

  /**
   * Check if worker is running
   */
  isRunning(): boolean {
    return this.state === 'running';
  }

  /**
   * Force restart the worker
   */
  async restart(): Promise<void> {
    await this.stop();
    this.consecutiveRestarts = 0;
    await this.start();
  }
}

// Message type guards
function isReadyMessage(msg: unknown): msg is { type: 'ready' } {
  return typeof msg === 'object' && msg !== null && (msg as { type?: string }).type === 'ready';
}

function isHeartbeatMessage(msg: unknown): msg is { type: 'heartbeat'; heartbeat: HeartbeatData } {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: string }).type === 'heartbeat' &&
    typeof (msg as { heartbeat?: unknown }).heartbeat === 'object'
  );
}
