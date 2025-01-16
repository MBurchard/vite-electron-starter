import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {doSth} from '@common/someutil.js';
import {configureLogging, useLog} from '@mburchard/bit-log';
import {ConsoleAppender} from '@mburchard/bit-log/dist/appender/ConsoleAppender.js';
import {LogLevel} from '@mburchard/bit-log/dist/definitions.js';
import {app, BrowserWindow} from 'electron';
import {doSth2} from './submodule/sub.js';

configureLogging({
  appender: {
    CONSOLE: {
      Class: ConsoleAppender,
      colored: true,
    },
  },
  root: {
    appender: ['CONSOLE'],
    level: 'DEBUG',
  },
});

const log = useLog('electron.main', LogLevel.DEBUG);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createMainWindow() {
  const preloadJS = path.join(__dirname, 'preload.js');
  log.debug('loading preload script:', preloadJS);
  const win = new BrowserWindow({
    height: 600,
    width: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadJS,
      sandbox: true,
      webviewTag: false,
    },
  });
  win.webContents.openDevTools();
  if (process.env.NODE_ENV === 'development' && process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(`${process.env.VITE_DEV_SERVER_URL}main`);
  }
}

async function createPopupWindow() {
  const preloadJS = path.join(__dirname, 'preload.js');
  log.debug('loading preload script:', preloadJS);
  const win = new BrowserWindow({
    height: 400,
    width: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadJS,
      sandbox: true,
      webviewTag: false,
    },
  });
  win.webContents.openDevTools();
  if (process.env.NODE_ENV === 'development' && process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(`${process.env.VITE_DEV_SERVER_URL}popup`);
  }
}

log.debug('Hallo Welt');

const test = doSth2('Welt 2');

log.debug(`Result: ${test}`);
log.debug(`Result 2: ${doSth('Hugo')}`);

app.whenReady().then(async () => {
  log.debug('Electron app is ready');
  await createMainWindow();
  setTimeout(async () => {
    await createPopupWindow();
  }, 5000);
}).catch(reason => log.error('error during electron app ready:', reason));
