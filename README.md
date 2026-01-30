# ClawdBot Lite

**The cheapest way to run your own AI assistant** - powered by DeepSeek AI.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows-blue.svg)](https://www.microsoft.com/windows)

## Why ClawdBot Lite?

| Feature | ClawdBot Lite | GPT-4 | Claude |
|---------|---------------|-------|--------|
| **Cost per 1M tokens** | $0.14 input / $0.28 output | $30 input / $60 output | $15 input / $75 output |
| **Savings** | **100x cheaper!** | Baseline | 50% cheaper than GPT-4 |
| **Self-hosted** | ✅ Yes | ❌ No | ❌ No |
| **Windows Service** | ✅ Yes | ❌ No | ❌ No |
| **Telegram Bot** | ✅ Built-in | ❌ No | ❌ No |
| **Auto-recovery** | ✅ AI-powered | ❌ No | ❌ No |

## What is this?

ClawdBot Lite is a **lightweight, self-hosted AI assistant** that:

- 🚀 **Runs on your Windows PC** as a background service
- 💰 **Costs almost nothing** - uses DeepSeek AI (~$0.14/million tokens)
- 🔄 **Never crashes** - AI-powered supervisor auto-recovers from failures
- 📱 **Works with Telegram** - chat with your AI from anywhere
- 🧠 **Intelligence augmented** - chain-of-thought reasoning, tool use, web search

## Quick Start

### One-Click Install

```batch
git clone https://github.com/pocketparent/clawdbot-lite.git
cd clawdbot-lite
INSTALL.bat
```

### Manual Install

```powershell
# Clone the repo
git clone https://github.com/pocketparent/clawdbot-lite.git
cd clawdbot-lite

# Install dependencies
npm install

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

### 🛡️ Ultra-Resilient
- **Supervisor/Worker architecture** - crashes don't kill the service
- **Heartbeat monitoring** - detects hung processes in 15 seconds
- **AI-powered recovery** - decides whether to restart, wait, or escalate
- **Circuit breakers** - prevents cascade failures
- **Bounded queues** - handles backpressure gracefully

### 🧠 Intelligence Augmented
- **Chain-of-thought prompting** - forces step-by-step reasoning
- **Tool use** - calculator, web search, code execution
- **ReAct agent** - iterative reasoning + acting
- **Self-reflection** - verifies and improves answers

### 💬 Multi-Channel
- **Terminal UI** - beautiful command-line interface
- **Telegram** - chat from your phone
- **WebSocket API** - integrate with your apps
- **Health endpoint** - monitor at `/health`

### 💰 Cost Effective
- **DeepSeek Chat**: $0.14/M input, $0.28/M output
- **DeepSeek Reasoner (R1)**: $0.55/M input, $2.19/M output
- **Monthly cost**: Typically under $1 for personal use!

## Configuration

Configuration is stored in `~/.clawdbot-lite/config.json`:

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

### In Terminal UI

| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/model deepseek-chat` | Switch to fast chat model |
| `/model deepseek-r1` | Switch to reasoning model |
| `/clear` | Clear conversation |
| `/exit` | Exit the TUI |

### CLI

```bash
# Start everything
npm start

# Start gateway only
npm run gateway

# Start TUI only
npm run tui

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

## Why Separate from ClawdBot?

This project is a **lightweight fork** of [ClawdBot](https://github.com/pocketparent/clawdbot) optimized for:

1. **Cost** - DeepSeek-first, not Claude/GPT-first
2. **Simplicity** - Just the essentials, no complexity
3. **Windows** - Native Windows service support
4. **Resilience** - Supervisor architecture for 24/7 uptime
5. **Self-hosted** - Your data stays on your machine

**ClawdBot** is the full-featured AI assistant platform with:
- Multi-model support (Claude, GPT-4, etc.)
- Advanced agent capabilities
- Plugin system
- Multi-platform (macOS, Linux, Windows)

**ClawdBot Lite** is for users who want:
- The cheapest possible AI assistant
- Simple setup on Windows
- 24/7 reliability
- Telegram integration

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/clawdbot-lite.git

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

- Built on top of [ClawdBot](https://github.com/pocketparent/clawdbot)
- Powered by [DeepSeek AI](https://deepseek.com)
- Inspired by the need for affordable AI assistants

## Support

- 🐛 [Report bugs](https://github.com/pocketparent/clawdbot-lite/issues)
- 💡 [Request features](https://github.com/pocketparent/clawdbot-lite/issues)
- 💬 [Discussions](https://github.com/pocketparent/clawdbot-lite/discussions)

---

**Made with ❤️ for people who want AI without the hefty price tag.**
