import {
  createTargetRequestSchema,
  runListItemSchema,
  targetDetailSchema,
  targetSummarySchema,
} from '@realitycheck/shared';
import type { FastifyInstance } from 'fastify';
import type { TargetRepository } from '../targets.js';

export function registerTargetRoutes(app: FastifyInstance, repository: TargetRepository): void {
  app.get('/api/targets', async () =>
    targetSummarySchema.array().parse(await repository.listTargets()),
  );

  app.post('/api/target', async (request, reply) => {
    const parsed = createTargetRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues[0]?.message ?? 'Invalid target request',
        },
      });
    }

    const target = targetSummarySchema.parse(await repository.createTarget(parsed.data));
    return reply.code(201).send(target);
  });

  app.get('/api/targets/:id', async (request, reply) => {
    const id = (request.params as { id?: string }).id;
    if (!id) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'A target ID is required' },
      });
    }

    const target = await repository.findTarget(id);
    if (!target) {
      return reply.code(404).send({
        error: { code: 'TARGET_NOT_FOUND', message: 'Target not found' },
      });
    }

    return targetDetailSchema.parse(target);
  });

  app.get('/api/runs', async () => runListItemSchema.array().parse(await repository.listRuns()));
}
