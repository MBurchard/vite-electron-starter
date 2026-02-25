/**
 * modules/electron/src/utils/electron-utils.ts
 *
 * @file Electron-specific utility functions that depend on the `app` module and can only run in the main process.
 *
 * @author Martin Burchard
 */
import {app} from 'electron';

/**
 * Return the platform-specific log directory for this application. Delegates to Electron's `app.getPath('logs')`
 * which resolves to `~/Library/Logs/<app-name>` on macOS, `%USERPROFILE%\AppData\Roaming\<app-name>\logs` on Windows.
 *
 * @returns Absolute path to the log directory.
 */
export function getLogPath(): string {
  return app.getPath('logs');
}
