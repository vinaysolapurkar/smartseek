# Contributing to SmartSeek

Thank you for your interest in contributing! This document provides guidelines for contributing to SmartSeek.

## Code of Conduct

Be respectful, inclusive, and constructive. We're all here to build something useful together.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/vinaysolapurkar/smartseek/issues)
2. If not, create a new issue with:
   - Clear title describing the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Your environment (Windows version, Node.js version)
   - Any relevant logs

### Suggesting Features

1. Check existing [Issues](https://github.com/vinaysolapurkar/smartseek/issues) and [Discussions](https://github.com/vinaysolapurkar/smartseek/discussions)
2. Open a new issue with:
   - Clear description of the feature
   - Why it would be useful
   - Possible implementation approach (optional)

### Pull Requests

1. **Fork the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/smartseek.git
   cd smartseek
   ```

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Make your changes**
   - Follow the existing code style
   - Add tests for new functionality
   - Update documentation if needed

5. **Test your changes**
   ```bash
   npm test
   npm run lint
   npm run build
   ```

6. **Commit with a clear message**
   ```bash
   git commit -m "Add: description of your change"
   ```

   Commit message prefixes:
   - `Add:` for new features
   - `Fix:` for bug fixes
   - `Update:` for improvements
   - `Docs:` for documentation
   - `Refactor:` for code refactoring
   - `Test:` for test changes

7. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```
   Then open a Pull Request on GitHub.

## Development Setup

### Prerequisites

- Node.js 20+
- Windows 10/11 (for Windows Service features)
- DeepSeek API key (for testing)

### Local Development

```bash
# Install dependencies
npm install

# Run in development mode (with hot reload)
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Run production build
npm start
```

### Project Structure

```
smartseek/
├── src/
│   ├── index.ts           # Main entry point
│   ├── config/            # Configuration management
│   ├── gateway/           # WebSocket gateway server
│   ├── supervisor/        # Process supervisor
│   │   ├── supervisor.ts  # Main supervisor
│   │   ├── worker-manager.ts
│   │   ├── heartbeat-monitor.ts
│   │   └── ai-recovery.ts
│   ├── resilience/        # Resilience patterns
│   │   ├── circuit-breaker.ts
│   │   ├── timeout-wrapper.ts
│   │   └── bounded-queue.ts
│   ├── intelligence/      # AI augmentation
│   │   ├── reasoning-prompts.ts
│   │   ├── tool-executor.ts
│   │   └── react-agent.ts
│   ├── channels/          # Communication channels
│   │   └── telegram.ts
│   ├── health/            # Health monitoring
│   │   ├── health-server.ts
│   │   └── metrics-collector.ts
│   └── service/           # Windows Service
│       ├── windows-service.ts
│       └── event-log.ts
├── test/                  # Test files
├── scripts/               # Build/deploy scripts
└── docs/                  # Documentation
```

## Code Style

- Use TypeScript strict mode
- Use ES modules (`import`/`export`)
- Use async/await (not callbacks)
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Handle errors explicitly

### Example

```typescript
/**
 * Send a message to the AI and get a response.
 * @param message - The user's message
 * @param options - Optional configuration
 * @returns The AI's response
 */
export async function chat(
  message: string,
  options?: ChatOptions
): Promise<ChatResponse> {
  if (!message.trim()) {
    throw new Error('Message cannot be empty');
  }

  const response = await callDeepSeek(message, options);
  return response;
}
```

## Testing

- Write tests for new features
- Maintain existing test coverage
- Use descriptive test names

```typescript
describe('CircuitBreaker', () => {
  it('should open after threshold failures', async () => {
    // Test implementation
  });

  it('should half-open after reset timeout', async () => {
    // Test implementation
  });
});
```

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for new APIs
- Update CHANGELOG.md for releases

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create a PR with the version bump
4. After merge, create a GitHub release
5. Tag with `v{version}` (e.g., `v1.0.1`)

## Questions?

- Open a [Discussion](https://github.com/vinaysolapurkar/smartseek/discussions)
- Check existing issues and PRs

Thank you for contributing! 🎉
