/**
 * modules/electron/src/main.ts
 *
 * @file Electron main process entry point. Sets up IPC handlers for display data and version info, creates the main
 * application window, and wires up the display demo window lifecycle.
 *
 * @author Martin Burchard
 */
import type {Display, Versions} from '@common/definitions.js';
import type {BrowserWindow} from 'electron';
import process from 'node:process';
import {IpcChannels} from '@common/definitions.js';
import {app} from 'electron';
import {broadcast, handleFromRenderer, onFromRenderer} from './ipc.js';
import {getLogger} from './logging/index.js';
import {DISPLAY_WATCHER} from './utils/DisplayWatcher.js';
import {createWindow} from './WindowManager.js';

const log = getLogger('electron.main');

app.whenReady().then(async () => {
  let mainWindow: BrowserWindow | undefined;

  handleFromRenderer(IpcChannels.getDisplayData, (): Display[] => {
    return DISPLAY_WATCHER.getDisplays();
  });

  DISPLAY_WATCHER.on('update', (displays: Display[]) => {
    broadcast(IpcChannels.updateDisplayData, displays);
  });

  handleFromRenderer(IpcChannels.getVersions, (): Versions => {
    return {
      chrome: process.versions.chrome,
      electron: process.versions.electron,
      node: process.versions.node,
    };
  });

  onFromRenderer(IpcChannels.showDisplayDemo, async () => {
    try {
      log.debug('show display demo');
      const displayDemoWindow = await createWindow({
        contentPage: 'displayDemo',
        windowOptions: {
          height: 768,
          width: 1024,
        },
        withDevTools: true,
      });
      if (mainWindow) {
        mainWindow.hide();
      }

      displayDemoWindow?.on('closed', () => {
        log.debug('Display demo closed, showing main window');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
        }
      });
    } catch (e) {
      log.error('error during show display demo', e);
    }
  });

  mainWindow = await createWindow({
    contentPage: 'main',
    windowOptions: {
      height: 768,
      width: 1024,
    },
    withDevTools: true,
  });

  log.debug('Electron app is ready');
}).catch(reason => log.error('error during electron app ready:', reason));
