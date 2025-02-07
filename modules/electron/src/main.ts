import type {Display, Versions} from '@common/definitions.js';
import type {BrowserWindow} from 'electron';
import process from 'node:process';
import {app} from 'electron';
import {registerFrontendHandler, registerFrontendListener, sendFrontend} from './ipc.js';
import {getLogger} from './logging.js';
import {createWindow, DISPLAY_WATCHER} from './WindowManager.js';

const log = getLogger('electron.main');

// async function showDemoPopup() {
//   try {
//     log.debug('showDemoPopup');
//     const win = await createWindow({
//       contentPage: 'popup',
//       windowOptions: {
//         frame: false,
//         height: 200,
//         movable: false,
//         transparent: true,
//         width: 400,
//       },
//       withDevTools: true,
//     });
//     setTimeout(() => {
//       if (win && !win.isDestroyed()) {
//         win.close();
//       }
//     }, 60000);
//   } catch (e) {
//     log.error('showDemoPopup', e);
//   }
// }

app.whenReady().then(async () => {
  let mainWindow: BrowserWindow | undefined;

  registerFrontendHandler('getDisplayData', (): Display[] => {
    return DISPLAY_WATCHER.getDisplays();
  });

  DISPLAY_WATCHER.on('update', (displays: Display[]) => {
    sendFrontend('updateDisplayData', displays);
  });

  registerFrontendHandler('getVersions', (): Versions => {
    return {
      chrome: process.versions.chrome,
      electron: process.versions.electron,
      node: process.versions.node,
    };
  });

  registerFrontendListener('showDisplayDemo', async () => {
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
