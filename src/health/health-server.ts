/**
 * Health Check HTTP Server
 * Provides health endpoints for monitoring and load balancers.
 * Runs on port 18790 by default.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { createLogger } from '../logging/logger.js';
import { MetricsCollector, getMetricsCollector } from './metrics-collector.js';
import type { GatewayHealth } from '../wrappers/gateway-wrapper.js';
import type { SupervisorStats } from '../supervisor/supervisor.js';

const log = createLogger('health-server');

export type HealthServerConfig = {
  /** Port to listen on (default: 18790) */
  port: number;
  /** Host to bind to (default: '127.0.0.1') */
  host: string;
  /** Enable Prometheus metrics endpoint (default: true) */
  prometheusEnabled: boolean;
  /** Health check function */
  getHealth: () => Promise<GatewayHealth>;
  /** Supervisor stats function (optional) */
  getSupervisorStats?: () => SupervisorStats;
};

const DEFAULT_CONFIG: Omit<HealthServerConfig, 'getHealth'> = {
  port: 18790,
  host: '127.0.0.1',
  prometheusEnabled: true,
};

export type HealthResponse = {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: Record<string, unknown>;
  details?: unknown;
};

export class HealthServer {
  private readonly config: HealthServerConfig;
  private server: Server | null = null;
  private readonly metrics: MetricsCollector;

  constructor(config: Partial<HealthServerConfig> & { getHealth: () => Promise<GatewayHealth> }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = getMetricsCollector();
  }

  /**
   * Start the health server
   */
  async start(): Promise<void> {
    if (this.server) {
      log.warn('Health server already running');
      return;
    }

    this.server = createServer((req, res) => {
      this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        log.info(`Health server listening on http://${this.config.host}:${this.config.port}`);
        resolve();
      });

      this.server!.on('error', (error) => {
        log.error(`Health server error: ${String(error)}`);
        reject(error);
      });
    });
  }

  /**
   * Stop the health server
   */
  async stop(): Promise<void> {
    if (!this.server) return;

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = null;
        log.info('Health server stopped');
        resolve();
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    // Only allow GET requests
    if (method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    try {
      switch (url) {
        case '/':
        case '/health':
          await this.handleHealth(res);
          break;

        case '/health/live':
        case '/livez':
          await this.handleLiveness(res);
          break;

        case '/health/ready':
        case '/readyz':
          await this.handleReadiness(res);
          break;

        case '/metrics':
          if (this.config.prometheusEnabled) {
            await this.handleMetrics(res);
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
          break;

        case '/stats':
          await this.handleStats(res);
          break;

        default:
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (error) {
      log.error(`Health request error: ${String(error)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  private async handleHealth(res: ServerResponse): Promise<void> {
    const health = await this.config.getHealth();

    const response: HealthResponse = {
      status: health.status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
      uptime: health.uptime,
      checks: health.checks,
      details: {
        commandQueue: health.stats.commandQueue,
        wsManager: health.stats.wsManager,
      },
    };

    const statusCode = health.status === 'healthy' ? 200 :
                       health.status === 'degraded' ? 200 : 503;

    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    });
    res.end(JSON.stringify(response, null, 2));
  }

  private async handleLiveness(res: ServerResponse): Promise<void> {
    // Liveness: Is the process alive and responding?
    // This should always return 200 unless the process is completely stuck
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    });
    res.end(JSON.stringify({
      status: 'alive',
      timestamp: new Date().toISOString(),
    }));
  }

  private async handleReadiness(res: ServerResponse): Promise<void> {
    // Readiness: Is the service ready to accept traffic?
    const health = await this.config.getHealth();
    const ready = health.status !== 'unhealthy';

    res.writeHead(ready ? 200 : 503, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    });
    res.end(JSON.stringify({
      status: ready ? 'ready' : 'not-ready',
      timestamp: new Date().toISOString(),
      reason: ready ? undefined : 'Gateway unhealthy',
    }));
  }

  private async handleMetrics(res: ServerResponse): Promise<void> {
    const metrics = await this.metrics.getPrometheusMetrics();

    res.writeHead(200, {
      'Content-Type': 'text/plain; version=0.0.4',
      'Cache-Control': 'no-cache',
    });
    res.end(metrics);
  }

  private async handleStats(res: ServerResponse): Promise<void> {
    const health = await this.config.getHealth();
    const supervisorStats = this.config.getSupervisorStats?.();

    const stats = {
      timestamp: new Date().toISOString(),
      gateway: health,
      supervisor: supervisorStats ?? null,
      metrics: this.metrics.getStats(),
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    };

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    });
    res.end(JSON.stringify(stats, null, 2));
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== null;
  }

  /**
   * Get server address
   */
  getAddress(): string | null {
    if (!this.server) return null;
    return `http://${this.config.host}:${this.config.port}`;
  }
}

// Singleton instance
let globalHealthServer: HealthServer | null = null;

export function createHealthServer(
  config: Partial<HealthServerConfig> & { getHealth: () => Promise<GatewayHealth> },
): HealthServer {
  if (globalHealthServer) {
    return globalHealthServer;
  }
  globalHealthServer = new HealthServer(config);
  return globalHealthServer;
}

export function getHealthServer(): HealthServer | null {
  return globalHealthServer;
}
