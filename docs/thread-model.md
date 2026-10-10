# Threat model

## Assets

- Operator credentials and provider API keys.
- Authorized target applications and any test data they expose.
- Run history, screenshots, traces, generated tests, and browser logs.
- Availability of PostgreSQL, Redis, the API, and workers.

## Primary threats and controls

| Threat                                                | Control                                                                                                                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-side request forgery through target navigation | Worker navigation permits resolved public HTTP(S) addresses only and rechecks routed requests. A deployment egress proxy is still required for full DNS-rebinding protection. |
| Secret leakage into Git, logs, or evidence            | `.env` is ignored, only `.env.example` is committed, and configuration errors identify names rather than values.                                                              |
| A runaway or stale browser process                    | Worker jobs use bounded navigation/overall timeouts and `finally` cleanup for contexts and browsers.                                                                          |
| False positive findings                               | Future verification will reproduce the action sequence in a fresh browser context before a finding becomes verified.                                                          |
| Regression tests that hide the original bug           | A generated test must demonstrate the baseline failure before it can mark a post-fix run resolved.                                                                            |
| Queue or database outage misreported as healthy       | `/health/live` is process-only; `/health/ready` independently pings PostgreSQL and Redis and returns HTTP 503 when either is unavailable.                                     |

## Non-goals for this foundation

This repository does not yet conduct browser exploration, AI planning, vulnerability scanning, penetration testing, load testing, or automatic fixes.
