import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { ensureLocalStorageDirectory, loadEnvironment } from '@realitycheck/config';
import { createPrismaClient } from '@realitycheck/db';
import { createFindings, prioritizeActions } from '@realitycheck/explorer';
import { createGeminiProvider } from '@realitycheck/llm';
import {
  exploreTarget,
  PlaywrightRegressionReplayRunner,
  storePngArtifact,
} from '@realitycheck/playwright-runner';
import {
  REGRESSION_QUEUE_NAME,
  RUN_QUEUE_NAME,
  runJobDataSchema,
  type RegressionJobData,
  type RunJobData,
} from '@realitycheck/shared';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { createRegressionJobHandler } from './regression-worker.js';

if (!process.env.DATABASE_URL) {
  let dir = process.cwd();
  while (dir !== path.parse(dir).root) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      if (process.env.DATABASE_URL) break;
    }
    dir = path.dirname(dir);
  }
}

const logger = pino({ name: 'realitycheck-worker' });
const environment = loadEnvironment();
const prisma = createPrismaClient(environment.DATABASE_URL);
const connection = new Redis(environment.REDIS_URL, { maxRetriesPerRequest: null });
const regressionConnection = connection.duplicate();
const storageDirectory = ensureLocalStorageDirectory(environment);
const gemini = environment.GEMINI_API_KEY
  ? createGeminiProvider({ apiKey: environment.GEMINI_API_KEY, model: environment.GEMINI_MODEL })
  : undefined;

const runWorker = new Worker<RunJobData>(RUN_QUEUE_NAME, processRun, {
  connection,
  concurrency: environment.WORKER_CONCURRENCY,
  autorun: false,
});

const regressionRunner = new PlaywrightRegressionReplayRunner({
  navigationTimeoutMs: environment.NAVIGATION_TIMEOUT_MS,
  overallTimeoutMs: environment.RUN_TIMEOUT_MS,
  observationLimit: environment.OBSERVATION_LIMIT,
});

const regressionWorker = new Worker<RegressionJobData>(
  REGRESSION_QUEUE_NAME,
  createRegressionJobHandler({ prisma, logger, runner: regressionRunner }),
  {
    connection: regressionConnection,
    concurrency: environment.WORKER_CONCURRENCY,
    autorun: false,
  },
);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Worker shutting down');
  await Promise.all([
    runWorker.close(),
    regressionWorker.close(),
    prisma.$disconnect(),
    connection.quit(),
    regressionConnection.quit(),
  ]);
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await Promise.all([
    prisma.$queryRaw`SELECT 1`,
    runWorker.waitUntilReady(),
    regressionWorker.waitUntilReady(),
  ]);
  void runWorker.run();
  void regressionWorker.run();
  logger.info(
    {
      queues: [RUN_QUEUE_NAME, REGRESSION_QUEUE_NAME],
      concurrency: environment.WORKER_CONCURRENCY,
    },
    'Worker ready for browser execution and regression jobs',
  );
} catch (error) {
  logger.error(
    { errorType: error instanceof Error ? error.name : 'UnknownError' },
    'Worker readiness check failed',
  );
  await Promise.allSettled([
    runWorker.close(),
    regressionWorker.close(),
    prisma.$disconnect(),
    connection.quit(),
    regressionConnection.quit(),
  ]);
  process.exit(1);
}

async function processRun(job: { data: RunJobData }): Promise<void> {
  const parsed = runJobDataSchema.safeParse(job.data);
  if (!parsed.success) throw new Error('Invalid run job payload');
  const { runId } = parsed.data;

  const claim = await prisma.run.updateMany({
    where: { id: runId, status: 'QUEUED' },
    data: { status: 'RUNNING', startedAt: new Date(), error: null },
  });
  if (claim.count === 0) {
    logger.info({ runId }, 'Skipping an already-processed run job');
    return;
  }

  let journeyId: string | undefined;
  try {
    const run = await prisma.run.findUniqueOrThrow({
      where: { id: runId },
      select: { target: { select: { url: true } } },
    });
    const journey = await prisma.journey.create({
      data: { runId, name: 'Adversarial browser exploration', position: 0, status: 'RUNNING' },
    });
    journeyId = journey.id;
    await prisma.runEvent.create({
      data: { runId, type: 'RUN_STARTED', message: 'Browser execution started' },
    });

    let usedFallback = true;
    const exploration = await exploreTarget(
      run.target.url,
      {
        navigationTimeoutMs: environment.NAVIGATION_TIMEOUT_MS,
        overallTimeoutMs: environment.RUN_TIMEOUT_MS,
        observationLimit: environment.OBSERVATION_LIMIT,
        artifactMaxBytes: environment.ARTIFACT_MAX_BYTES,
        actionLimit: environment.EXPLORATION_ACTION_LIMIT,
      },
      async (page) => {
        const plan = await prioritizeActions(page, {
          provider: environment.EXPLORATION_LLM_CALL_LIMIT > 0 ? gemini : undefined,
          timeoutMs: environment.EXPLORATION_LLM_TIMEOUT_MS,
          limit: environment.EXPLORATION_ACTION_LIMIT,
        });
        usedFallback = plan.usedFallback;
        return plan.actions;
      },
    );
    const { observation } = exploration;
    const { screenshot, ...observationData } = observation;
    await prisma.runEvent.create({
      data: {
        runId,
        type: 'EXPLORATION_OBSERVATION',
        message: `Explored ${exploration.pagesExplored} states; discovered ${exploration.discoveredActions} actions and recorded ${exploration.actions.length} outcomes`,
        data: {
          ...observationData,
          pagesExplored: exploration.pagesExplored,
          discoveredActions: exploration.discoveredActions,
          noActionReason: exploration.noActionReason,
          candidateSummary: exploration.candidateSummary,
          pageSummary: exploration.pageSummary,
          usedFallback,
        },
      },
    });
    if (exploration.noActionReason) {
      await prisma.runEvent.create({
        data: { runId, type: 'EXPLORATION_NO_ACTIONS', message: exploration.noActionReason },
      });
    }

    const persistedActions = await Promise.all(
      exploration.actions.map((result, position) =>
        prisma.action.create({
          data: {
            journeyId: journey.id,
            position,
            type: result.action.kind,
            target: result.action.href ?? result.action.selector,
            status: result.status,
            detail: {
              actionId: result.action.id,
              label: result.action.label,
              beforeUrl: result.beforeUrl,
              afterUrl: result.afterUrl,
              error: result.error,
            },
          },
        }),
      ),
    );
    const actionIds = new Map(
      exploration.actions.map((result, index) => [result.action.id, persistedActions[index].id]),
    );
    const findings = createFindings({
      url: observation.finalUrl ?? run.target.url,
      actionId: null,
      pageErrors: observation.pageErrors,
      failedRequests: observation.failedRequests,
      httpErrors: observation.httpErrors,
      navigationFailed: observation.navigation.outcome === 'failed',
    });
    await Promise.all(
      findings.map((finding) =>
        prisma.finding.create({
          data: {
            runId,
            journeyId: journey.id,
            title: finding.title,
            description: JSON.stringify({
              ...finding,
              actionDbId: finding.actionId ? actionIds.get(finding.actionId) : null,
            }),
            fingerprint: finding.fingerprint,
            status: 'CANDIDATE',
          },
        }),
      ),
    );

    if (screenshot) {
      try {
        const artifact = await storePngArtifact(storageDirectory, runId, screenshot);
        await prisma.artifact.create({
          data: {
            runId,
            kind: 'OTHER',
            storageKey: artifact.storageKey,
            contentType: 'image/png',
            byteSize: artifact.byteSize,
          },
        });
      } catch {
        await prisma.runEvent.create({
          data: { runId, type: 'ARTIFACT_FAILED', message: 'Screenshot could not be stored' },
        });
      }
    }

    await prisma.$transaction([
      prisma.journey.update({ where: { id: journey.id }, data: { status: 'COMPLETED' } }),
      prisma.run.update({
        where: { id: runId },
        data: { status: 'SUCCEEDED', completedAt: new Date() },
      }),
      prisma.runEvent.create({
        data: { runId, type: 'RUN_COMPLETED', message: 'Browser execution completed' },
      }),
    ]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : 'Browser execution failed';
    await prisma.$transaction([
      ...(journeyId
        ? [prisma.journey.update({ where: { id: journeyId }, data: { status: 'FAILED' } })]
        : []),
      prisma.run.update({
        where: { id: runId },
        data: { status: 'FAILED', completedAt: new Date(), error: message },
      }),
      prisma.runEvent.create({ data: { runId, type: 'RUN_FAILED', message } }),
    ]);
    logger.error({ runId, errorCategory: message }, 'Run failed');
  }
}
