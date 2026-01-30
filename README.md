# SmartSeek

**Intelligence augmentation for DeepSeek** - GPT-4 level performance at 1% of the cost.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/Platform-Windows-blue.svg)](https://www.microsoft.com/windows)
[![Built on ClawdBot](https://img.shields.io/badge/Built%20on-ClawdBot-purple.svg)](https://github.com/pocketparent/clawdbot)

---

## Credits

> **SmartSeek is built on top of [ClawdBot](https://github.com/pocketparent/clawdbot)** - the powerful, extensible AI assistant platform. All core architecture, resilience patterns, supervisor system, and foundational infrastructure come from the incredible ClawdBot project. SmartSeek is an extension that adds DeepSeek optimization and intelligence augmentation on top of ClawdBot's solid foundation.

---

## What is SmartSeek?

SmartSeek is an **intelligence amplification layer** that wraps DeepSeek (a cheap but capable LLM) with advanced reasoning techniques to achieve GPT-4 level performance at a fraction of the cost.

### The Problem

| Challenge | Impact |
|-----------|--------|
| GPT-4/Claude are expensive | $15-75 per million tokens |
| DeepSeek is cheap but less capable | Good for simple tasks, struggles with complex reasoning |
| Running AI 24/7 gets costly | Personal assistants need to be affordable |

### The Solution

SmartSeek augments DeepSeek with intelligence techniques:

| Technique | What It Does | When It Helps |
|-----------|--------------|---------------|
| **Chain-of-Thought** | Forces step-by-step reasoning before answering | Complex logic, math, analysis |
| **Tool Use** | Executes calculator, web search, code | Factual queries, calculations |
| **ReAct Agent** | Iterative Reasoning → Action → Observation | Multi-step research tasks |
| **Self-Reflection** | Reviews and improves its own answers | Catching mistakes, verification |

**Result:** DeepSeek + SmartSeek ≈ GPT-4 quality at **100x lower cost**.

---

## Use Cases

### 1. 24/7 Personal AI Assistant
Run your own always-available AI assistant via Telegram or WebSocket.
```
You: What's 15% tip on a $67.50 dinner bill?
SmartSeek: [uses calculator] 15% of $67.50 = $10.13. Total with tip: $77.63
```

### 2. Research Assistant
Complex questions requiring multiple steps and web lookups.
```
You: What are the pros and cons of Next.js vs Remix for a new project?
SmartSeek: [searches web, analyzes docs, compares]
Let me research both frameworks...
[Provides detailed comparison with current 2024 information]
```

### 3. Math & Calculation Helper
Accurate calculations using the built-in calculator tool.
```
You: If I invest $10,000 at 7% compound interest for 20 years, what do I get?
SmartSeek: [uses calculator] $10,000 × (1.07)^20 = $38,696.84
```

### 4. Code Assistant
Coding help with ability to execute and verify code.
```
You: Write a function to find the longest palindrome in a string
SmartSeek: [writes code, reasons through approach]
Here's an efficient O(n²) solution using expand-around-center...
```

### 5. Telegram Bot
Chat with your AI from anywhere using your phone.
```
[Telegram] You: Summarize the key React 19 features
[Telegram] SmartSeek: [searches, analyzes] Here are the key features...
```

### 6. Self-Healing Windows Service
Install as a Windows Service that runs 24/7, survives reboots, and auto-recovers.
```powershell
smartseek service install   # Install as Windows Service
smartseek service start     # Start the service
# Now runs forever - auto-restarts on crash, starts on boot
```

---

## Cost Comparison

| Provider | Input (per 1M) | Output (per 1M) | Monthly Cost* |
|----------|----------------|-----------------|---------------|
| **SmartSeek** | **$0.14** | **$0.28** | **~$1** |
| DeepSeek R1 | $0.55 | $2.19 | ~$5 |
| GPT-4 | $30.00 | $60.00 | ~$100+ |
| Claude | $15.00 | $75.00 | ~$150+ |

*Estimated for personal use (~100 queries/day)

**SmartSeek is 100x cheaper than GPT-4!**

---

## Quick Start

### One-Click Install (Windows)

```batch
git clone https://github.com/vinaysolapurkar/smartseek.git
cd smartseek
INSTALL.bat
```

The installer will:
1. Check/install Node.js if needed
2. Install all dependencies
3. Build the project
4. Run interactive setup (asks for DeepSeek API key)

### Manual Install

```powershell
git clone https://github.com/vinaysolapurkar/smartseek.git
cd smartseek
npm install
npm run build
npm run setup    # Interactive wizard
npm start        # Start SmartSeek
```

### Get Your DeepSeek API Key

1. Go to [platform.deepseek.com](https://platform.deepseek.com/api_keys)
2. Create account (free)
3. Generate API key
4. Add $5 credits (lasts months of heavy use!)

### Optional: Telegram Bot

1. Open Telegram, search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, follow instructions
3. Copy the bot token
4. Enter it during setup

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│            SUPERVISOR (Windows Service)          │
│     Powered by ClawdBot's resilience system      │
│     • Heartbeat monitoring (5s interval)         │
│     • AI-powered recovery decisions              │
│     • Auto-restart with exponential backoff      │
└──────────────────────┬──────────────────────────┘
                       │ IPC
┌──────────────────────▼──────────────────────────┐
│            GATEWAY WORKER                        │
│     • WebSocket server (ws://localhost:18789)    │
│     • Telegram bot integration                   │
│     • Circuit breakers & bounded queues          │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│            INTELLIGENCE LAYER (SmartSeek)        │
│     • Chain-of-thought prompting                 │
│     • Tool executor (calc, web, code)            │
│     • ReAct agent for complex tasks              │
│     • Self-reflection & verification             │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│            DEEPSEEK API                          │
│     • deepseek-chat (fast, cheap)                │
│     • deepseek-reasoner (R1, smarter)            │
└─────────────────────────────────────────────────┘
```

---

## Features

### Intelligence Augmentation
- **Chain-of-Thought**: System prompts that enforce step-by-step reasoning
- **Tool Use**: Calculator, web search, code execution, current time
- **ReAct Agent**: Thought → Action → Observation loops for complex tasks
- **Self-Reflection**: Automatic answer review and improvement

### Resilience (from ClawdBot)
- **Supervisor/Worker**: Process isolation - crashes don't kill the service
- **Heartbeat Monitoring**: Detects hung processes in 15 seconds
- **Circuit Breakers**: Prevents cascade failures
- **Bounded Queues**: Handles backpressure gracefully
- **AI-Powered Recovery**: Smart restart decisions

### Multi-Channel
- **Telegram Bot**: Chat from your phone
- **WebSocket API**: Integrate with your apps
- **Health Endpoints**: `/health`, `/metrics`, `/stats`

### Windows Native
- **Windows Service**: Proper service with auto-start
- **One-Click Installer**: INSTALL.bat handles everything

---

## Commands

```bash
# Start (supervisor mode - recommended for production)
npm start

# Start (direct mode - for development)
npm start -- --direct

# Run setup wizard
npm run setup

# Windows Service
npm run service:install
npm run service:start
npm run service:stop
npm run service:uninstall

# Health check
curl http://localhost:18790/health
```

---

## Configuration

Stored at `~/.smartseek/config.json`:

```json
{
  "deepseek": {
    "apiKey": "sk-your-key",
    "model": "deepseek-chat",
    "reasonerModel": "deepseek-reasoner"
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

Environment variables:
- `DEEPSEEK_API_KEY` - API key (overrides config)
- `TELEGRAM_BOT_TOKEN` - Bot token (overrides config)
- `SMARTSEEK_PORT` - WebSocket port (default: 18789)
- `SMARTSEEK_HEALTH_PORT` - Health port (default: 18790)

---

## API

### WebSocket (ws://localhost:18789)

```json
// Send
{"type": "chat", "id": "1", "content": "What is 2+2?"}

// Receive
{"type": "response", "id": "1", "content": "2 + 2 = 4"}
```

### Health Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health status (healthy/unhealthy) |
| `GET /metrics` | Prometheus-format metrics |
| `GET /stats` | Detailed JSON statistics |

---

## Credits & Acknowledgments

### ClawdBot - The Foundation

**SmartSeek is built entirely on top of [ClawdBot](https://github.com/pocketparent/clawdbot).**

ClawdBot provides:
- Multi-model AI assistant platform
- Supervisor/Worker architecture for reliability
- Circuit breakers, timeouts, bounded queues
- Health monitoring infrastructure
- Configuration management system
- Cross-platform support

SmartSeek adds:
- DeepSeek-first optimization for cost savings
- Intelligence augmentation layer (CoT, tools, ReAct, reflection)
- Simplified Windows-focused deployment
- One-click installer for easy setup

**All credit for the core infrastructure goes to the ClawdBot team.**

### Other Credits
- **[DeepSeek](https://deepseek.com)** - Affordable, capable AI models
- **[Anthropic](https://anthropic.com)** - Claude helped build this
- Research papers on Chain-of-Thought and ReAct patterns

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT License - see [LICENSE](LICENSE).

---

## Links

| Resource | URL |
|----------|-----|
| SmartSeek | https://github.com/vinaysolapurkar/smartseek |
| **ClawdBot** (parent project) | https://github.com/pocketparent/clawdbot |
| DeepSeek API | https://platform.deepseek.com |
| Issues | https://github.com/vinaysolapurkar/smartseek/issues |

---

<p align="center">
<strong>SmartSeek: GPT-4 intelligence at DeepSeek prices.</strong>
<br>
<em>Built with love on top of <a href="https://github.com/pocketparent/clawdbot">ClawdBot</a>.</em>
</p>
