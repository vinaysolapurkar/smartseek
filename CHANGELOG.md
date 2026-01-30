# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-30

### Added
- Initial release of SmartSeek
- DeepSeek AI integration (chat and reasoner models)
- Intelligence augmentation layer:
  - Chain-of-thought prompting
  - Tool use (calculator, web search, code execution)
  - ReAct agent for complex tasks
  - Self-reflection and verification
- Supervisor/Worker architecture for 24/7 reliability
- AI-powered crash recovery
- Heartbeat monitoring (5s interval, 15s timeout)
- Circuit breaker pattern for resilience
- Bounded queues with backpressure handling
- Timeout wrappers for all operations
- Telegram bot integration
- WebSocket gateway
- Health endpoints (/health, /metrics, /stats)
- Windows Service support
- Interactive setup wizard
- One-click installer (INSTALL.bat)

### Cost Comparison
| Provider | Input (per 1M) | Output (per 1M) |
|----------|----------------|-----------------|
| DeepSeek Chat | $0.14 | $0.28 |
| DeepSeek R1 | $0.55 | $2.19 |
| GPT-4 | $30.00 | $60.00 |
| Claude | $15.00 | $75.00 |

DeepSeek is **100x cheaper** than GPT-4!
