# SmartSeek

**Make DeepSeek smarter with intelligence augmentation** - 100x cheaper than GPT-4.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows-blue.svg)](https://www.microsoft.com/windows)

## Why SmartSeek?

| Feature | SmartSeek | GPT-4 | Claude |
|---------|-----------|-------|--------|
| **Cost per 1M tokens** | $0.14 input / $0.28 output | $30 input / $60 output | $15 input / $75 output |
| **Savings** | **100x cheaper!** | Baseline | 50% cheaper than GPT-4 |
| **Self-hosted** | ✅ Yes | ❌ No | ❌ No |
| **Windows Service** | ✅ Yes | ❌ No | ❌ No |
| **Telegram Bot** | ✅ Built-in | ❌ No | ❌ No |
| **Intelligence Boost** | ✅ Chain-of-thought, tools, ReAct | ❌ Basic | ❌ Basic |

## What is SmartSeek?

SmartSeek takes **DeepSeek** (a cheap but capable LLM) and makes it **smarter** through:

- 🧠 **Chain-of-thought prompting** - forces step-by-step reasoning
- 🔧 **Tool use** - calculator, web search, code execution
- 🔄 **ReAct agent** - iterative reasoning + acting for complex tasks
- ✅ **Self-reflection** - verifies and improves its own answers

Result: **GPT-4 level intelligence at 1% of the cost.**

## Quick Start

### One-Click Install (Windows)

```batch
git clone https://github.com/vinaysolapurkar/smartseek.git
cd smartseek
INSTALL.bat
```

### Manual Install

```powershell
# Clone the repo
git clone https://github.com/vinaysolapurkar/smartseek.git
cd smartseek

# Install dependencies
npm install

# Build
npm run build

# Run setup (will ask for DeepSeek API key)
npm run setup

# Start the assistant
npm start
```

## Getting Your API Keys

### DeepSeek API Key (Required)

1. Go to [platform.deepseek.com](https://platform.deepseek.com/api_keys)
2. Create an account (free)
3. Generate an API key
4. Add credits ($5 will last months of heavy use!)

### Telegram Bot Token (Optional)

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow instructions
3. Copy the bot token

## Architecture

```
┌─────────────────────────────────────────────┐
│         AI SUPERVISOR (Windows Service)      │
│    - Monitors worker health (heartbeat)      │
│    - AI-powered crash recovery               │
│    - Auto-restart on failures                │
└──────────────────┬──────────────────────────┘
                   │ IPC
┌──────────────────▼──────────────────────────┐
│         GATEWAY WORKER (Child Process)       │
│    - Handles all AI requests                 │
│    - Circuit breakers prevent cascade        │
│    - Timeouts on all operations              │
│    - Bounded queues with backpressure        │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         INTELLIGENCE LAYER                   │
│    - Chain-of-thought prompting              │
│    - Tool use (calculator, web search)       │
│    - ReAct agent for complex tasks           │
│    - Self-reflection & verification          │
└─────────────────────────────────────────────┘
```

## Features

### 🧠 Intelligence Augmentation (The "Smart" in SmartSeek)

DeepSeek alone is good but not great. SmartSeek makes it smarter:

| Technique | What it does | Example |
|-----------|--------------|---------|
| **Chain-of-thought** | Forces step-by-step reasoning | "Let me think through this..." |
| **Tool use** | Executes code, searches web | Calculator for math, web for facts |
| **ReAct agent** | Iterative reason → act → observe | Complex multi-step tasks |
| **Self-reflection** | Reviews and improves answers | "Wait, let me verify that..." |

### 🛡️ Ultra-Resilient

- **Supervisor/Worker architecture** - crashes don't kill the service
- **Heartbeat monitoring** - detects hung processes in 15 seconds
- **AI-powered recovery** - decides whether to restart, wait, or escalate
- **Circuit breakers** - prevents cascade failures
- **Bounded queues** - handles backpressure gracefully

### 💬 Multi-Channel

- **Telegram** - chat from your phone
- **WebSocket API** - integrate with your apps
- **Health endpoint** - monitor at `/health`

### 💰 Cost Effective

- **DeepSeek Chat**: $0.14/M input, $0.28/M output
- **DeepSeek Reasoner (R1)**: $0.55/M input, $2.19/M output
- **Monthly cost**: Typically under $1 for personal use!

## Configuration

Configuration is stored in `~/.smartseek/config.json`:

```json
{
  "deepseek": {
    "apiKey": "sk-your-key-here",
    "model": "deepseek-chat"
  },
  "telegram": {
    "enabled": true,
    "botToken": "your-bot-token"
  },
  "gateway": {
    "port": 18789,
    "healthPort": 18790
  }
}
```

## Commands

### CLI

```bash
# Start everything (supervisor + worker)
npm start

# Start gateway only (no supervisor)
npm run gateway

# Install as Windows Service
npm run service:install

# Check health
curl http://localhost:18790/health
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `ws://localhost:18789` | WebSocket gateway |
| `http://localhost:18790/health` | Health check |
| `http://localhost:18790/metrics` | Prometheus metrics |
| `http://localhost:18790/stats` | Detailed statistics |

## Why "SmartSeek"?

**Smart** + **DeepSeek** = **SmartSeek**

We take DeepSeek's affordable LLM and augment it with intelligence techniques to match expensive models at a fraction of the cost.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/smartseek.git

# Create feature branch
git checkout -b feature/amazing-feature

# Make changes and test
npm test

# Commit and push
git commit -m "Add amazing feature"
git push origin feature/amazing-feature

# Open a Pull Request
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Credits

- Powered by [DeepSeek AI](https://deepseek.com)
- Intelligence augmentation inspired by ReAct, Chain-of-Thought papers

## Support

- 🐛 [Report bugs](https://github.com/vinaysolapurkar/smartseek/issues)
- 💡 [Request features](https://github.com/vinaysolapurkar/smartseek/issues)
- 💬 [Discussions](https://github.com/vinaysolapurkar/smartseek/discussions)

---

**Make AI affordable. Make DeepSeek smart. Use SmartSeek.**
