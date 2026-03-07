# Gateway Coding Patterns

This guide documents the modular pattern now used in `src/routes` and `src/services`.

## Core Principles

- Use folder-per-unit structure for every route and service.
- Keep `index.ts` as the public entrypoint.
- Keep business logic out of `index.ts`; implement behavior in focused modules.
- Split by responsibility, not by file size alone.
- Preserve stable import surfaces by importing from `.../index.js`.

## Folder Convention

Each route or service gets its own folder.

Example for a route:
```text
src/routes/agent/
  index.ts
  module.ts
```

Example for a complex route:
```text
src/routes/provider-access/
  index.ts
  rules.ts
  agent-rules.ts
  shared.ts
```

Example for a service:
```text
src/services/auth.service/
  index.ts
  session-jwt.ts
  external-jwt.ts
  errors.ts
  types.ts
```

## `index.ts` Rules

- Export only public API for that unit.
- Avoid heavy logic in `index.ts`.
- For simple units, `index.ts` re-exports `module.ts`.
- For complex units, `index.ts` composes submodules and exports final objects/functions.

## Route Patterns

- Define the route container in `index.ts` (or a single registrar file).
- Put handlers in `module.ts` or feature files (`listing.ts`, `respond.ts`, etc.).
- Put shared serializers/validators/permission helpers in `shared.ts`.
- Keep auth middleware applied once at route root when possible.
- Keep response shapes consistent through serializer helpers.

## Service Patterns

- Keep orchestration in `module.ts` (or `index.ts` for very small services).
- Extract pure logic into dedicated files:
  - evaluators
  - normalizers
  - policy selectors
  - transport helpers (identity/upstream/policy layers)
- Keep side effects isolated (DB, network, logging).
- Export singleton services from `index.ts` when pattern already uses singletons.

## Import Conventions

- Import routes via `src/routes/<name>/index.js`.
- Import services via `src/services/<name>.service/index.js`.
- Use relative imports within a unit folder (`./module.js`, `./shared.js`).
- Avoid cross-feature deep imports unless explicitly shared and stable.

## Validation and Safety

- Run `pnpm -s typecheck:gateway` after structural refactors.
- Run `pnpm -s test:gateway` before merging.
- Preserve API behavior during refactor:
  - same endpoints
  - same permissions
  - same response schema
  - same error semantics

## Adding New Code

When adding a new route:
1. Create `src/routes/<name>/index.ts`.
2. Put main handlers in `module.ts`.
3. Extract shared logic to `shared.ts` if reused.
4. Export route object from `index.ts`.

When adding a new service:
1. Create `src/services/<name>.service/index.ts`.
2. Put primary logic in `module.ts`.
3. Extract pure helper logic into focused files if complexity grows.
4. Export only required public functions/types from `index.ts`.

## Refactor Trigger Checklist

Refactor into submodules when one or more are true:
- File mixes unrelated responsibilities.
- Handler/service has repeated validation/serialization logic.
- Multiple pathways share side-effect-heavy code.
- Cross-cutting concerns (policy, identity, forwarding, mapping) are tangled.
- Tests or reviews are difficult because scope is too broad.
