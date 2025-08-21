import type {BrowserWindowConstructorOptions} from 'electron';
import type {FrontendIpcListener} from './ipc.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {app, BrowserWindow} from 'electron';
import {v4 as uuidv4} from 'uuid';
import {registerFrontendListener, unregisterFrontendListener} from './ipc.js';
import {getLogger} from './logging.js';

const log = getLogger('WindowManager');

interface WindowConfiguration {
  contentPage: string;
  windowOptions?: BrowserWindowConstructorOptions;
  withDevTools?: boolean;
}

const ENV = process.env.NODE_ENV ?? 'production';

export async function createWindow(conf: WindowConfiguration): Promise<BrowserWindow | undefined> {
  try {
    const startTS = Date.now();
    const windowOptions = conf.windowOptions || {};
    const showWindow = !(windowOptions.show === false);
    const windowId = uuidv4();
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const preloadJS = path.join(__dirname, 'preload.js');

    log.debug('using preload script:', preloadJS);

    const win = new BrowserWindow({
      ...windowOptions,
      ...{
        webPreferences: {
          additionalArguments: [`--window-id?${windowId}`],
          contextIsolation: true,
          nodeIntegration: false,
          preload: preloadJS,
          sandbox: true,
          webviewTag: false,
        },
      },
    });

    const windowFullyLoadedListener: FrontendIpcListener = (_event, windowId) => {
      const endTS = Date.now();
      log.debug(`Window '${conf.contentPage}' has been opened in ${endTS - startTS}ms`);
      unregisterFrontendListener(`windowFullyLoaded-${windowId}`, windowFullyLoadedListener);
    };

    registerFrontendListener(`windowFullyLoaded-${windowId}`, windowFullyLoadedListener, true);

    log.debug('Environment:', ENV);
    log.debug('VITE_DEV_SERVER_URL:', process.env.VITE_DEV_SERVER_URL);

    if (ENV === 'development' && conf.withDevTools) {
      log.debug('Using devtools');
      win.webContents.openDevTools();
    }

    if (ENV === 'development' && process.env.VITE_DEV_SERVER_URL) {
      await win.loadURL(`${process.env.VITE_DEV_SERVER_URL}${conf.contentPage}`);
    } else {
      try {
        log.info('App Path:', app.getAppPath());
        const filePath = path.resolve(app.getAppPath(), 'dist', `${conf.contentPage}.html`);
        await fs.access(filePath);
        log.debug('loading content page', filePath);
        await win.loadFile(filePath);
      } catch (e) {
        log.error('Error loading content page:', conf.contentPage, e);
      }
    }

    if (showWindow) {
      win.show();
    }

    return win;
  } catch (e) {
    log.error('Error in Function createWindow:', conf, '/n', e);
  }
}
