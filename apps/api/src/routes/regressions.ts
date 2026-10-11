import {
  executionComparisonSchema,
  regressionEligibilitySchema,
  regressionExecutionSchema,
  regressionTestSchema,
} from '@realitycheck/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { RegressionQueue } from '../queue.js';
import type { createRegressionRepository } from '../regressions.js';

export function registerRegressionRoutes(
  app: FastifyInstance,
  repository: ReturnType<typeof createRegressionRepository>,
  queue?: RegressionQueue,
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

  app.post('/api/findings/:id/verify', async (request, reply) => {
    const id = (request.params as { id?: string }).id;
    if (!id) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: 'A finding ID is required' } });
    }
    const verified = await repository.verifyFinding(id);
    if (!verified) {
      return reply
        .code(404)
        .send({ error: { code: 'FINDING_NOT_FOUND', message: 'Finding not found' } });
    }
    return reply.code(200).send(verified);
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

  const handleExecuteRegression = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const id = request.params.id;
    if (!id) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'A regression test ID is required' },
      });
    }

    const result = await repository.createQueuedExecution(id);
    if (result.kind === 'not_found') {
      return reply.code(404).send({
        error: { code: 'REGRESSION_TEST_NOT_FOUND', message: 'Regression test not found' },
      });
    }
    if (result.kind === 'invalid_specification') {
      return reply.code(422).send({
        error: {
          code: 'INVALID_SPECIFICATION',
          message: 'Persisted regression test specification is invalid',
        },
      });
    }
    if (result.kind === 'active_conflict') {
      return reply.code(409).send({
        error: {
          code: 'ACTIVE_EXECUTION_EXISTS',
          message: 'An active execution is already queued or running for this regression test',
        },
      });
    }

    const execution = result.execution;
    if (queue) {
      try {
        await queue.enqueue(id, execution.id);
      } catch {
        const failedExecution = await repository.failQueueing(
          execution.id,
          'Regression test execution could not be queued',
        );
        return reply.code(503).send({
          error: {
            code: 'QUEUE_UNAVAILABLE',
            message: 'Regression test execution could not be queued',
          },
          execution: regressionExecutionSchema.parse(failedExecution),
        });
      }
    }

    return reply.code(201).send(regressionExecutionSchema.parse(execution));
  };

  app.post('/api/regression-tests/:id/executions', handleExecuteRegression);
  app.post('/api/regression-tests/:id/runs', handleExecuteRegression);

  app.get('/api/regression-tests/:id/executions', async (request, reply) => {
    const id = (request.params as { id?: string }).id;
    if (!id) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'A regression test ID is required' },
      });
    }
    const executions = await repository.listExecutions(id);
    return regressionExecutionSchema.array().parse(executions);
  });

  app.get('/api/regression-executions/:id', async (request, reply) => {
    const id = (request.params as { id?: string }).id;
    if (!id) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'An execution ID is required' },
      });
    }
    const execution = await repository.findExecution(id);
    return execution
      ? regressionExecutionSchema.parse(execution)
      : reply.code(404).send({
          error: {
            code: 'REGRESSION_EXECUTION_NOT_FOUND',
            message: 'Regression execution not found',
          },
        });
  });

  app.get('/api/regression-tests/:id/comparison', async (request, reply) => {
    const id = (request.params as { id?: string }).id;
    if (!id) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'A regression test ID is required' },
      });
    }
    const test = await repository.find(id);
    if (!test) {
      return reply.code(404).send({
        error: { code: 'REGRESSION_TEST_NOT_FOUND', message: 'Regression test not found' },
      });
    }
    const comparison = await repository.compareExecutions(id);
    if (!comparison) {
      return reply.code(404).send({
        error: {
          code: 'NO_EXECUTIONS_RECORDED',
          message: 'No executions recorded for this regression test',
        },
      });
    }
    return executionComparisonSchema.parse(comparison);
  });
}
