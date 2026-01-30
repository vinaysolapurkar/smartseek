/**
 * Metrics Collector
 * Collects and exposes metrics for Prometheus monitoring.
 */

export type MetricType = 'counter' | 'gauge' | 'histogram';

export type MetricValue = {
  name: string;
  type: MetricType;
  help: string;
  value: number;
  labels?: Record<string, string>;
  timestamp?: number;
};

export type HistogramBuckets = {
  le: number;
  count: number;
}[];

export type HistogramValue = {
  name: string;
  type: 'histogram';
  help: string;
  buckets: HistogramBuckets;
  sum: number;
  count: number;
  labels?: Record<string, string>;
};

/**
 * Simple metrics collector (doesn't require prom-client)
 */
export class MetricsCollector {
  private readonly counters = new Map<string, { value: number; help: string; labels?: Record<string, string> }>();
  private readonly gauges = new Map<string, { value: number; help: string; labels?: Record<string, string> }>();
  private readonly histograms = new Map<string, {
    help: string;
    buckets: number[];
    values: number[];
    sum: number;
    count: number;
    labels?: Record<string, string>;
  }>();

  constructor() {
    // Register default metrics
    this.registerDefaultMetrics();
  }

  private registerDefaultMetrics(): void {
    // Process metrics
    this.createGauge('process_uptime_seconds', 'Process uptime in seconds');
    this.createGauge('process_heap_bytes', 'Process heap size in bytes');
    this.createGauge('process_heap_used_bytes', 'Process heap used in bytes');
    this.createGauge('process_external_bytes', 'Process external memory in bytes');
    this.createGauge('process_resident_memory_bytes', 'Process resident memory in bytes');

    // Gateway metrics
    this.createCounter('gateway_requests_total', 'Total gateway requests');
    this.createCounter('gateway_errors_total', 'Total gateway errors');
    this.createGauge('gateway_active_connections', 'Current active connections');
    this.createGauge('gateway_queue_size', 'Current command queue size');

    // Worker metrics
    this.createCounter('worker_restarts_total', 'Total worker restarts');
    this.createCounter('worker_crashes_total', 'Total worker crashes');
    this.createGauge('worker_uptime_seconds', 'Worker uptime in seconds');
    this.createCounter('worker_heartbeats_total', 'Total heartbeats received');
    this.createCounter('worker_heartbeats_missed_total', 'Total heartbeats missed');

    // Circuit breaker metrics
    this.createGauge('circuit_breaker_state', 'Circuit breaker state (0=closed, 1=half-open, 2=open)');
    this.createCounter('circuit_breaker_trips_total', 'Total circuit breaker trips');
  }

  /**
   * Create a counter metric
   */
  createCounter(name: string, help: string, labels?: Record<string, string>): void {
    if (!this.counters.has(name)) {
      this.counters.set(name, { value: 0, help, labels });
    }
  }

  /**
   * Increment a counter
   */
  incrementCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    const counter = this.counters.get(key);
    if (counter) {
      counter.value += value;
    } else {
      this.counters.set(key, { value, help: '', labels });
    }
  }

  /**
   * Create a gauge metric
   */
  createGauge(name: string, help: string, labels?: Record<string, string>): void {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, { value: 0, help, labels });
    }
  }

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    const gauge = this.gauges.get(key);
    if (gauge) {
      gauge.value = value;
    } else {
      this.gauges.set(key, { value, help: '', labels });
    }
  }

  /**
   * Increment a gauge
   */
  incrementGauge(name: string, value: number = 1, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    const gauge = this.gauges.get(key);
    if (gauge) {
      gauge.value += value;
    } else {
      this.gauges.set(key, { value, help: '', labels });
    }
  }

  /**
   * Decrement a gauge
   */
  decrementGauge(name: string, value: number = 1, labels?: Record<string, string>): void {
    this.incrementGauge(name, -value, labels);
  }

  /**
   * Create a histogram metric
   */
  createHistogram(
    name: string,
    help: string,
    buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    labels?: Record<string, string>,
  ): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, {
        help,
        buckets: [...buckets].sort((a, b) => a - b),
        values: new Array(buckets.length).fill(0),
        sum: 0,
        count: 0,
        labels,
      });
    }
  }

  /**
   * Observe a value in a histogram
   */
  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.buildKey(name, labels);
    const histogram = this.histograms.get(key);
    if (histogram) {
      histogram.sum += value;
      histogram.count += 1;
      for (let i = 0; i < histogram.buckets.length; i++) {
        if (value <= histogram.buckets[i]) {
          histogram.values[i] += 1;
        }
      }
    }
  }

  /**
   * Timer for histogram observations
   */
  startTimer(name: string, labels?: Record<string, string>): () => void {
    const start = process.hrtime.bigint();
    return () => {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1e9; // Convert to seconds
      this.observeHistogram(name, duration, labels);
    };
  }

  private buildKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  /**
   * Update default process metrics
   */
  updateProcessMetrics(): void {
    const memory = process.memoryUsage();
    this.setGauge('process_uptime_seconds', process.uptime());
    this.setGauge('process_heap_bytes', memory.heapTotal);
    this.setGauge('process_heap_used_bytes', memory.heapUsed);
    this.setGauge('process_external_bytes', memory.external);
    this.setGauge('process_resident_memory_bytes', memory.rss);
  }

  /**
   * Get all metrics in Prometheus format
   */
  async getPrometheusMetrics(): Promise<string> {
    this.updateProcessMetrics();

    const lines: string[] = [];

    // Counters
    for (const [name, counter] of this.counters) {
      const baseName = name.split('{')[0];
      if (counter.help) {
        lines.push(`# HELP ${baseName} ${counter.help}`);
        lines.push(`# TYPE ${baseName} counter`);
      }
      lines.push(`${name} ${counter.value}`);
    }

    // Gauges
    for (const [name, gauge] of this.gauges) {
      const baseName = name.split('{')[0];
      if (gauge.help) {
        lines.push(`# HELP ${baseName} ${gauge.help}`);
        lines.push(`# TYPE ${baseName} gauge`);
      }
      lines.push(`${name} ${gauge.value}`);
    }

    // Histograms
    for (const [name, histogram] of this.histograms) {
      if (histogram.help) {
        lines.push(`# HELP ${name} ${histogram.help}`);
        lines.push(`# TYPE ${name} histogram`);
      }

      let cumulative = 0;
      for (let i = 0; i < histogram.buckets.length; i++) {
        cumulative += histogram.values[i];
        lines.push(`${name}_bucket{le="${histogram.buckets[i]}"} ${cumulative}`);
      }
      lines.push(`${name}_bucket{le="+Inf"} ${histogram.count}`);
      lines.push(`${name}_sum ${histogram.sum}`);
      lines.push(`${name}_count ${histogram.count}`);
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Get all metrics as a plain object
   */
  getStats(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, { sum: number; count: number; avg: number }>;
  } {
    this.updateProcessMetrics();

    const counters: Record<string, number> = {};
    for (const [name, counter] of this.counters) {
      counters[name] = counter.value;
    }

    const gauges: Record<string, number> = {};
    for (const [name, gauge] of this.gauges) {
      gauges[name] = gauge.value;
    }

    const histograms: Record<string, { sum: number; count: number; avg: number }> = {};
    for (const [name, histogram] of this.histograms) {
      histograms[name] = {
        sum: histogram.sum,
        count: histogram.count,
        avg: histogram.count > 0 ? histogram.sum / histogram.count : 0,
      };
    }

    return { counters, gauges, histograms };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    for (const counter of this.counters.values()) {
      counter.value = 0;
    }
    for (const gauge of this.gauges.values()) {
      gauge.value = 0;
    }
    for (const histogram of this.histograms.values()) {
      histogram.values.fill(0);
      histogram.sum = 0;
      histogram.count = 0;
    }
  }
}

// Singleton instance
let globalMetrics: MetricsCollector | null = null;

export function getMetricsCollector(): MetricsCollector {
  if (!globalMetrics) {
    globalMetrics = new MetricsCollector();
  }
  return globalMetrics;
}

export function resetMetricsCollector(): void {
  globalMetrics = null;
}
