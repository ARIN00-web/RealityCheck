import { PrismaClient } from '@prisma/client';

export { PrismaClient } from '@prisma/client';
export * from '@prisma/client';

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
}
