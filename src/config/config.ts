/**
 * ClawdBot Lite Configuration
 */

import { join } from 'node:path';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

export type Config = {
  deepseek: {
    apiKey: string;
    baseUrl: string;
    model: string;
    reasonerModel: string;
  };
  telegram: {
    enabled: boolean;
    botToken: string;
  };
  gateway: {
    port: number;
    healthPort: number;
    host: string;
  };
  supervisor: {
    enabled: boolean;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    console: boolean;
    file: boolean;
    filePath: string;
  };
  paths: {
    configDir: string;
    dataDir: string;
    logDir: string;
  };
};

const getConfigDir = (): string => {
  return process.env.CLAWDBOT_LITE_CONFIG_DIR || join(homedir(), '.clawdbot-lite');
};

const getDefaultConfig = (): Config => {
  const configDir = getConfigDir();
  const dataDir = join(configDir, 'data');
  const logDir = join(configDir, 'logs');

  return {
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      reasonerModel: 'deepseek-reasoner',
    },
    telegram: {
      enabled: !!process.env.TELEGRAM_BOT_TOKEN,
      botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    },
    gateway: {
      port: parseInt(process.env.CLAWDBOT_PORT || '18789', 10),
      healthPort: parseInt(process.env.CLAWDBOT_HEALTH_PORT || '18790', 10),
      host: process.env.CLAWDBOT_HOST || '127.0.0.1',
    },
    supervisor: {
      enabled: process.env.CLAWDBOT_SUPERVISOR !== 'false',
    },
    logging: {
      level: (process.env.CLAWDBOT_LOG_LEVEL as Config['logging']['level']) || 'info',
      console: true,
      file: true,
      filePath: join(logDir, 'clawdbot-lite.log'),
    },
    paths: {
      configDir,
      dataDir,
      logDir,
    },
  };
};

let globalConfig: Config | null = null;

/**
 * Load configuration from file and environment
 */
export function loadConfig(): Config {
  if (globalConfig) {
    return globalConfig;
  }

  const defaults = getDefaultConfig();
  const configPath = join(defaults.paths.configDir, 'config.json');

  // Create config directory if needed
  if (!existsSync(defaults.paths.configDir)) {
    mkdirSync(defaults.paths.configDir, { recursive: true });
  }

  // Create logs directory if needed
  if (!existsSync(defaults.paths.logDir)) {
    mkdirSync(defaults.paths.logDir, { recursive: true });
  }

  // Load config file if exists
  let fileConfig: Partial<Config> = {};
  if (existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch (error) {
      console.warn(`Failed to load config from ${configPath}: ${String(error)}`);
    }
  }

  // Merge configs (env > file > defaults)
  globalConfig = {
    deepseek: {
      ...defaults.deepseek,
      ...fileConfig.deepseek,
      apiKey: process.env.DEEPSEEK_API_KEY || fileConfig.deepseek?.apiKey || defaults.deepseek.apiKey,
    },
    telegram: {
      ...defaults.telegram,
      ...fileConfig.telegram,
      botToken: process.env.TELEGRAM_BOT_TOKEN || fileConfig.telegram?.botToken || defaults.telegram.botToken,
      enabled: !!(process.env.TELEGRAM_BOT_TOKEN || fileConfig.telegram?.botToken),
    },
    gateway: {
      ...defaults.gateway,
      ...fileConfig.gateway,
    },
    supervisor: {
      ...defaults.supervisor,
      ...fileConfig.supervisor,
    },
    logging: {
      ...defaults.logging,
      ...fileConfig.logging,
    },
    paths: defaults.paths,
  };

  return globalConfig;
}

/**
 * Save configuration to file
 */
export function saveConfig(config: Partial<Config>): void {
  const current = loadConfig();
  const merged = { ...current, ...config };
  const configPath = join(merged.paths.configDir, 'config.json');

  // Don't save paths or sensitive data
  const toSave = {
    deepseek: {
      baseUrl: merged.deepseek.baseUrl,
      model: merged.deepseek.model,
      reasonerModel: merged.deepseek.reasonerModel,
      // Note: API key saved separately or via env
    },
    telegram: {
      enabled: merged.telegram.enabled,
      // Note: Bot token saved separately or via env
    },
    gateway: merged.gateway,
    supervisor: merged.supervisor,
    logging: {
      level: merged.logging.level,
      console: merged.logging.console,
      file: merged.logging.file,
    },
  };

  writeFileSync(configPath, JSON.stringify(toSave, null, 2));
  globalConfig = null; // Force reload
}

/**
 * Get config directory path
 */
export function getConfigPath(): string {
  return getConfigDir();
}

/**
 * Reset config (for testing)
 */
export function resetConfig(): void {
  globalConfig = null;
}
