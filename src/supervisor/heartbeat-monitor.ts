/**
 * Heartbeat Monitor
 * Monitors worker process health through periodic heartbeats.
 * Detects hangs and triggers recovery actions.
 */

import { createLogger } from '../logging/logger.js';

const log = createLogger('heartbeat-monitor');

export type HeartbeatConfig = {
  /** Interval between expected heartbeats in ms (default: 5000) */
  intervalMs: number;
  /** Time without heartbeat before considered dead (default: 15000) */
  timeoutMs: number;
  /** Number of missed heartbeats before triggering recovery (default: 3) */
  missedThreshold: number;
  /** Callback when heartbeat received */
  onHeartbeat?: (data: HeartbeatData) => void;
  /** Callback when heartbeat missed */
  onMissed?: (missed: number, lastHeartbeat: number | null) => void;
  /** Callback when worker is considered dead */
  onDead?: (missedCount: number, lastHeartbeat: number | null) => void;
};

export type HeartbeatData = {
  timestamp: number;
  pid: number;
  memory: NodeJS.MemoryUsage;
  uptime: number;
  load?: number[];
  custom?: Record<string, unknown>;
};

export type HeartbeatStats = {
  isAlive: boolean;
  lastHeartbeat: number | null;
  missedCount: number;
  totalReceived: number;
  totalMissed: number;
  averageIntervalMs: number;
  lastData: HeartbeatData | null;
};

const DEFAULT_CONFIG: HeartbeatConfig = {
  intervalMs: 5_000,
  timeoutMs: 15_000,
  missedThreshold: 3,
};

export class HeartbeatMonitor {
  private readonly config: HeartbeatConfig;
  private lastHeartbeat: number | null = null;
  private lastData: HeartbeatData | null = null;
  private missedCount = 0;
  private totalReceived = 0;
  private totalMissed = 0;
  private intervals: number[] = [];
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private isAlive = false;
  private started = false;

  constructor(config: Partial<HeartbeatConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start monitoring heartbeats
   */
  start(): void {
    if (this.started) return;

    this.started = true;
    this.isAlive = true;
    this.missedCount = 0;

    // Start periodic check
    this.checkTimer = setInterval(() => {
      this.checkHeartbeat();
    }, this.config.intervalMs);

    log.info('Heartbeat monitor started', {
      intervalMs: this.config.intervalMs,
      timeoutMs: this.config.timeoutMs,
    });
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.started) return;

    this.started = false;
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    log.info('Heartbeat monitor stopped');
  }

  /**
   * Record a heartbeat from the worker
   */
  recordHeartbeat(data: HeartbeatData): void {
    const now = Date.now();

    // Calculate interval
    if (this.lastHeartbeat !== null) {
      const interval = now - this.lastHeartbeat;
      this.intervals.push(interval);
      // Keep last 100 intervals for averaging
      if (this.intervals.length > 100) {
        this.intervals.shift();
      }
    }

    this.lastHeartbeat = now;
    this.lastData = data;
    this.missedCount = 0;
    this.totalReceived++;
    this.isAlive = true;

    this.config.onHeartbeat?.(data);

    log.debug('Heartbeat received', {
      pid: data.pid,
      uptime: data.uptime,
      memoryMB: Math.round(data.memory.heapUsed / 1024 / 1024),
    });
  }

  private checkHeartbeat(): void {
    if (!this.started) return;

    const now = Date.now();

    if (this.lastHeartbeat === null) {
      // No heartbeat ever received
      this.missedCount++;
      this.totalMissed++;
      log.warn(`No heartbeat received yet (missed: ${this.missedCount})`);
    } else {
      const timeSinceLastHeartbeat = now - this.lastHeartbeat;

      if (timeSinceLastHeartbeat > this.config.timeoutMs) {
        this.missedCount++;
        this.totalMissed++;
        this.isAlive = false;

        log.warn(`Heartbeat missed`, {
          missedCount: this.missedCount,
          timeSinceLastMs: timeSinceLastHeartbeat,
          threshold: this.config.missedThreshold,
        });

        this.config.onMissed?.(this.missedCount, this.lastHeartbeat);

        // Check if worker should be considered dead
        if (this.missedCount >= this.config.missedThreshold) {
          log.error(`Worker appears dead - ${this.missedCount} missed heartbeats`);
          this.config.onDead?.(this.missedCount, this.lastHeartbeat);
        }
      }
    }
  }

  /**
   * Get current monitoring stats
   */
  getStats(): HeartbeatStats {
    const avgInterval = this.intervals.length > 0
      ? this.intervals.reduce((a, b) => a + b, 0) / this.intervals.length
      : 0;

    return {
      isAlive: this.isAlive,
      lastHeartbeat: this.lastHeartbeat,
      missedCount: this.missedCount,
      totalReceived: this.totalReceived,
      totalMissed: this.totalMissed,
      averageIntervalMs: Math.round(avgInterval),
      lastData: this.lastData,
    };
  }

  /**
   * Check if worker is considered alive
   */
  isWorkerAlive(): boolean {
    return this.isAlive;
  }

  /**
   * Reset monitor state (e.g., when worker restarts)
   */
  reset(): void {
    this.lastHeartbeat = null;
    this.lastData = null;
    this.missedCount = 0;
    this.intervals = [];
    this.isAlive = false;
  }
}

/**
 * Create heartbeat data from current process
 */
export function createHeartbeatData(custom?: Record<string, unknown>): HeartbeatData {
  return {
    timestamp: Date.now(),
    pid: process.pid,
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    load: typeof process.cpuUsage === 'function' ? undefined : undefined,
    custom,
  };
}

/**
 * Heartbeat sender for worker processes
 */
export class HeartbeatSender {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly sendFn: (data: HeartbeatData) => void;
  private customDataFn?: () => Record<string, unknown>;

  constructor(
    sendFn: (data: HeartbeatData) => void,
    intervalMs: number = 5000,
  ) {
    this.sendFn = sendFn;
    this.intervalMs = intervalMs;
  }

  /**
   * Start sending heartbeats
   */
  start(customDataFn?: () => Record<string, unknown>): void {
    if (this.intervalId) return;

    this.customDataFn = customDataFn;

    // Send immediately
    this.sendHeartbeat();

    // Then on interval
    this.intervalId = setInterval(() => {
      this.sendHeartbeat();
    }, this.intervalMs);

    log.debug('Heartbeat sender started', { intervalMs: this.intervalMs });
  }

  /**
   * Stop sending heartbeats
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    log.debug('Heartbeat sender stopped');
  }

  private sendHeartbeat(): void {
    try {
      const data = createHeartbeatData(this.customDataFn?.());
      this.sendFn(data);
    } catch (error) {
      log.error(`Failed to send heartbeat: ${String(error)}`);
    }
  }

  /**
   * Send an immediate heartbeat (e.g., on important events)
   */
  sendNow(): void {
    this.sendHeartbeat();
  }
}
