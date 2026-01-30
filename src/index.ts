/**
 * SmartSeek - Main Entry Point
 *
 * Make DeepSeek smarter with intelligence augmentation.
 * 100x cheaper than GPT-4!
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

import { loadConfig } from './config/config.js';
import { createLogger, configureLogger, flushLogs } from './logging/logger.js';
import { createSupervisor, type Supervisor } from './supervisor/supervisor.js';
import { HeartbeatSender } from './supervisor/heartbeat-monitor.js';
import { createHealthServer } from './health/health-server.js';
import { getMetricsCollector } from './health/metrics-collector.js';
import { runSetup } from './setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('main');

/**
 * Display banner
 */
function showBanner(): void {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ███████╗███╗   ███╗ █████╗ ██████╗ ████████╗                ║
║   ██╔════╝████╗ ████║██╔══██╗██╔══██╗╚══██╔══╝                ║
║   ███████╗██╔████╔██║███████║██████╔╝   ██║                   ║
║   ╚════██║██║╚██╔╝██║██╔══██║██╔══██╗   ██║                   ║
║   ███████║██║ ╚═╝ ██║██║  ██║██║  ██║   ██║                   ║
║   ╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝                   ║
║               ███████╗███████╗███████╗██╗  ██╗                ║
║               ██╔════╝██╔════╝██╔════╝██║ ██╔╝                ║
║               ███████╗█████╗  █████╗  █████╔╝                 ║
║               ╚════██║██╔══╝  ██╔══╝  ██╔═██╗                 ║
║               ███████║███████╗███████╗██║  ██╗                ║
║               ╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝                ║
║                                                               ║
║   Make DeepSeek smarter - 100x cheaper than GPT-4!            ║
║   Cost: ~$0.14/million tokens                                 ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);
}

/**
 * Parse command line arguments
 */
function parseArgs(): {
  command: string | null;
  subcommand: string | null;
  flags: Record<string, boolean>;
} {
  const args = process.argv.slice(2);
  const command = args[0] || null;
  const subcommand = args[1] || null;
  const flags: Record<string, boolean> = {};

  for (const arg of args) {
    if (arg.startsWith('--')) {
      flags[arg.slice(2)] = true;
    }
  }

  return { command, subcommand, flags };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const { command, subcommand, flags } = parseArgs();

  // Handle setup command
  if (command === 'setup' || flags.setup) {
    await runSetup();
    return;
  }

  // Handle service commands
  if (command === 'service') {
    const { runServiceCommand } = await import('./service/service-cli.js');
    await runServiceCommand(subcommand || 'help');
    return;
  }

  // Handle help
  if (command === 'help' || command === '--help' || command === '-h') {
    showBanner();
    console.log(`
Usage: smartseek [command] [options]

Commands:
  (none)              Start the AI assistant (supervisor mode)
  setup               Run interactive setup wizard
  service install     Install as Windows Service
  service uninstall   Uninstall Windows Service
  service start       Start the Windows Service
  service stop        Stop the Windows Service
  help                Show this help message

Options:
  --gateway-only      Start only the gateway (no TUI)
  --direct            Run without supervisor (development mode)

Examples:
  smartseek                    # Start normally
  smartseek setup              # Run setup wizard
  smartseek service install    # Install as Windows Service
  smartseek --direct           # Development mode (no supervisor)

Environment Variables:
  DEEPSEEK_API_KEY    Your DeepSeek API key
  TELEGRAM_BOT_TOKEN  Your Telegram bot token (optional)

Configuration:
  ~/.smartseek/config.json

Health Endpoint:
  http://localhost:18790/health
`);
    return;
  }

  // Load configuration
  const config = loadConfig();

  // Check if API key is configured
  if (!config.deepseek.apiKey) {
    showBanner();
    console.log('\n⚠️  DeepSeek API key not configured!\n');
    console.log('Run setup wizard:');
    console.log('  smartseek setup\n');
    console.log('Or set environment variable:');
    console.log('  set DEEPSEEK_API_KEY=your-api-key\n');
    process.exit(1);
  }

  // Configure logging
  configureLogger({
    level: config.logging.level,
    console: config.logging.console,
    file: config.logging.file,
    filePath: config.logging.filePath,
  });

  showBanner();

  // Check run mode
  const isWorker = process.env.SMARTSEEK_WORKER === '1';
  const isDirect = flags.direct || config.supervisor?.enabled === false;

  if (isWorker) {
    await runWorker(config);
  } else if (isDirect) {
    await runDirect(config);
  } else {
    await runSupervisor(config);
  }
}

/**
 * Run as supervisor (spawns and monitors worker)
 */
async function runSupervisor(config: ReturnType<typeof loadConfig>): Promise<void> {
  log.info('Starting SmartSeek in supervisor mode...');

  const metrics = getMetricsCollector();
  let supervisor: Supervisor | null = null;

  supervisor = await createSupervisor({
    worker: {
      scriptPath: __filename,
      args: [],
      env: {
        ...process.env,
        SMARTSEEK_WORKER: '1',
      },
      maxRestarts: 10,
      restartDelayMs: 5000,
      maxRestartDelayMs: 60_000,
      backoffMultiplier: 2,
      restartWindowMs: 60_000,
      startupTimeoutMs: 120_000,
      heartbeat: {
        intervalMs: 5000,
        timeoutMs: 15000,
        missedThreshold: 3,
      },
    },
    aiRecoveryEnabled: true,
    healthPort: config.gateway.healthPort,
    maxConsecutiveCrashes: 5,
    recoveryDecisionCooldownMs: 60_000,
  });

  // Event handlers
  supervisor.on('worker-started', (pid) => {
    log.info(`Worker started with PID ${pid}`);
    metrics.incrementCounter('worker_restarts_total');
  });

  supervisor.on('worker-crashed', (code) => {
    log.error(`Worker crashed with code ${code}`);
    metrics.incrementCounter('worker_crashes_total');
  });

  supervisor.on('worker-hung', () => {
    log.error('Worker hung - initiating recovery');
    metrics.incrementCounter('worker_heartbeats_missed_total');
  });

  supervisor.on('recovery-decision', (decision) => {
    log.info(`Recovery decision: ${decision.action} - ${decision.reason}`);
  });

  supervisor.on('failed', (reason) => {
    log.error(`Supervisor failed: ${reason}`);
    process.exit(1);
  });

  // Start health server
  const healthServer = createHealthServer({
    port: config.gateway.healthPort,
    host: config.gateway.host,
    getHealth: async () => {
      const stats = supervisor!.getStats();
      return {
        status: stats.state === 'running' ? 'healthy' : 'unhealthy',
        uptime: stats.uptime,
        lastCheck: Date.now(),
        checks: {
          gateway: stats.worker.state === 'running',
          deepseek: true,
        },
      };
    },
    getSupervisorStats: () => supervisor!.getStats(),
  });

  await healthServer.start();

  // Shutdown handler
  const shutdown = async () => {
    log.info('Shutting down...');
    await supervisor?.stop();
    await healthServer.stop();
    await flushLogs();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  log.info(`SmartSeek running!`);
  log.info(`Health: http://${config.gateway.host}:${config.gateway.healthPort}/health`);
  console.log(`\n✅ SmartSeek is running!`);
  console.log(`   Health: http://${config.gateway.host}:${config.gateway.healthPort}/health`);
  console.log(`   Press Ctrl+C to stop\n`);
}

/**
 * Run as worker (actual AI processing)
 */
async function runWorker(config: ReturnType<typeof loadConfig>): Promise<void> {
  log.info('Starting SmartSeek worker...');

  const heartbeatSender = new HeartbeatSender(
    (data) => {
      if (process.send) {
        process.send({ type: 'heartbeat', heartbeat: data });
      }
    },
    5000
  );

  // Handle shutdown from supervisor
  process.on('message', (message: unknown) => {
    if (typeof message === 'object' && message !== null && (message as { type?: string }).type === 'shutdown') {
      log.info('Received shutdown from supervisor');
      gracefulShutdown();
    }
  });

  // Start the AI gateway
  const { startGateway } = await import('./gateway/gateway.js');

  try {
    await startGateway(config);

    // Signal ready
    if (process.send) {
      process.send({ type: 'ready' });
    }

    // Start heartbeat
    heartbeatSender.start(() => ({
      gateway: true,
    }));

    log.info(`Worker running on port ${config.gateway.port}`);
  } catch (error) {
    log.error(`Failed to start gateway: ${String(error)}`);
    process.exit(1);
  }

  const gracefulShutdown = async () => {
    log.info('Shutting down worker...');
    heartbeatSender.stop();
    await flushLogs();
    process.exit(0);
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

/**
 * Run directly without supervisor (development mode)
 */
async function runDirect(config: ReturnType<typeof loadConfig>): Promise<void> {
  log.info('Starting SmartSeek in direct mode...');

  // Start health server
  const healthServer = createHealthServer({
    port: config.gateway.healthPort,
    host: config.gateway.host,
    getHealth: async () => ({
      status: 'healthy',
      uptime: process.uptime() * 1000,
      lastCheck: Date.now(),
      checks: { gateway: true, deepseek: true },
    }),
  });

  await healthServer.start();
  log.info(`Health server: http://${config.gateway.host}:${config.gateway.healthPort}/health`);

  // Start gateway
  const { startGateway } = await import('./gateway/gateway.js');

  try {
    await startGateway(config);
    log.info(`Gateway running on port ${config.gateway.port}`);
    console.log(`\n✅ SmartSeek is running (direct mode)!`);
    console.log(`   Gateway: ws://${config.gateway.host}:${config.gateway.port}`);
    console.log(`   Health: http://${config.gateway.host}:${config.gateway.healthPort}/health`);
    console.log(`   Press Ctrl+C to stop\n`);
  } catch (error) {
    log.error(`Failed to start: ${String(error)}`);
    process.exit(1);
  }

  const shutdown = async () => {
    log.info('Shutting down...');
    await healthServer.stop();
    await flushLogs();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
