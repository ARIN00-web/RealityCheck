# RealityCheck — Hackathon Demo Guide

RealityCheck is an adversarial QA agent for AI-built software. It explores web applications using headless Playwright, discovers candidate bugs, verifies findings with supporting evidence, generates deterministic regression tests, replays them safely, tracks historical execution attempts, and computes attempt comparisons ($N$ vs $N-1$).

---

## 1. Prerequisites & Environment Configuration

### System Requirements

- **Node.js**: `>= 22.0.0`
- **pnpm**: `pnpm@10.x`
- **Docker & Docker Compose**: Required for PostgreSQL and Redis
- **Playwright Chromium**: Installed via `pnpm playwright:install`

### Environment Variables (`.env`)

Create a `.env` file in the repository root based on `.env.example`:

```env
# PostgreSQL & Redis infrastructure
DATABASE_URL=postgresql://realitycheck:realitycheck@localhost:5433/realitycheck?schema=public
REDIS_URL=redis://localhost:6380
ARTIFACT_STORAGE_PATH=./storage

# Runtime settings
API_PORT=3001
WORKER_CONCURRENCY=1

# Optional: Gemini API key for LLM-assisted exploration action prioritization
# GEMINI_API_KEY=your_gemini_api_key_here
# GEMINI_MODEL=gemini-2.5-flash
```

> [!NOTE]
> Sensitive credentials (passwords, tokens, query strings) are automatically redacted in URLs and sanitized in failure logs. Do not commit actual secrets to version control.

---

## 2. Starting Infrastructure and Application

### Step 1: Start PostgreSQL and Redis

```bash
pnpm dev:infra
```

This boots:

- PostgreSQL 16 on `localhost:5433`
- Redis 7 on `localhost:6380`
- Local web fixture container (`welcome-to-docker`) on `localhost:8088`

Verify infrastructure health:

```bash
docker compose -f infra/docker-compose.yml ps
```

### Step 2: Apply Database Schema & Seed

```bash
pnpm db:migrate
```

### Step 3: Install Playwright Browsers (if not already installed)

```bash
pnpm playwright:install
```

### Step 4: Start All Services (Web, Fastify API, BullMQ Worker)

```bash
pnpm dev
```

`pnpm dev` builds all workspace packages and launches:

- **Web Dashboard**: [http://localhost:3000](http://localhost:3000)
- **Fastify API**: [http://localhost:3001](http://localhost:3001) (API readiness check at `/health/ready`)
- **Background Worker**: Processing queues `run-jobs` and `regression-jobs` via BullMQ

---

## 3. Verified Endpoints & Local URLs

| Service / View      | URL                                          | Purpose                                                                        |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| **Web Dashboard**   | `http://localhost:3000`                      | Target list, run history, and navigation                                       |
| **Target Detail**   | `http://localhost:3000/targets/:id`          | Trigger exploration runs, view regression tests and eligible findings          |
| **Run Detail**      | `http://localhost:3000/runs/:id`             | Live run status, browser observations, journey actions, and candidate findings |
| **Regression Test** | `http://localhost:3000/regression-tests/:id` | Stored specification, rerun button, comparison card, execution attempts        |
| **API Health**      | `http://localhost:3001/health/ready`         | Verifies PostgreSQL and Redis connectivity                                     |
| **API Proxy**       | `http://localhost:3000/api/*`                | Proxied transparently to Fastify API (`:3001`)                                 |

---

## 4. Recommended Live Demo Sequence

Follow this end-to-end path during the presentation to demonstrate all core features:

### Step 1: Open the Dashboard

1. Navigate to [http://localhost:3000](http://localhost:3000).
2. Show the registered targets (or add a new target like `https://automationexercise.com/` or `https://demo.playwright.dev/todomvc/`).
3. Click on a target to view its target history.

### Step 2: Start an Adversarial Exploration Run

1. On the Target Detail page (`/targets/:id`), click **"Start browser run"**.
2. Observe the status transitions: `QUEUED` → `RUNNING` → `SUCCEEDED`.
3. Click into the run link (`/runs/:id`) to inspect:
   - **Browser observations**: HTTP status, navigation latency, console/network instrumentation.
   - **Actions and outcomes**: Discovered interaction elements (buttons, links, inputs) and executed actions.
   - **Candidate findings**: Uncaught page crashes, HTTP 5xx responses, or network failures with sanitized reproduction steps.

### Step 3: Verify Findings & Create a Deterministic Regression Test

1. On `/runs/:id` or `/targets/:id`, review discovered candidate findings.
2. Click **"Verify finding"** to mark the candidate finding as `VERIFIED` with a cryptographic audit timestamp.
3. Return to the Target Detail page (`/targets/:id`) under **"Findings eligible for regression testing"**.
4. Click **"Create regression test"** next to the eligible finding.
   - The engine generates a versioned specification containing safe replay steps (`navigate`, `click`, `fill`) and a deterministic assertion (`absence_of_recorded_browser_error` or `http_status_not_5xx`).
5. The new regression test appears immediately under **"Regression tests"**.

### Step 4: Execute Real Playwright Regression Replay

1. Click **"View test & history →"** to enter the Regression Test page (`/regression-tests/:id`).
2. Point out:
   - **Stored specification details**: Version 1, initial URL, deterministic interaction sequence, and assertion kind.
   - **Initial comparison state**: Displays `NO_PREDECESSOR` baseline notice.
3. Click **"Run test"**.
   - BullMQ enqueues a job for the worker.
   - The production worker invokes `PlaywrightRegressionReplayRunner`.
   - Chromium executes the steps in headless mode, asserts browser state, catches errors/status codes, and logs individual assertion results.
4. Watch the 3-second live polling update the attempt status to `PASSED` or `FAILED`.
5. Expand the attempt under **"Execution attempts"** to show:
   - Attempt number (#1), start time, duration.
   - Sanitized failure reason (if failed) with credentials redacted.
   - Assertion evaluation checklist.

### Step 5: Rerun Test & Inspect Attempt Comparison ($N$ vs $N-1$)

1. Click **"Rerun test"** on the same regression test.
   - Demonstrates that the exact stored specification is reused without regeneration.
   - Attempt #2 is queued and executed while attempt #1 history remains completely preserved.
2. When attempt #2 completes, point to the top **Comparison Card**:
   - Compares Attempt #2 with Attempt #1 ($N$ vs $N-1$).
   - Displays verdict badges:
     - `RECOVERED` (Bug fixed: failed → passed)
     - `REGRESSED` (Regression detected: passed → failed)
     - `UNCHANGED` (Consistent behavior: passed → passed or failed → failed)
     - `INCONCLUSIVE` (Insufficient evidence or runtime execution crash)
   - Detailed assertion outcome counts (`passed`, `failed`, `changed`, `unchanged`).
3. Click **"Rerun test"** rapidly or in another tab to show **Conflict Prevention**:
   - Rejects concurrent duplicate runs with `409 ACTIVE_EXECUTION_EXISTS`, preventing race conditions.

---

## 5. Safe Targets & Controlled Test Fixtures

- **Controlled Local Container**: `http://localhost:8088` (included in `docker-compose.yml`, runs `docker/welcome-to-docker`).
- **External Public Targets**:
  - `https://demo.playwright.dev/todomvc/`: Clean benchmark target with interactive inputs.
  - `https://automationexercise.com/`: E-commerce target with rich catalog navigation and candidate findings.

---

## 6. Known Limitations & Troubleshooting

1. **Dashboard port 3000 in use**:
   - If port 3000 is occupied, kill the existing process or start Next.js with `PORT=3002 pnpm dev`.
2. **PostgreSQL / Redis connection refused**:
   - Ensure Docker is running and run `pnpm dev:infra`. Check container health with `docker compose -f infra/docker-compose.yml ps`.
3. **Playwright browser missing**:
   - Run `pnpm playwright:install` to download Chromium.
4. **Third-party website rate limiting / Cloudflare blocks**:
   - Remote target websites may occasionally return 403 or Cloudflare challenges. Use the controlled local fixture on port 8088 or TodoMVC for deterministic offline demonstrations.
