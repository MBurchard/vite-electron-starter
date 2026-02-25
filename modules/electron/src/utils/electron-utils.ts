import {app} from 'electron';

/**
 * Return the platform-specific log directory for this application.
 * Delegates to Electron's `app.getPath('logs')` which resolves to
 * `~/Library/Logs/<app-name>` on macOS, `%USERPROFILE%\AppData\Roaming\<app-name>\logs` on Windows.
 */
export function getLogPath(): string {
  return app.getPath('logs');
}
