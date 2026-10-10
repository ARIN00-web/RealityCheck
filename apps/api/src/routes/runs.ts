import { runDetailSchema, runListItemSchema } from '@realitycheck/shared';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { RunQueue } from '../queue.js';
import type { RunRepository } from '../runs.js';

export function registerRunRoutes(
  app: FastifyInstance,
  repository: RunRepository,
  queue: RunQueue,
  artifactStoragePath: string,
): void {
  app.post('/api/targets/:id/runs', async (request, reply) => {
    const id = (request.params as { id?: string }).id;
    if (!id) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: 'A target ID is required' } });
    }

    const run = await repository.createQueuedRun(id);
    if (!run) {
      return reply
        .code(404)
        .send({ error: { code: 'TARGET_NOT_FOUND', message: 'Target not found' } });
    }

    try {
      await queue.enqueue(run.id);
    } catch {
      const failedRun = await repository.failQueueing(run.id);
      return reply.code(503).send({
        error: { code: 'QUEUE_UNAVAILABLE', message: 'Run could not be queued' },
        run: runListItemSchema.parse(failedRun),
      });
    }

    return reply.code(201).send(runListItemSchema.parse(run));
  });

  app.get('/api/runs/:id', async (request, reply) => {
    const id = (request.params as { id?: string }).id;
    if (!id) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: 'A run ID is required' } });
    }
    const run = await repository.findRun(id);
    if (!run)
      return reply.code(404).send({ error: { code: 'RUN_NOT_FOUND', message: 'Run not found' } });
    return runDetailSchema.parse(run);
  });

  app.get('/api/runs/:runId/artifacts/:artifactId', async (request, reply) => {
    const { runId, artifactId } = request.params as { runId?: string; artifactId?: string };
    if (!runId || !artifactId) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Run and artifact IDs are required' },
      });
    }
    const artifact = await repository.findArtifact(runId, artifactId);
    if (!artifact)
      return reply
        .code(404)
        .send({ error: { code: 'ARTIFACT_NOT_FOUND', message: 'Artifact not found' } });
    const root = path.resolve(artifactStoragePath);
    const filePath = path.resolve(root, artifact.storageKey);
    if (!filePath.startsWith(`${root}${path.sep}`)) {
      return reply
        .code(404)
        .send({ error: { code: 'ARTIFACT_NOT_FOUND', message: 'Artifact not found' } });
    }
    try {
      return reply
        .type(artifact.contentType ?? 'application/octet-stream')
        .send(await fs.readFile(filePath));
    } catch {
      return reply
        .code(404)
        .send({ error: { code: 'ARTIFACT_NOT_FOUND', message: 'Artifact not found' } });
    }
  });
}
