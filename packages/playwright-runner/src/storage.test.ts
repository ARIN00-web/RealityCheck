import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { storePngArtifact } from './storage.js';

describe('artifact storage', () => {
  it('writes a generated run artifact below the configured root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'realitycheck-'));
    const artifact = await storePngArtifact(root, 'run123', Buffer.from('png'));

    expect(artifact.storageKey).toBe('runs/run123/screenshot.png');
    expect(await fs.readFile(path.join(root, artifact.storageKey), 'utf8')).toBe('png');
  });

  it('rejects unsafe run identifiers', async () => {
    await expect(storePngArtifact('/tmp', '../escape', Buffer.from('png'))).rejects.toThrow(
      'Invalid',
    );
  });
});
