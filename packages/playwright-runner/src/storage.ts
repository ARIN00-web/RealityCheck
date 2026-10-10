import fs from 'node:fs/promises';
import path from 'node:path';

export type StoredArtifact = { storageKey: string; byteSize: number };

export async function storePngArtifact(
  rootDirectory: string,
  runId: string,
  content: Buffer,
): Promise<StoredArtifact> {
  if (!/^[a-z0-9]+$/i.test(runId)) throw new Error('Invalid generated run identifier');
  const storageKey = path.posix.join('runs', runId, 'screenshot.png');
  const root = path.resolve(rootDirectory);
  const destination = path.resolve(root, storageKey);
  if (!destination.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe artifact path');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, content, { flag: 'w' });
  return { storageKey, byteSize: content.byteLength };
}
