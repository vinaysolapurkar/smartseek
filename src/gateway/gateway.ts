/**
 * ClawdBot Lite - AI Gateway
 * Handles AI requests via WebSocket and Telegram
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Config } from '../config/config.js';
import { createLogger } from '../logging/logger.js';
import { smartQuery } from '../intelligence/index.js';

const log = createLogger('gateway');

type Message = {
  type: 'chat' | 'ping';
  id?: string;
  content?: string;
  model?: string;
};

type Response = {
  type: 'response' | 'error' | 'pong';
  id?: string;
  content?: string;
  error?: string;
};

let wss: WebSocketServer | null = null;
let telegramBot: unknown = null;

/**
 * Start the AI gateway
 */
export async function startGateway(config: Config): Promise<void> {
  log.info(`Starting gateway on port ${config.gateway.port}...`);

  // Start WebSocket server
  wss = new WebSocketServer({
    port: config.gateway.port,
    host: config.gateway.host,
  });

  wss.on('connection', (ws: WebSocket) => {
    log.info('Client connected');

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as Message;
        await handleMessage(ws, message, config);
      } catch (error) {
        log.error(`Message handling error: ${String(error)}`);
        sendResponse(ws, { type: 'error', error: String(error) });
      }
    });

    ws.on('close', () => {
      log.info('Client disconnected');
    });

    ws.on('error', (error) => {
      log.error(`WebSocket error: ${String(error)}`);
    });
  });

  wss.on('error', (error) => {
    log.error(`WebSocket server error: ${String(error)}`);
  });

  log.info(`WebSocket server listening on ws://${config.gateway.host}:${config.gateway.port}`);

  // Start Telegram bot if configured
  if (config.telegram.enabled && config.telegram.botToken) {
    await startTelegramBot(config);
  }
}

/**
 * Handle incoming WebSocket message
 */
async function handleMessage(ws: WebSocket, message: Message, config: Config): Promise<void> {
  if (message.type === 'ping') {
    sendResponse(ws, { type: 'pong', id: message.id });
    return;
  }

  if (message.type === 'chat' && message.content) {
    log.info(`Processing chat: ${message.content.slice(0, 50)}...`);

    try {
      // Use intelligence layer
      const useReasoner = message.model === 'deepseek-reasoner' || message.model === 'deepseek-r1';
      const model = useReasoner ? config.deepseek.reasonerModel : config.deepseek.model;

      const result = await smartQuery(message.content, {
        apiKey: config.deepseek.apiKey,
        useTools: true,
        taskType: 'general',
      });

      sendResponse(ws, {
        type: 'response',
        id: message.id,
        content: result.answer,
      });
    } catch (error) {
      log.error(`Chat error: ${String(error)}`);
      sendResponse(ws, {
        type: 'error',
        id: message.id,
        error: String(error),
      });
    }
  }
}

/**
 * Send response to WebSocket client
 */
function sendResponse(ws: WebSocket, response: Response): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(response));
  }
}

/**
 * Start Telegram bot
 */
async function startTelegramBot(config: Config): Promise<void> {
  try {
    // Dynamic import to avoid issues if not installed
    const TelegramBot = (await import('node-telegram-bot-api')).default;

    telegramBot = new TelegramBot(config.telegram.botToken, { polling: true });

    (telegramBot as any).on('message', async (msg: any) => {
      const chatId = msg.chat.id;
      const text = msg.text;

      if (!text) return;

      log.info(`Telegram message from ${chatId}: ${text.slice(0, 50)}...`);

      try {
        // Send typing indicator
        await (telegramBot as any).sendChatAction(chatId, 'typing');

        // Process with AI
        const result = await smartQuery(text, {
          apiKey: config.deepseek.apiKey,
          useTools: true,
          taskType: 'general',
        });

        // Send response
        await (telegramBot as any).sendMessage(chatId, result.answer, {
          parse_mode: 'Markdown',
        });
      } catch (error) {
        log.error(`Telegram error: ${String(error)}`);
        await (telegramBot as any).sendMessage(chatId, `Error: ${String(error)}`);
      }
    });

    log.info('Telegram bot started');
  } catch (error) {
    log.error(`Failed to start Telegram bot: ${String(error)}`);
  }
}

/**
 * Stop the gateway
 */
export async function stopGateway(): Promise<void> {
  if (wss) {
    wss.close();
    wss = null;
  }

  if (telegramBot) {
    (telegramBot as any).stopPolling();
    telegramBot = null;
  }

  log.info('Gateway stopped');
}
