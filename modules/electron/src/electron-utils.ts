import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  ipcMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import {v4 as uuidv4} from 'uuid';
import {getLogger} from './logging.js';

const log = getLogger('electron.utils');

interface WindowConfiguration {
  contentPage: string;
  windowOptions?: BrowserWindowConstructorOptions;
  withDevTools?: boolean;
}

export async function createWindow(conf: WindowConfiguration) {
  try {
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

    if (process.env.NODE_ENV === 'development' && conf.withDevTools) {
      win.webContents.openDevTools();
    }

    log.debug('NODE_ENV:', process.env.NODE_ENV);
    log.debug('VITE_DEV_SERVER_URL:', process.env.VITE_DEV_SERVER_URL);
    if (process.env.NODE_ENV === 'development' && process.env.VITE_DEV_SERVER_URL) {
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
  } catch (e) {
    log.error('Error in Function createWindow:', conf, '/n', e);
  }
}

/**
 * Register a handler that will be invoked, when the frontend is sending something on a specific channel.
 * The handler is able to return a result to the frontend.
 *
 * @param {string} channel
 * @param {(event: Electron.CrossProcessExports.IpcMainInvokeEvent, ...args: any[]) => unknown} handler
 */
export function registerFrontendHandler(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<void> | unknown,
): void {
  ipcMain.handle(channel, handler);
}

/**
 * Register a listener that will be invoked, when the frontend is sending something on a specific channel.
 *
 * @param {string} channel
 * @param {(event: Electron.CrossProcessExports.IpcMainEvent, ...args: any[]) => void} listener
 */
export function registerFrontendListener(
  channel: string,
  listener: (event: IpcMainEvent, ...args: any[]) => void,
): void {
  ipcMain.on(channel, listener);
}
