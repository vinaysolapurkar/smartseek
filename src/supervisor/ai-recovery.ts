/**
 * AI-Powered Recovery Decisions
 * Uses heuristics and optionally AI to make intelligent recovery decisions
 * when workers fail, hang, or crash.
 */

import { createLogger } from '../logging/logger.js';

const log = createLogger('ai-recovery');

export type RecoveryAction = 'restart' | 'wait' | 'escalate' | 'give-up';

export type RecoveryDecision = {
  action: RecoveryAction;
  reason: string;
  confidence: number; // 0-1
  waitMs?: number;
  metadata?: Record<string, unknown>;
  timestamp: number;
};

export type RecoveryContext = {
  reason: 'crash' | 'hang' | 'max-restarts';
  context: Record<string, unknown>;
  stats: {
    state: string;
    worker: {
      state: string;
      restartCount: number;
      uptime: number;
      heartbeat: {
        isAlive: boolean;
        missedCount: number;
        totalReceived: number;
      };
    };
  };
  consecutiveCrashes: number;
};

export type AIRecoveryConfig = {
  /** Enable AI recovery decisions (default: true) */
  enabled: boolean;
  /** API key for AI service (optional, uses heuristics if not set) */
  apiKey?: string;
  /** Maximum wait time before escalating (default: 5 minutes) */
  maxWaitMs: number;
  /** Confidence threshold for automatic action (default: 0.7) */
  confidenceThreshold: number;
  /** History of recent failures for pattern detection */
  historySize: number;
};

const DEFAULT_CONFIG: AIRecoveryConfig = {
  enabled: true,
  maxWaitMs: 5 * 60 * 1000, // 5 minutes
  confidenceThreshold: 0.7,
  historySize: 50,
};

type FailureRecord = {
  timestamp: number;
  reason: 'crash' | 'hang' | 'max-restarts';
  uptime: number;
  decision: RecoveryDecision;
};

export class AIRecovery {
  private readonly config: AIRecoveryConfig;
  private readonly history: FailureRecord[] = [];

  constructor(config: Partial<AIRecoveryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Make a recovery decision based on context
   */
  async decide(context: RecoveryContext): Promise<RecoveryDecision> {
    log.debug('Making recovery decision', { reason: context.reason });

    // First try heuristic-based decision
    const heuristicDecision = this.makeHeuristicDecision(context);

    // If AI is enabled and we have an API key, enhance with AI
    if (this.config.enabled && this.config.apiKey) {
      try {
        const aiDecision = await this.makeAIDecision(context, heuristicDecision);
        this.recordDecision(context, aiDecision);
        return aiDecision;
      } catch (error) {
        log.warn(`AI decision failed, using heuristics: ${String(error)}`);
      }
    }

    this.recordDecision(context, heuristicDecision);
    return heuristicDecision;
  }

  private makeHeuristicDecision(context: RecoveryContext): RecoveryDecision {
    const { reason, consecutiveCrashes, stats } = context;
    const uptime = stats.worker.uptime;
    const restartCount = stats.worker.restartCount;

    // Pattern detection from history
    const recentFailures = this.getRecentFailures(5 * 60 * 1000); // Last 5 minutes
    const failureRate = recentFailures.length;
    const isRapidFailure = failureRate >= 3;
    const isBootLoop = recentFailures.filter(f => f.uptime < 10000).length >= 3;

    log.debug('Heuristic analysis', {
      reason,
      consecutiveCrashes,
      uptime,
      restartCount,
      failureRate,
      isRapidFailure,
      isBootLoop,
    });

    // Decision logic

    // Boot loop detected - escalate
    if (isBootLoop) {
      return {
        action: 'escalate',
        reason: 'Boot loop detected - worker failing within 10s repeatedly',
        confidence: 0.9,
        timestamp: Date.now(),
        metadata: { isBootLoop: true, recentFailures: recentFailures.length },
      };
    }

    // Too many rapid failures - wait with backoff
    if (isRapidFailure) {
      const waitMs = Math.min(
        30_000 * Math.pow(2, Math.min(consecutiveCrashes, 5)),
        this.config.maxWaitMs,
      );
      return {
        action: 'wait',
        reason: 'Rapid failures detected - waiting with exponential backoff',
        confidence: 0.8,
        waitMs,
        timestamp: Date.now(),
        metadata: { failureRate, consecutiveCrashes },
      };
    }

    // Hang detected - restart immediately (likely a deadlock)
    if (reason === 'hang') {
      return {
        action: 'restart',
        reason: 'Worker hung - likely deadlock, immediate restart',
        confidence: 0.85,
        timestamp: Date.now(),
        metadata: { missedHeartbeats: stats.worker.heartbeat.missedCount },
      };
    }

    // Max restarts hit - escalate
    if (reason === 'max-restarts') {
      return {
        action: 'escalate',
        reason: 'Maximum restart attempts exceeded',
        confidence: 0.95,
        timestamp: Date.now(),
        metadata: { restartCount },
      };
    }

    // Worker ran for a while then crashed - likely recoverable
    if (uptime > 60_000) { // Ran for more than 1 minute
      return {
        action: 'restart',
        reason: 'Worker was stable before crash - likely transient error',
        confidence: 0.75,
        timestamp: Date.now(),
        metadata: { uptime },
      };
    }

    // First few crashes - try restart with short wait
    if (consecutiveCrashes <= 3) {
      return {
        action: 'restart',
        reason: `Early crash (${consecutiveCrashes}/3) - attempting recovery`,
        confidence: 0.7,
        waitMs: 1000 * consecutiveCrashes,
        timestamp: Date.now(),
        metadata: { consecutiveCrashes },
      };
    }

    // Many crashes but not rapid - wait longer
    if (consecutiveCrashes <= 7) {
      const waitMs = Math.min(10_000 * consecutiveCrashes, this.config.maxWaitMs);
      return {
        action: 'wait',
        reason: 'Multiple crashes - waiting before next attempt',
        confidence: 0.65,
        waitMs,
        timestamp: Date.now(),
        metadata: { consecutiveCrashes },
      };
    }

    // Too many consecutive crashes - give up
    return {
      action: 'give-up',
      reason: 'Too many consecutive crashes - stopping recovery attempts',
      confidence: 0.8,
      timestamp: Date.now(),
      metadata: { consecutiveCrashes },
    };
  }

  private async makeAIDecision(
    _context: RecoveryContext,
    heuristicDecision: RecoveryDecision,
  ): Promise<RecoveryDecision> {
    // In a real implementation, this would call an AI service
    // For now, just enhance the heuristic decision
    // TODO: Implement actual AI call when API key is available

    log.debug('AI enhancement not implemented, using heuristics');
    return {
      ...heuristicDecision,
      metadata: {
        ...heuristicDecision.metadata,
        aiEnhanced: false,
      },
    };
  }

  private recordDecision(context: RecoveryContext, decision: RecoveryDecision): void {
    const record: FailureRecord = {
      timestamp: Date.now(),
      reason: context.reason,
      uptime: context.stats.worker.uptime,
      decision,
    };

    this.history.push(record);

    // Trim history
    while (this.history.length > this.config.historySize) {
      this.history.shift();
    }
  }

  private getRecentFailures(windowMs: number): FailureRecord[] {
    const cutoff = Date.now() - windowMs;
    return this.history.filter(f => f.timestamp >= cutoff);
  }

  /**
   * Get failure history for analysis
   */
  getHistory(): FailureRecord[] {
    return [...this.history];
  }

  /**
   * Clear failure history
   */
  clearHistory(): void {
    this.history.length = 0;
  }

  /**
   * Analyze patterns in recent failures
   */
  analyzePatterns(): {
    isStable: boolean;
    failureRate: number; // per minute
    averageUptime: number;
    mostCommonReason: string | null;
    recommendation: string;
  } {
    if (this.history.length === 0) {
      return {
        isStable: true,
        failureRate: 0,
        averageUptime: 0,
        mostCommonReason: null,
        recommendation: 'System is stable - no recent failures',
      };
    }

    const recentWindow = 10 * 60 * 1000; // 10 minutes
    const recent = this.getRecentFailures(recentWindow);

    const failureRate = (recent.length / (recentWindow / 60000));
    const averageUptime = recent.length > 0
      ? recent.reduce((sum, f) => sum + f.uptime, 0) / recent.length
      : 0;

    const reasonCounts = new Map<string, number>();
    for (const f of recent) {
      reasonCounts.set(f.reason, (reasonCounts.get(f.reason) ?? 0) + 1);
    }

    let mostCommonReason: string | null = null;
    let maxCount = 0;
    for (const [reason, count] of reasonCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonReason = reason;
      }
    }

    const isStable = failureRate < 0.5 && averageUptime > 60000;

    let recommendation: string;
    if (isStable) {
      recommendation = 'System is relatively stable';
    } else if (mostCommonReason === 'hang') {
      recommendation = 'Consider investigating deadlocks or long-running operations';
    } else if (averageUptime < 10000) {
      recommendation = 'Workers are crashing during startup - check configuration';
    } else {
      recommendation = 'Investigate root cause of frequent crashes';
    }

    return {
      isStable,
      failureRate,
      averageUptime,
      mostCommonReason,
      recommendation,
    };
  }
}
