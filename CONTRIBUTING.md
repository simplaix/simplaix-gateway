# Contributing to Simplaix Gateway

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork and create a branch:

```bash
git clone https://github.com/<your-username>/simplaix-gateway.git
cd simplaix-gateway
git checkout -b feature/your-feature-name
```

3. Install dependencies and set up the dev environment:

```bash
pnpm install
cp .env.example .env
docker compose up -d postgres
pnpm db:migrate
```

4. Start the dev server:

```bash
pnpm dev
```

## Development Workflow

### Code Style

- Follow existing patterns in the codebase (see `CLAUDE.md` for architecture conventions)
- Use folder-per-unit structure for routes and services
- Keep `index.ts` as the public entrypoint; put logic in `module.ts` or feature files
- Use TypeScript strict mode

### Before Submitting

Run these checks locally:

```bash
# Type checking
pnpm -s typecheck:gateway

# Tests
pnpm -s test:gateway
```

### Commit Messages

- Use clear, concise commit messages
- Start with a verb: `Add`, `Fix`, `Update`, `Remove`, `Refactor`
- Example: `Add rate limiting to MCP proxy endpoint`

## Pull Request Process

1. **One PR per change** — keep PRs focused and reviewable
2. **Describe what and why** — explain the motivation, not just the code
3. **Update docs if needed** — if your change affects user-facing behavior
4. **All checks must pass** — CI will run type checking and tests
5. **Squash and merge** — we use squash merges to keep `main` history clean

### PR Title Format

```
<type>: <short description>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

Examples:
- `feat: add OAuth2 credential provider support`
- `fix: handle expired tokens in MCP proxy`
- `docs: update quick start guide`

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Search existing issues before creating a new one
- Include reproduction steps for bugs
- For security vulnerabilities, please email contact@simplaix.com instead of opening a public issue

## License

By contributing, you agree that your contributions will be licensed under the [Apache 2.0 License](LICENSE).
