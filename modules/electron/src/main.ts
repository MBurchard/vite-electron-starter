import type {Versions} from '@common/definitions.js';
import process from 'node:process';
import {app} from 'electron';
import {createWindow, getLogPath, registerFrontendHandler, registerFrontendListener} from './electron-utils.js';
import {doFrontendLogging, getLogger, setupApplicationLogging} from './logging.js';

const log = getLogger('electron.main');

app.whenReady().then(async () => {
  registerFrontendHandler('getVersions', (): Versions => {
    return {
      chrome: process.versions.chrome,
      electron: process.versions.electron,
      node: process.versions.node,
    };
  });
  await createWindow({
    contentPage: 'main',
    windowOptions: {
      height: 768,
      width: 1024,
    },
    withDevTools: true,
  });
  log.debug('Electron app is ready');
}).catch(reason => log.error('error during electron app ready:', reason));
