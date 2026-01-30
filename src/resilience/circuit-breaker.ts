/**
 * Circuit Breaker Implementation
 * Prevents cascading failures by failing fast when a service is unhealthy.
 *
 * States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Circuit tripped, requests fail immediately
 * - HALF_OPEN: Testing if service recovered
 */

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type CircuitBreakerConfig = {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold: number;
  /** Time in ms before attempting recovery (default: 30000) */
  resetTimeoutMs: number;
  /** Number of successful calls in half-open to close circuit (default: 3) */
  successThreshold: number;
  /** Optional name for logging */
  name?: string;
  /** Callback when state changes */
  onStateChange?: (from: CircuitBreakerState, to: CircuitBreakerState, stats: CircuitBreakerStats) => void;
};

export type CircuitBreakerStats = {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  lastFailure: number | null;
  lastSuccess: number | null;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
};

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  successThreshold: 3,
};

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private totalCalls = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  get name(): string {
    return this.config.name ?? 'unnamed';
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailureTime,
      lastSuccess: this.lastSuccessTime,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
    };
  }

  isAllowed(): boolean {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      const timeSinceFailure = this.lastFailureTime
        ? Date.now() - this.lastFailureTime
        : Infinity;

      if (timeSinceFailure >= this.config.resetTimeoutMs) {
        this.transition('HALF_OPEN');
        return true;
      }
      return false;
    }

    // HALF_OPEN: allow one request through to test
    return true;
  }

  recordSuccess(): void {
    this.totalCalls++;
    this.totalSuccesses++;
    this.lastSuccessTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.transition('CLOSED');
      }
    } else if (this.state === 'CLOSED') {
      // Reset consecutive failure count on success
      this.failures = 0;
    }
  }

  recordFailure(_error?: unknown): void {
    this.totalCalls++;
    this.totalFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Single failure in half-open reopens the circuit
      this.transition('OPEN');
    } else if (this.state === 'CLOSED') {
      this.failures++;
      if (this.failures >= this.config.failureThreshold) {
        this.transition('OPEN');
      }
    }
  }

  private transition(newState: CircuitBreakerState): void {
    const oldState = this.state;
    if (oldState === newState) return;

    this.state = newState;

    // Reset counters on state transition
    if (newState === 'CLOSED') {
      this.failures = 0;
      this.successes = 0;
    } else if (newState === 'HALF_OPEN') {
      this.successes = 0;
    } else if (newState === 'OPEN') {
      this.successes = 0;
    }

    this.config.onStateChange?.(oldState, newState, this.getStats());
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.isAllowed()) {
      throw new CircuitBreakerOpenError(this.name, this.getStats());
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  /**
   * Force the circuit to a specific state (for testing/manual override)
   */
  forceState(state: CircuitBreakerState): void {
    this.transition(state);
  }

  /**
   * Reset all counters and return to CLOSED state
   */
  reset(): void {
    this.failures = 0;
    this.successes = 0;
    this.transition('CLOSED');
  }
}

export class CircuitBreakerOpenError extends Error {
  readonly circuitName: string;
  readonly stats: CircuitBreakerStats;

  constructor(circuitName: string, stats: CircuitBreakerStats) {
    super(`Circuit breaker '${circuitName}' is OPEN - failing fast`);
    this.name = 'CircuitBreakerOpenError';
    this.circuitName = circuitName;
    this.stats = stats;
  }
}

/**
 * Global registry of circuit breakers for monitoring
 */
const circuitRegistry = new Map<string, CircuitBreaker>();

export function getOrCreateCircuit(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  let circuit = circuitRegistry.get(name);
  if (!circuit) {
    circuit = new CircuitBreaker({ name, ...config });
    circuitRegistry.set(name, circuit);
  }
  return circuit;
}

export function getAllCircuits(): Map<string, CircuitBreaker> {
  return new Map(circuitRegistry);
}

export function getCircuitStats(): Record<string, CircuitBreakerStats> {
  const stats: Record<string, CircuitBreakerStats> = {};
  for (const [name, circuit] of circuitRegistry) {
    stats[name] = circuit.getStats();
  }
  return stats;
}
