/**
 * Enhanced Retry with Circuit Breaker Integration
 * Combines exponential backoff retry with circuit breaker protection.
 */

import { CircuitBreaker, CircuitBreakerOpenError, type CircuitBreakerConfig } from './circuit-breaker.js';
import { withTimeout, TimeoutError } from './timeout-wrapper.js';

export type RetryConfig = {
  /** Maximum number of attempts (default: 3) */
  maxAttempts: number;
  /** Initial delay in ms (default: 300) */
  initialDelayMs: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelayMs: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number;
  /** Jitter factor 0-1 (default: 0.1) */
  jitter: number;
  /** Function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Callback on each retry */
  onRetry?: (info: RetryInfo) => void;
};

export type RetryInfo = {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: unknown;
  elapsedMs: number;
};

export type ResilientCallConfig = {
  /** Name for logging/circuit breaker */
  name: string;
  /** Retry configuration */
  retry?: Partial<RetryConfig>;
  /** Circuit breaker configuration (null to disable) */
  circuitBreaker?: Partial<CircuitBreakerConfig> | null;
  /** Timeout in ms (null to disable) */
  timeoutMs?: number | null;
  /** Callback when operation succeeds */
  onSuccess?: (elapsedMs: number) => void;
  /** Callback when operation fails after all retries */
  onFailure?: (error: unknown, attempts: number, elapsedMs: number) => void;
};

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 300,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
  jitter: 0.1,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function applyJitter(delayMs: number, jitter: number): number {
  if (jitter <= 0) return delayMs;
  const offset = (Math.random() * 2 - 1) * jitter;
  return Math.max(0, Math.round(delayMs * (1 + offset)));
}

function isDefaultRetryable(error: unknown): boolean {
  // Don't retry timeouts or circuit breaker opens
  if (error instanceof TimeoutError) return false;
  if (error instanceof CircuitBreakerOpenError) return false;

  // Don't retry validation/auth errors
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('unauthorized') || msg.includes('forbidden')) return false;
    if (msg.includes('invalid') || msg.includes('validation')) return false;
    if (msg.includes('not found') || msg.includes('404')) return false;
  }

  return true;
}

/**
 * Retry an async operation with exponential backoff
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>,
): Promise<T> {
  const opts: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const isRetryable = opts.isRetryable ?? isDefaultRetryable;
  const startTime = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt >= opts.maxAttempts;
      const shouldRetry = !isLastAttempt && isRetryable(error);

      if (!shouldRetry) {
        throw error;
      }

      // Calculate delay with exponential backoff
      let delayMs = opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1);
      delayMs = Math.min(delayMs, opts.maxDelayMs);
      delayMs = applyJitter(delayMs, opts.jitter);

      opts.onRetry?.({
        attempt,
        maxAttempts: opts.maxAttempts,
        delayMs,
        error,
        elapsedMs: Date.now() - startTime,
      });

      await sleep(delayMs);
    }
  }

  throw lastError;
}

// Circuit breaker cache for resilient calls
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Make a resilient async call with retry, circuit breaker, and timeout
 */
export async function resilientCall<T>(
  fn: () => Promise<T>,
  config: ResilientCallConfig,
): Promise<T> {
  const startTime = Date.now();

  // Get or create circuit breaker
  let circuitBreaker: CircuitBreaker | null = null;
  if (config.circuitBreaker !== null) {
    circuitBreaker = circuitBreakers.get(config.name) ?? null;
    if (!circuitBreaker) {
      circuitBreaker = new CircuitBreaker({
        name: config.name,
        ...config.circuitBreaker,
      });
      circuitBreakers.set(config.name, circuitBreaker);
    }

    // Check if circuit is open
    if (!circuitBreaker.isAllowed()) {
      throw new CircuitBreakerOpenError(config.name, circuitBreaker.getStats());
    }
  }

  const retryConfig: Partial<RetryConfig> = {
    ...config.retry,
    onRetry: (info) => {
      config.retry?.onRetry?.(info);
    },
  };

  try {
    const result = await retryAsync(async () => {
      // Apply timeout if configured
      if (config.timeoutMs != null) {
        return await withTimeout(fn(), {
          timeoutMs: config.timeoutMs,
          name: config.name,
        });
      }
      return fn();
    }, retryConfig);

    // Record success
    circuitBreaker?.recordSuccess();
    config.onSuccess?.(Date.now() - startTime);

    return result;
  } catch (error) {
    // Record failure in circuit breaker (unless it's already open)
    if (!(error instanceof CircuitBreakerOpenError)) {
      circuitBreaker?.recordFailure(error);
    }

    config.onFailure?.(
      error,
      config.retry?.maxAttempts ?? DEFAULT_RETRY_CONFIG.maxAttempts,
      Date.now() - startTime,
    );

    throw error;
  }
}

/**
 * Create a resilient wrapper for a function
 */
export function createResilientFunction<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  config: ResilientCallConfig,
): (...args: Args) => Promise<R> {
  return async (...args: Args): Promise<R> => {
    return resilientCall(() => fn(...args), config);
  };
}

/**
 * Execute with fallback on failure
 */
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  config?: ResilientCallConfig,
): Promise<T> {
  try {
    if (config) {
      return await resilientCall(primary, config);
    }
    return await primary();
  } catch {
    return fallback();
  }
}

/**
 * Execute with cached fallback
 */
export function createCachedFallback<T>(
  fn: () => Promise<T>,
  config: ResilientCallConfig & { cacheTtlMs?: number },
): () => Promise<T> {
  let cachedValue: T | undefined;
  let cacheExpiry = 0;
  const cacheTtlMs = config.cacheTtlMs ?? 60_000;

  return async (): Promise<T> => {
    try {
      const result = await resilientCall(fn, config);
      cachedValue = result;
      cacheExpiry = Date.now() + cacheTtlMs;
      return result;
    } catch (error) {
      // Return cached value if available and not expired
      if (cachedValue !== undefined && Date.now() < cacheExpiry) {
        return cachedValue;
      }
      throw error;
    }
  };
}

/**
 * Get all circuit breaker states for monitoring
 */
export function getCircuitBreakerStates(): Map<string, ReturnType<CircuitBreaker['getStats']>> {
  const states = new Map<string, ReturnType<CircuitBreaker['getStats']>>();
  for (const [name, cb] of circuitBreakers) {
    states.set(name, cb.getStats());
  }
  return states;
}

/**
 * Reset a specific circuit breaker
 */
export function resetCircuitBreaker(name: string): boolean {
  const cb = circuitBreakers.get(name);
  if (cb) {
    cb.reset();
    return true;
  }
  return false;
}

/**
 * Reset all circuit breakers
 */
export function resetAllCircuitBreakers(): void {
  for (const cb of circuitBreakers.values()) {
    cb.reset();
  }
}
