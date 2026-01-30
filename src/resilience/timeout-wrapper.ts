/**
 * Universal Timeout Wrapper
 * Ensures no operation can hang indefinitely.
 * Wraps any Promise with a timeout guarantee.
 */

export type TimeoutConfig = {
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Optional name for error messages */
  name?: string;
  /** Callback when timeout occurs */
  onTimeout?: (name: string, timeoutMs: number) => void;
  /** Whether to attempt cleanup on timeout */
  cleanup?: () => void | Promise<void>;
};

export class TimeoutError extends Error {
  readonly operationName: string;
  readonly timeoutMs: number;
  readonly startedAt: number;

  constructor(name: string, timeoutMs: number, startedAt: number) {
    super(`Operation '${name}' timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.operationName = name;
    this.timeoutMs = timeoutMs;
    this.startedAt = startedAt;
  }
}

/**
 * Wrap a promise with a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  config: TimeoutConfig | number,
): Promise<T> {
  const opts: TimeoutConfig = typeof config === 'number'
    ? { timeoutMs: config }
    : config;

  const { timeoutMs, name = 'unknown', onTimeout, cleanup } = opts;
  const startedAt = Date.now();

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let resolved = false;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      if (!resolved) {
        onTimeout?.(name, timeoutMs);

        // Attempt cleanup in the background
        if (cleanup) {
          Promise.resolve(cleanup()).catch(() => {
            // Ignore cleanup errors
          });
        }

        reject(new TimeoutError(name, timeoutMs, startedAt));
      }
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    resolved = true;
    return result;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Create a reusable timeout wrapper with preset configuration
 */
export function createTimeoutWrapper(defaultConfig: TimeoutConfig) {
  return async function <T>(
    promise: Promise<T>,
    overrides?: Partial<TimeoutConfig>,
  ): Promise<T> {
    return withTimeout(promise, { ...defaultConfig, ...overrides });
  };
}

/**
 * Wrap a function to always execute with timeout
 */
export function timeoutify<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  config: TimeoutConfig,
): (...args: Args) => Promise<R> {
  return async (...args: Args): Promise<R> => {
    return withTimeout(fn(...args), config);
  };
}

/**
 * Common timeout presets
 */
export const TimeoutPresets = {
  /** Quick operations like health checks: 5s */
  QUICK: 5_000,
  /** Standard API calls: 30s */
  STANDARD: 30_000,
  /** Long-running tasks: 60s */
  TASK: 60_000,
  /** Very long operations like AI completions: 120s */
  AI_COMPLETION: 120_000,
  /** Startup/shutdown operations: 30s */
  LIFECYCLE: 30_000,
} as const;

/**
 * Decorator-style timeout for class methods
 * Usage: @Timeout({ timeoutMs: 5000 })
 */
export function Timeout(config: TimeoutConfig) {
  return function <T extends (...args: unknown[]) => Promise<unknown>>(
    _target: unknown,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>,
  ): TypedPropertyDescriptor<T> {
    const originalMethod = descriptor.value;
    if (!originalMethod) return descriptor;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      return withTimeout(
        originalMethod.apply(this, args) as Promise<unknown>,
        { ...config, name: config.name ?? propertyKey },
      );
    } as T;

    return descriptor;
  };
}

/**
 * Execute with deadline (absolute time instead of duration)
 */
export async function withDeadline<T>(
  promise: Promise<T>,
  deadline: Date | number,
  name?: string,
): Promise<T> {
  const deadlineMs = deadline instanceof Date ? deadline.getTime() : deadline;
  const now = Date.now();
  const timeoutMs = Math.max(0, deadlineMs - now);

  return withTimeout(promise, { timeoutMs, name });
}

/**
 * Race multiple promises with timeout, return first success
 */
export async function raceWithTimeout<T>(
  promises: Promise<T>[],
  config: TimeoutConfig,
): Promise<T> {
  return withTimeout(
    Promise.race(promises),
    config,
  );
}

/**
 * Execute all promises with shared timeout
 */
export async function allWithTimeout<T>(
  promises: Promise<T>[],
  config: TimeoutConfig,
): Promise<T[]> {
  return withTimeout(
    Promise.all(promises),
    config,
  );
}
