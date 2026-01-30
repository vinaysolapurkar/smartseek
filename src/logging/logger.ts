/**
 * Logger for ClawdBot Lite
 */

import winston from 'winston';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export type LoggerConfig = {
  level: LogLevel;
  console: boolean;
  file: boolean;
  filePath?: string;
  timestamps?: boolean;
  json?: boolean;
};

const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  console: true,
  file: false,
  timestamps: true,
  json: false,
};

let globalConfig: LoggerConfig = { ...DEFAULT_CONFIG };
let rootLogger: winston.Logger | null = null;

function initRootLogger(): winston.Logger {
  if (rootLogger) return rootLogger;

  const transports: winston.transport[] = [];

  // Console transport
  if (globalConfig.console) {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          globalConfig.timestamps ? winston.format.timestamp() : winston.format.simple(),
          winston.format.printf(({ timestamp, level, message, subsystem, ...meta }) => {
            const ts = timestamp ? `[${timestamp}] ` : '';
            const sub = subsystem ? `[${subsystem}] ` : '';
            const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
            return `${ts}${level} ${sub}${message}${metaStr}`;
          })
        ),
      })
    );
  }

  // File transport
  if (globalConfig.file && globalConfig.filePath) {
    transports.push(
      new winston.transports.File({
        filename: globalConfig.filePath,
        format: winston.format.combine(
          winston.format.timestamp(),
          globalConfig.json
            ? winston.format.json()
            : winston.format.printf(({ timestamp, level, message, subsystem, ...meta }) => {
                const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
                return `[${timestamp}] ${level.toUpperCase()} [${subsystem ?? 'root'}] ${message}${metaStr}`;
              })
        ),
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        tailable: true,
      })
    );
  }

  // Fallback to console if no transports
  if (transports.length === 0) {
    transports.push(new winston.transports.Console());
  }

  rootLogger = winston.createLogger({
    level: globalConfig.level,
    transports,
  });

  return rootLogger;
}

export type Logger = {
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
  child: (subsystem: string) => Logger;
};

/**
 * Create a logger instance for a subsystem
 */
export function createLogger(subsystem: string): Logger {
  const logger = initRootLogger();

  const log = (level: LogLevel, message: string, meta?: Record<string, unknown>) => {
    logger.log(level, message, { subsystem, ...meta });
  };

  return {
    error: (message, meta) => log('error', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    info: (message, meta) => log('info', message, meta),
    debug: (message, meta) => log('debug', message, meta),
    child: (childSubsystem) => createLogger(`${subsystem}:${childSubsystem}`),
  };
}

/**
 * Configure the global logger
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  globalConfig = { ...globalConfig, ...config };
  rootLogger = null; // Force re-initialization
}

/**
 * Get the current logger configuration
 */
export function getLoggerConfig(): LoggerConfig {
  return { ...globalConfig };
}

/**
 * Flush all log transports
 */
export async function flushLogs(): Promise<void> {
  if (rootLogger) {
    return new Promise((resolve) => {
      rootLogger!.on('finish', resolve);
      rootLogger!.end();
    });
  }
}
