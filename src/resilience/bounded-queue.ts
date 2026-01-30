/**
 * Bounded Queue with Backpressure
 * Prevents unbounded memory growth by limiting queue size.
 * Supports multiple overflow strategies.
 */

export type OverflowStrategy = 'reject' | 'drop-oldest' | 'drop-newest';

export type BoundedQueueConfig<T> = {
  /** Maximum number of items in queue */
  maxSize: number;
  /** What to do when queue is full (default: 'reject') */
  overflowStrategy: OverflowStrategy;
  /** Optional name for logging */
  name?: string;
  /** Callback when item is dropped due to overflow */
  onDrop?: (item: T, reason: 'overflow-oldest' | 'overflow-newest') => void;
  /** Callback when queue reaches high water mark (80% full) */
  onHighWaterMark?: (size: number, maxSize: number) => void;
  /** Callback when queue drops below low water mark (20% full) */
  onLowWaterMark?: (size: number, maxSize: number) => void;
};

export type QueueStats = {
  size: number;
  maxSize: number;
  totalEnqueued: number;
  totalDequeued: number;
  totalDropped: number;
  totalRejected: number;
  highWaterMarkHits: number;
};

export class QueueFullError extends Error {
  readonly queueName: string;
  readonly currentSize: number;
  readonly maxSize: number;

  constructor(queueName: string, currentSize: number, maxSize: number) {
    super(`Queue '${queueName}' is full (${currentSize}/${maxSize})`);
    this.name = 'QueueFullError';
    this.queueName = queueName;
    this.currentSize = currentSize;
    this.maxSize = maxSize;
  }
}

export class BoundedQueue<T> {
  private readonly queue: T[] = [];
  private readonly config: BoundedQueueConfig<T>;
  private totalEnqueued = 0;
  private totalDequeued = 0;
  private totalDropped = 0;
  private totalRejected = 0;
  private highWaterMarkHits = 0;
  private wasAboveHighWaterMark = false;

  constructor(config: Partial<BoundedQueueConfig<T>> & { maxSize: number }) {
    this.config = {
      overflowStrategy: 'reject',
      ...config,
    };
  }

  get name(): string {
    return this.config.name ?? 'unnamed';
  }

  get size(): number {
    return this.queue.length;
  }

  get maxSize(): number {
    return this.config.maxSize;
  }

  get isEmpty(): boolean {
    return this.queue.length === 0;
  }

  get isFull(): boolean {
    return this.queue.length >= this.config.maxSize;
  }

  getStats(): QueueStats {
    return {
      size: this.queue.length,
      maxSize: this.config.maxSize,
      totalEnqueued: this.totalEnqueued,
      totalDequeued: this.totalDequeued,
      totalDropped: this.totalDropped,
      totalRejected: this.totalRejected,
      highWaterMarkHits: this.highWaterMarkHits,
    };
  }

  /**
   * Add item to queue, handling overflow according to strategy
   * @returns true if item was added, false if rejected/dropped
   */
  enqueue(item: T): boolean {
    const highWaterMark = Math.floor(this.config.maxSize * 0.8);
    const lowWaterMark = Math.floor(this.config.maxSize * 0.2);

    if (this.queue.length >= this.config.maxSize) {
      switch (this.config.overflowStrategy) {
        case 'reject':
          this.totalRejected++;
          throw new QueueFullError(this.name, this.queue.length, this.config.maxSize);

        case 'drop-oldest': {
          const dropped = this.queue.shift();
          if (dropped !== undefined) {
            this.totalDropped++;
            this.config.onDrop?.(dropped, 'overflow-oldest');
          }
          break;
        }

        case 'drop-newest':
          // Don't add the new item
          this.totalDropped++;
          this.config.onDrop?.(item, 'overflow-newest');
          return false;
      }
    }

    this.queue.push(item);
    this.totalEnqueued++;

    // Check high water mark
    if (this.queue.length >= highWaterMark && !this.wasAboveHighWaterMark) {
      this.wasAboveHighWaterMark = true;
      this.highWaterMarkHits++;
      this.config.onHighWaterMark?.(this.queue.length, this.config.maxSize);
    }

    // Check low water mark
    if (this.queue.length < lowWaterMark && this.wasAboveHighWaterMark) {
      this.wasAboveHighWaterMark = false;
      this.config.onLowWaterMark?.(this.queue.length, this.config.maxSize);
    }

    return true;
  }

  /**
   * Remove and return the oldest item from queue
   */
  dequeue(): T | undefined {
    const item = this.queue.shift();
    if (item !== undefined) {
      this.totalDequeued++;

      // Check low water mark
      const lowWaterMark = Math.floor(this.config.maxSize * 0.2);
      if (this.queue.length < lowWaterMark && this.wasAboveHighWaterMark) {
        this.wasAboveHighWaterMark = false;
        this.config.onLowWaterMark?.(this.queue.length, this.config.maxSize);
      }
    }
    return item;
  }

  /**
   * Peek at the oldest item without removing it
   */
  peek(): T | undefined {
    return this.queue[0];
  }

  /**
   * Remove all items from queue
   */
  clear(): T[] {
    const items = [...this.queue];
    this.queue.length = 0;
    this.wasAboveHighWaterMark = false;
    return items;
  }

  /**
   * Iterate over items without removing them
   */
  *[Symbol.iterator](): Iterator<T> {
    for (const item of this.queue) {
      yield item;
    }
  }

  /**
   * Convert to array (creates a copy)
   */
  toArray(): T[] {
    return [...this.queue];
  }

  /**
   * Try to enqueue without throwing (returns success boolean)
   */
  tryEnqueue(item: T): boolean {
    try {
      return this.enqueue(item);
    } catch {
      return false;
    }
  }
}

/**
 * Bounded async queue with blocking dequeue
 */
export class AsyncBoundedQueue<T> extends BoundedQueue<T> {
  private waiters: Array<(item: T) => void> = [];

  override enqueue(item: T): boolean {
    // If there are waiters, give directly to them instead of queuing
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(item);
      return true;
    }

    return super.enqueue(item);
  }

  /**
   * Wait for an item to be available (with optional timeout)
   */
  async dequeueAsync(timeoutMs?: number): Promise<T | undefined> {
    // First try to get from queue
    const item = this.dequeue();
    if (item !== undefined) {
      return item;
    }

    // Wait for next item
    return new Promise((resolve, _reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const waiter = (item: T) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(item);
      };

      this.waiters.push(waiter);

      if (timeoutMs !== undefined) {
        timeoutId = setTimeout(() => {
          const idx = this.waiters.indexOf(waiter);
          if (idx !== -1) {
            this.waiters.splice(idx, 1);
          }
          resolve(undefined);
        }, timeoutMs);
      }
    });
  }

  /**
   * Number of consumers waiting for items
   */
  get waitingConsumers(): number {
    return this.waiters.length;
  }
}

/**
 * Priority bounded queue - items with lower priority numbers are dequeued first
 */
export class PriorityBoundedQueue<T> extends BoundedQueue<{ item: T; priority: number }> {
  enqueuePriority(item: T, priority: number): boolean {
    const result = super.enqueue({ item, priority });

    // Sort by priority after insertion (lower = higher priority)
    if (result) {
      const queue = this.toArray();
      queue.sort((a, b) => a.priority - b.priority);
      this.clear();
      for (const entry of queue) {
        super.tryEnqueue(entry);
      }
    }

    return result;
  }

  dequeueItem(): T | undefined {
    const entry = this.dequeue();
    return entry?.item;
  }

  peekItem(): T | undefined {
    const entry = this.peek();
    return entry?.item;
  }
}
