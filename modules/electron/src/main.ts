import type {Versions} from '@common/definitions.js';
import process from 'node:process';
import {app} from 'electron';
import {createWindow, getLogPath, registerFrontendHandler, registerFrontendListener} from './electron-utils.js';
import {getLogger, setupApplicationLogging} from './logging.js';

const log = getLogger('electron.main');

app.whenReady().then(async () => {
  await setupApplicationLogging(getLogPath());
  log.debug('Electron app is ready');
  registerFrontendListener('test-channel', () => {
    log.debug('frontend emitted on test-channel');
  });
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
}).catch(reason => log.error('error during electron app ready:', reason));
