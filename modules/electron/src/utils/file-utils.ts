import fs from 'node:fs/promises';

export async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') {
      return false;
    }
    throw e;
  }
}

export async function mkDir(path: string): Promise<string | undefined> {
  return fs.mkdir(path, {recursive: true});
}
