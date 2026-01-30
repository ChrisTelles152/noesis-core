# Contributing to Noesis

Thank you for your interest in contributing to Noesis! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions. We welcome contributors of all backgrounds and experience levels.

## Getting Started

### Prerequisites

- Node.js 20+
- npm 9+
- Git

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/noesis-core.git
   cd noesis-core
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Running Locally

```bash
# Start development server
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Check types
npm run check

# Lint code
npm run lint

# Format code
npm run format
```

### Project Structure

```
noesis-core/
├── packages/           # NPM packages
│   ├── core/           # Zero-dependency learning engine
│   ├── sdk-web/        # Web SDK facade
│   ├── adapters-llm/   # LLM provider integrations
│   └── adapters-attention-web/  # Attention tracking
├── apps/
│   ├── server/         # Express.js backend
│   └── web-demo/       # React demo app
├── shared/             # Shared schemas
└── docs/               # Documentation
```

## Making Changes

### Code Style

- **TypeScript**: Use strict mode, avoid `any` when possible
- **Formatting**: Run `npm run format` before committing
- **Linting**: Run `npm run lint` and fix all errors
- **Comments**: Document complex logic, but prefer self-documenting code

### Commit Messages

Use clear, descriptive commit messages:

```
feat: Add attention tracking callback cleanup
fix: Correct FSRS interval calculation for 100% retention
docs: Add server README with API documentation
test: Add security tests for prototype pollution
```

Prefixes:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Test additions/changes
- `refactor:` Code refactoring
- `chore:` Build/tooling changes

### Pull Requests

1. Ensure all tests pass: `npm test`
2. Ensure linting passes: `npm run lint`
3. Ensure types check: `npm run check`
4. Update documentation if needed
5. Fill out the PR template completely
6. Request review from maintainers

### PR Title Format

```
[Package] Brief description

Examples:
[core] Add transfer testing support
[server] Fix CSRF token validation
[sdk-web] Add mastery state persistence
```

## Testing

### Writing Tests

- Place tests in `__tests__/` directories or `.test.ts` files
- Use descriptive test names
- Test both success and error cases
- Aim for meaningful coverage, not just high percentages

```typescript
describe('FeatureName', () => {
  it('should handle valid input correctly', () => {
    // Test implementation
  });

  it('should throw error for invalid input', () => {
    // Test error case
  });
});
```

### Running Tests

```bash
# All tests
npm test

# Specific package
npm run test:core

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Core Package Guidelines

The `@noesis-edu/core` package has strict requirements:

1. **Zero External Dependencies**: No npm dependencies allowed
2. **Deterministic**: Same inputs must produce same outputs
3. **Portable**: Must work in any JavaScript environment
4. **Pure Functions**: Prefer pure functions over stateful classes

See `docs/architecture/CORE_SDK_CONSTITUTION.md` for full guidelines.

## Architecture Decisions

Before making significant changes:

1. Read existing architecture docs in `docs/architecture/`
2. Discuss major changes in an issue first
3. Consider backward compatibility
4. Update relevant documentation

## Reporting Issues

### Bug Reports

Include:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment details (Node version, OS, etc.)
- Error messages/stack traces

### Feature Requests

Include:
- Clear description of the feature
- Use case and motivation
- Proposed implementation (optional)
- Alternatives considered

## Security

If you discover a security vulnerability:

1. **Do NOT** open a public issue
2. Email the maintainers directly
3. Allow time for a fix before disclosure

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

- Open a discussion on GitHub
- Check existing issues and documentation
- Review the codebase for patterns

Thank you for contributing to Noesis! 🎉
