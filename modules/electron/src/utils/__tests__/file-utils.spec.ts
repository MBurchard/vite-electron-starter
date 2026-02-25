import {describe, expect, it} from 'vitest';
import {fileExists} from '../file-utils.js';

describe('fileExists', () => {
  it('should return true for existing files', async () => {
    expect(await fileExists(import.meta.filename)).toBe(true);
  });

  it('should return false for non-existing files', async () => {
    expect(await fileExists('/does/not/exist.txt')).toBe(false);
  });
});
