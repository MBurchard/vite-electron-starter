/**
 * modules/electron/src/utils/file-utils.ts
 *
 * @file Filesystem utility functions for common operations like existence checks and directory creation.
 *
 * @author Martin Burchard
 */
import fs from 'node:fs/promises';

/**
 * Check whether a file or directory exists at the given path.
 *
 * @param path - Absolute or relative path to check.
 * @returns True if the path is accessible, false if it does not exist.
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch (e) {
    /* v8 ignore else -- unexpected fs error; re-thrown to caller @preserve */
    if (e.code === 'ENOENT') {
      return false;
    }
    /* v8 ignore next @preserve */
    throw e;
  }
}

/**
 * Create a directory (and any missing parents) at the given path.
 *
 * @param path - Absolute or relative path to create.
 * @returns The first directory path created, or undefined if it already existed.
 */
export async function mkDir(path: string): Promise<string | undefined> {
  return fs.mkdir(path, {recursive: true});
}
