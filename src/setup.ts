/**
 * SmartSeek - Interactive Setup Wizard
 */

import * as readline from 'node:readline';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

function print(text: string): void {
  console.log(text);
}

function printBanner(): void {
  print(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║              SMARTSEEK - SETUP WIZARD                         ║
║                                                               ║
║   Make DeepSeek smarter - 100x cheaper than GPT-4!            ║
║   Cost: ~$0.14/million tokens                                 ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);
}

function printSection(title: string): void {
  print(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ${title}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

async function testDeepSeekKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(10000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function testTelegramToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json() as { ok: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

export async function runSetup(): Promise<void> {
  printBanner();

  const configDir = join(homedir(), '.smartseek');
  const configPath = join(configDir, 'config.json');

  // Create config directory
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // ============ DeepSeek API Key ============
  printSection('DEEPSEEK API KEY');

  print(`
  DeepSeek AI is the most cost-effective AI model available:

    • Chat model:     $0.14 per million input tokens
                      $0.28 per million output tokens

    • Reasoner (R1):  $0.55 per million input tokens
                      $2.19 per million output tokens

  That's 100x CHEAPER than GPT-4!

  Get your API key at: https://platform.deepseek.com/api_keys
  (Create account → API Keys → Create new key)
`);

  let deepseekKey = '';
  while (!deepseekKey) {
    const key = await question('\n  Enter your DeepSeek API key: ');

    if (!key) {
      print('  ⚠️  API key is required to continue.');
      continue;
    }

    print('  Testing API key...');
    const valid = await testDeepSeekKey(key);

    if (valid) {
      deepseekKey = key;
      print('  ✅ API key is valid!');
    } else {
      print('  ❌ Invalid API key. Please check and try again.');
    }
  }

  // Save API key to environment (Windows)
  try {
    await execAsync(`setx DEEPSEEK_API_KEY "${deepseekKey}"`);
    print('  ✅ API key saved to environment variables');
  } catch {
    print('  ⚠️  Could not save to environment. You may need to set it manually.');
  }

  // ============ Telegram Bot (Optional) ============
  printSection('TELEGRAM BOT (OPTIONAL)');

  print(`
  You can optionally connect a Telegram bot to chat with your AI
  from anywhere using your phone.

  To create a Telegram bot:
    1. Open Telegram and search for @BotFather
    2. Send /newbot and follow the instructions
    3. Copy the bot token (looks like: 123456789:ABCdef...)
`);

  let telegramToken = '';
  const wantsTelegram = await question('  Do you want to set up Telegram? (y/N): ');

  if (wantsTelegram.toLowerCase() === 'y') {
    while (true) {
      const token = await question('  Enter your Telegram bot token (or press Enter to skip): ');

      if (!token) {
        print('  Skipping Telegram setup.');
        break;
      }

      print('  Testing bot token...');
      const valid = await testTelegramToken(token);

      if (valid) {
        telegramToken = token;
        print('  ✅ Bot token is valid!');

        try {
          await execAsync(`setx TELEGRAM_BOT_TOKEN "${telegramToken}"`);
          print('  ✅ Bot token saved to environment variables');
        } catch {
          print('  ⚠️  Could not save to environment.');
        }
        break;
      } else {
        print('  ❌ Invalid bot token. Please check and try again.');
      }
    }
  }

  // ============ Create Configuration ============
  printSection('CREATING CONFIGURATION');

  const config = {
    deepseek: {
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      reasonerModel: 'deepseek-reasoner',
    },
    telegram: {
      enabled: !!telegramToken,
    },
    gateway: {
      port: 18789,
      healthPort: 18790,
      host: '127.0.0.1',
    },
    supervisor: {
      enabled: true,
    },
    logging: {
      level: 'info',
      console: true,
      file: true,
    },
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2));
  print(`  ✅ Configuration saved to: ${configPath}`);

  // ============ Complete ============
  printSection('SETUP COMPLETE');

  print(`
  🎉 SmartSeek is ready to use!

  QUICK START:
    smartseek              Start the AI assistant
    smartseek --direct     Start in development mode

  IN THE TERMINAL:
    • Type messages to chat with DeepSeek AI
    • Use Ctrl+C to exit
`);

  if (telegramToken) {
    print(`
  TELEGRAM:
    • Open your bot in Telegram and send a message
    • The AI will respond automatically
`);
  }

  print(`
  USEFUL COMMANDS:
    smartseek service install    Install as Windows Service
    smartseek help               Show all commands

  HEALTH CHECK:
    http://localhost:18790/health

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  const startNow = await question('  Would you like to start SmartSeek now? (Y/n): ');

  rl.close();

  if (startNow.toLowerCase() !== 'n') {
    print('\n  Starting SmartSeek...\n');

    // Re-run without setup flag
    const { main } = await import('./index.js');
    // The main function will be called when index.js is imported
  }
}
