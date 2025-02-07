import path from 'node:path';
import {app} from 'electron';

export function getLogPath(): string {
  return path.resolve(app.getPath('userData'), 'logs');
}
