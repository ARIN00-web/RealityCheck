import { regressionEligibilitySchema, regressionTestSchema } from '@realitycheck/shared';
import type { FastifyInstance } from 'fastify';
import type { createRegressionRepository } from '../regressions.js';
export function registerRegressionRoutes(
  app: FastifyInstance,
  repository: ReturnType<typeof createRegressionRepository>,
): void {
  app.get('/api/targets/:id/regression-findings', async (request, reply) => {
    const id = (request.params as { id?: string }).id;
    if (!id)
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: 'A target ID is required' } });
    return regressionEligibilitySchema.array().parse(await repository.listFindings(id));
  });
  app.post('/api/findings/:id/regression-test', async (request, reply) => {
    const id = (request.params as { id?: string }).id;
    if (!id)
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: 'A finding ID is required' } });
    try {
      const test = await repository.generate(id);
      if (!test)
        return reply
          .code(404)
          .send({ error: { code: 'FINDING_NOT_FOUND', message: 'Finding not found' } });
      return reply.code(201).send(regressionTestSchema.parse(test));
    } catch {
      return reply.code(422).send({
        error: {
          code: 'FINDING_INELIGIBLE',
          message: 'Finding is not eligible for a deterministic regression test',
        },
      });
    }
  });
  app.get('/api/targets/:id/regression-tests', async (request, reply) =>
    regressionTestSchema
      .array()
      .parse(await repository.list((request.params as { id: string }).id)),
  );
  app.get('/api/regression-tests/:id', async (request, reply) => {
    const test = await repository.find((request.params as { id: string }).id);
    return test
      ? regressionTestSchema.parse(test)
      : reply.code(404).send({
          error: { code: 'REGRESSION_TEST_NOT_FOUND', message: 'Regression test not found' },
        });
  });
}
