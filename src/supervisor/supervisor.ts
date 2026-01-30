/**
 * Main Supervisor
 * Orchestrates worker management, health monitoring, and recovery decisions.
 * This is the entry point when running as a Windows Service.
 */

import { EventEmitter } from 'node:events';
import type { Serializable } from 'node:child_process';
import { createLogger } from '../logging/logger.js';
import { WorkerManager, type WorkerConfig, type WorkerStats } from './worker-manager.js';
import { AIRecovery, type RecoveryAction, type RecoveryDecision } from './ai-recovery.js';
import type { HeartbeatData } from './heartbeat-monitor.js';

const log = createLogger('supervisor');

export type SupervisorConfig = {
  /** Worker configuration */
  worker: WorkerConfig;
  /** Enable AI-powered recovery decisions */
  aiRecoveryEnabled: boolean;
  /** Health check endpoint port */
  healthPort: number;
  /** Maximum consecutive crashes before giving up */
  maxConsecutiveCrashes: number;
  /** Cooldown after AI recovery decision in ms */
  recoveryDecisionCooldownMs: number;
};

export type SupervisorState = 'stopped' | 'starting' | 'running' | 'stopping' | 'failed';

export type SupervisorStats = {
  state: SupervisorState;
  startedAt: number | null;
  uptime: number;
  worker: WorkerStats;
  recoveryDecisions: RecoveryDecision[];
  lastRecoveryAction: RecoveryAction | null;
};

export type SupervisorEvents = {
  'started': () => void;
  'stopped': () => void;
  'worker-started': (pid: number) => void;
  'worker-stopped': () => void;
  'worker-crashed': (code: number | null) => void;
  'worker-hung': () => void;
  'recovery-decision': (decision: RecoveryDecision) => void;
  'failed': (reason: string) => void;
};

const DEFAULT_CONFIG: Omit<SupervisorConfig, 'worker'> = {
  aiRecoveryEnabled: true,
  healthPort: 18790,
  maxConsecutiveCrashes: 5,
  recoveryDecisionCooldownMs: 60_000,
};

export interface Supervisor {
  on<E extends keyof SupervisorEvents>(event: E, listener: SupervisorEvents[E]): this;
  emit<E extends keyof SupervisorEvents>(event: E, ...args: Parameters<SupervisorEvents[E]>): boolean;
}

export class Supervisor extends EventEmitter {
  private readonly config: SupervisorConfig;
  private readonly workerManager: WorkerManager;
  private readonly aiRecovery: AIRecovery;
  private state: SupervisorState = 'stopped';
  private startedAt: number | null = null;
  private consecutiveCrashes = 0;
  private recoveryDecisions: RecoveryDecision[] = [];
  private lastRecoveryAction: RecoveryAction | null = null;
  private lastRecoveryDecisionAt: number | null = null;
  private shutdownRequested = false;

  constructor(config: SupervisorConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize worker manager
    this.workerManager = new WorkerManager(config.worker);
    this.setupWorkerListeners();

    // Initialize AI recovery
    this.aiRecovery = new AIRecovery({
      enabled: config.aiRecoveryEnabled,
    });
  }

  private setupWorkerListeners(): void {
    this.workerManager.on('started', (pid) => {
      log.info(`Worker started: PID ${pid}`);
      this.consecutiveCrashes = 0;
      this.emit('worker-started', pid);
    });

    this.workerManager.on('stopped', () => {
      log.info('Worker stopped gracefully');
      this.emit('worker-stopped');
    });

    this.workerManager.on('crashed', (code, signal) => {
      log.error(`Worker crashed: code=${code}, signal=${signal}`);
      this.consecutiveCrashes++;
      this.emit('worker-crashed', code);
      this.handleWorkerFailure('crash', { code, signal });
    });

    this.workerManager.on('hung', (missedHeartbeats) => {
      log.error(`Worker hung: ${missedHeartbeats} missed heartbeats`);
      this.emit('worker-hung');
      this.handleWorkerFailure('hang', { missedHeartbeats });
    });

    this.workerManager.on('max-restarts', (count) => {
      log.error(`Max restarts reached: ${count}`);
      this.handleWorkerFailure('max-restarts', { restartCount: count });
    });

    this.workerManager.on('heartbeat', (data: HeartbeatData) => {
      // Log memory warnings
      const memoryMB = data.memory.heapUsed / 1024 / 1024;
      if (memoryMB > 500) {
        log.warn(`Worker high memory usage: ${Math.round(memoryMB)}MB`);
      }
    });

    this.workerManager.on('restarting', (attempt, delayMs) => {
      log.info(`Worker restarting: attempt ${attempt}, delay ${delayMs}ms`);
    });
  }

  private async handleWorkerFailure(
    reason: 'crash' | 'hang' | 'max-restarts',
    context: Record<string, unknown>,
  ): Promise<void> {
    if (this.shutdownRequested) {
      return;
    }

    // Check if we should make a recovery decision
    const now = Date.now();
    if (
      this.lastRecoveryDecisionAt &&
      now - this.lastRecoveryDecisionAt < this.config.recoveryDecisionCooldownMs
    ) {
      log.debug('Recovery decision in cooldown');
      return;
    }

    // Get AI recovery decision if enabled
    if (this.config.aiRecoveryEnabled) {
      const decision = await this.aiRecovery.decide({
        reason,
        context,
        stats: this.getStats(),
        consecutiveCrashes: this.consecutiveCrashes,
      });

      this.recoveryDecisions.push(decision);
      if (this.recoveryDecisions.length > 100) {
        this.recoveryDecisions.shift();
      }

      this.lastRecoveryDecisionAt = now;
      this.lastRecoveryAction = decision.action;

      log.info(`AI Recovery decision: ${decision.action}`, {
        reason: decision.reason,
        confidence: decision.confidence,
      });

      this.emit('recovery-decision', decision);

      await this.executeRecoveryAction(decision);
    }

    // Check for failure threshold
    if (this.consecutiveCrashes >= this.config.maxConsecutiveCrashes) {
      this.state = 'failed';
      this.emit('failed', `Max consecutive crashes (${this.consecutiveCrashes}) exceeded`);
    }
  }

  private async executeRecoveryAction(decision: RecoveryDecision): Promise<void> {
    switch (decision.action) {
      case 'restart':
        log.info('Executing recovery action: restart');
        // Worker manager handles restarts automatically
        break;

      case 'wait':
        log.info(`Executing recovery action: wait ${decision.waitMs}ms`);
        // Already waiting via worker manager backoff
        break;

      case 'escalate':
        log.error('Recovery action: escalate - human intervention needed');
        // Could send alert, write to event log, etc.
        break;

      case 'give-up':
        log.error('Recovery action: give-up - stopping supervisor');
        this.state = 'failed';
        await this.stop();
        break;
    }
  }

  /**
   * Start the supervisor and worker
   */
  async start(): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') {
      log.warn('Supervisor already running or starting');
      return;
    }

    log.info('Starting supervisor...');
    this.state = 'starting';
    this.shutdownRequested = false;

    try {
      await this.workerManager.start();
      this.state = 'running';
      this.startedAt = Date.now();
      log.info('Supervisor started');
      this.emit('started');
    } catch (error) {
      this.state = 'failed';
      log.error(`Supervisor failed to start: ${String(error)}`);
      throw error;
    }
  }

  /**
   * Stop the supervisor and worker gracefully
   */
  async stop(): Promise<void> {
    if (this.state === 'stopped' || this.state === 'stopping') {
      return;
    }

    log.info('Stopping supervisor...');
    this.state = 'stopping';
    this.shutdownRequested = true;

    try {
      await this.workerManager.stop();
    } catch (error) {
      log.error(`Error stopping worker: ${String(error)}`);
    }

    this.state = 'stopped';
    this.startedAt = null;
    log.info('Supervisor stopped');
    this.emit('stopped');
  }

  /**
   * Get supervisor statistics
   */
  getStats(): SupervisorStats {
    return {
      state: this.state,
      startedAt: this.startedAt,
      uptime: this.startedAt ? Date.now() - this.startedAt : 0,
      worker: this.workerManager.getStats(),
      recoveryDecisions: [...this.recoveryDecisions].slice(-10), // Last 10
      lastRecoveryAction: this.lastRecoveryAction,
    };
  }

  /**
   * Send a message to the worker
   */
  sendToWorker(message: Serializable): boolean {
    return this.workerManager.sendMessage(message);
  }

  /**
   * Check if supervisor is running
   */
  isRunning(): boolean {
    return this.state === 'running';
  }

  /**
   * Force restart the worker
   */
  async restartWorker(): Promise<void> {
    log.info('Manual worker restart requested');
    this.consecutiveCrashes = 0;
    await this.workerManager.restart();
  }

  /**
   * Get the worker manager for direct access
   */
  getWorkerManager(): WorkerManager {
    return this.workerManager;
  }
}

/**
 * Create and start a supervisor instance
 */
export async function createSupervisor(config: SupervisorConfig): Promise<Supervisor> {
  const supervisor = new Supervisor(config);
  await supervisor.start();
  return supervisor;
}
