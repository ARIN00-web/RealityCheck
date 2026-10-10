# Reality Check

Reality Check is the foundation for an adversarial QA engineer for AI-built web applications. This stage provides a TypeScript monorepo, local PostgreSQL/Redis infrastructure, health endpoints, database schema, and a worker readiness process. It deliberately does **not** yet explore browsers, plan with AI, detect bugs, or generate regression tests.

## Prerequisites

- Node.js 22 or newer
- pnpm 10.17 or newer
- Docker Desktop / Docker Compose for local PostgreSQL and Redis

## Install and configure

```bash
pnpm install
cp .env.example .env
pnpm dev:infra
pnpm db:migrate -- --name initial_schema
pnpm db:generate
```

The default `.env.example` uses local Docker services and writes development evidence below `./storage`.
`GEMINI_API_KEY` is optional and is not needed for deterministic operation. To enable future
Gemini-assisted capabilities, create a key in Google AI Studio, add it to your untracked `.env`,
and optionally override the default `GEMINI_MODEL=gemini-2.5-flash`.

## Run locally

Start all processes:

```bash
pnpm dev
```

`pnpm dev` first builds the shared runtime packages required by the API and worker.
The dashboard proxies `/api/*` to `http://localhost:3001` by default. Set `API_BASE_URL` in the
web deployment environment when the API is hosted elsewhere.

Or start them separately:

```bash
pnpm --filter @realitycheck/web dev
pnpm --filter @realitycheck/api dev
pnpm --filter @realitycheck/worker dev
```

- Dashboard: `http://localhost:3000`
- API liveness: `http://localhost:3001/health/live`
- API readiness: `http://localhost:3001/health/ready`

`/health/live` returns 200 when the API process is alive. `/health/ready` only returns 200 when both PostgreSQL and Redis respond; otherwise it returns 503 with component status only.

## Infrastructure lifecycle

```bash
pnpm dev:infra
docker compose -f infra/docker-compose.yml ps
pnpm logs:infra
pnpm down:infra
```

Compose publishes PostgreSQL and Redis only on loopback. To remove local volumes intentionally, run Docker Compose with its `--volumes` option; that is not part of the normal shutdown command.

## Database

Create a local migration after changing the Prisma schema:

```bash
pnpm db:migrate -- --name descriptive_migration_name
```

Apply committed migrations in a deployment-like environment:

```bash
pnpm db:deploy
```

## Checks and builds

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm playwright:install
```

The browser install command installs Chromium prerequisites/binaries for worker execution.

## Browser run foundation

`POST /api/targets/:id/runs` creates a persisted queued run and dispatches it through Redis/BullMQ.
The worker atomically claims queued runs, captures a single Chromium page observation, records lifecycle and
browser events, stores an optional PNG screenshot below `ARTIFACT_STORAGE_PATH`, and marks the run succeeded
or failed. The dashboard exposes target, run, and artifact detail views.

The browser worker uses these bounded settings (defaults shown in `.env.example`): `RUN_TIMEOUT_MS`,
`NAVIGATION_TIMEOUT_MS`, `OBSERVATION_LIMIT`, `ARTIFACT_MAX_BYTES`, `EXPLORATION_ACTION_LIMIT`,
`EXPLORATION_LLM_CALL_LIMIT`, and `EXPLORATION_LLM_TIMEOUT_MS`. Exploration is same-origin and
conservative: it considers links and non-form buttons, rejects destructive wording, and records
candidate findings rather than confirmed defects. Gemini only prioritizes an existing allow-list of
safe actions; deterministic prioritization is used whenever Gemini is unavailable.

For safety, navigation permits HTTP(S) destinations only and rejects URL credentials, localhost, loopback,
private, link-local, and IPv4-mapped private addresses. DNS is checked before navigation and again through
Playwright request routing. This is defense in depth, not comprehensive SSRF protection: DNS rebinding between
validation and connection, browser/proxy behavior outside Playwright routing, and a dedicated egress proxy remain
deployment concerns.

## Known limitations

- Browser execution observes one navigation only. It does not click, submit forms, classify findings, or create regression tests.
- Screenshot and observation history are available only after a worker has processed a queued run.
- Docker availability and browser dependencies are environment-specific and must be checked locally.

See [architecture.md](docs/architecture.md) and [thread-model.md](docs/thread-model.md) for the initial architecture and security model.
