/**
 * modules/electron/src/utils/__tests__/file-utils.spec.ts
 *
 * @file Tests for file-utils covering existence checks and directory creation.
 */
import {existsSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {fileExists, mkDir} from '../file-utils.js';

describe('fileExists', () => {
  it('should return true for existing files', async () => {
    expect(await fileExists(import.meta.filename)).toBe(true);
  });

  it('should return false for non-existing files', async () => {
    expect(await fileExists('/does/not/exist.txt')).toBe(false);
  });
});

describe('mkDir', () => {
  let testDir: string;

  afterEach(async () => {
    if (testDir && existsSync(testDir)) {
      await rm(testDir, {recursive: true, force: true});
    }
  });

  it('should create a new directory and return the created path', async () => {
    testDir = path.join(tmpdir(), `file-utils-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const result = await mkDir(testDir);

    expect(existsSync(testDir)).toBe(true);
    expect(result).toBe(testDir);
  });

  it('should return undefined for an already existing directory', async () => {
    testDir = path.join(tmpdir(), `file-utils-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkDir(testDir);
    const result = await mkDir(testDir);

    expect(result).toBeUndefined();
  });
});
