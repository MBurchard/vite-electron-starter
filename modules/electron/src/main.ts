import type {Versions} from '@common/core/versions.js';
import process from 'node:process';
/**
 * modules/electron/src/main.ts
 *
 * @file Electron main process entry point. Sets up IPC handlers for display data, version info, and the dialog
 * system, creates the main application window, and wires up demo window lifecycle via demo handlers.
 *
 * @author Martin Burchard
 */
import {CoreIpcChannels} from '@common/core/ipc.js';
import {app} from 'electron';
import {registerDisplayDemoHandlers} from './demo/displayDemo.js';
import {handleFromRenderer} from './ipc.js';
import {getLogger} from './logging/index.js';
import {createWindow} from './windowMgt/WindowManager.js';

const log = getLogger('electron.main');

app.whenReady().then(() => {
  handleFromRenderer(CoreIpcChannels.getVersions, (): Versions => {
    return {
      chrome: process.versions.chrome,
      electron: process.versions.electron,
      node: process.versions.node,
    };
  });

  // ---- Main Window ----

  const mainController = createWindow({
    contentPage: 'main',
    windowOptions: {
      height: 768,
      width: 1024,
    },
  });

  if (!mainController) {
    throw new Error('Main window could not be created');
  }

  mainController.whenWindowReady.then(() => {
    registerDisplayDemoHandlers(mainController.browserWindow);
    log.debug('Electron app is ready');
  }).catch((reason) => {
    log.error('Main window failed to load:', reason);
  });
}).catch(reason => log.error('error during electron app ready:', reason));
