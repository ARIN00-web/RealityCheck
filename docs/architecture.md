# Architecture

Reality Check is a TypeScript pnpm monorepo. The `web` app is the operator dashboard, `api` is a Fastify process for request/response work, and `worker` is an independently deployed process for long-running jobs. Redis and BullMQ provide the durable job boundary; PostgreSQL and Prisma store durable records; evidence belongs in local storage during development and object storage in production.

The foundation intentionally starts no browser jobs. When browser work is added, only the worker may create Playwright browser processes. API handlers must enqueue work and return promptly.

## Data choices

- `Target` and `Run` establish the ownership boundary for all run data.
- `RunEvent` is append-only progress/history.
- A `Journey` has ordered `Action` records so a verified failure can later be reproduced.
- `Finding` is independent from evidence: a finding can be a candidate, verified, or inconclusive without changing evidence records.
- Binary payloads are not placed in PostgreSQL. `Evidence` and `Artifact` retain storage keys and compact metadata.
- `RegressionTest` links a finding to its generated source artifact; executions are immutable historical records.

## Security assumptions

- Target applications are explicitly authorized by the operator. Future navigation must enforce a strict target-origin allowlist and block private, loopback, link-local, and metadata network ranges by default.
- Test credentials and API keys are secrets. They must be supplied through runtime environment configuration, never source control, logs, or generated artifacts.
- Browser automation will run with a dedicated non-privileged worker identity. It must enforce action and time budgets, and avoid irreversible operations by default.
- The API readiness endpoint reveals only component state, never connection strings, credentials, or raw infrastructure errors.
