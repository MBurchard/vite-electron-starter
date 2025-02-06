import type {BrowserWindowConstructorOptions, IpcMainEvent, IpcMainInvokeEvent} from 'electron';
import fs from 'node:fs/promises';
import type {IpcChannel} from '@common/definitions.js';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {app, BrowserWindow, ipcMain} from 'electron';
import {v4 as uuidv4} from 'uuid';
import {getLogger} from './logging.js';

const log = getLogger('electron.utils');

interface WindowConfiguration {
  contentPage: string;
  windowOptions?: BrowserWindowConstructorOptions;
  withDevTools?: boolean;
}

const ENV = process.env.NODE_ENV ?? 'production';

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

    log.debug('Environment:', ENV);
    log.debug('VITE_DEV_SERVER_URL:', process.env.VITE_DEV_SERVER_URL);

    if (ENV === 'development' && conf.withDevTools) {
      log.debug('Using devtools:');
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
  } catch (e) {
    log.error('Error in Function createWindow:', conf, '/n', e);
  }
}

export function getLogPath(): string {
  return path.resolve(app.getPath('userData'), 'logs');
}

/**
 * Register a handler that will be invoked, when the frontend is sending something on a specific channel.
 * The handler is able to return a result to the frontend.
 *
 * @param {IpcChannel} channel
 * @param {(event: Electron.CrossProcessExports.IpcMainInvokeEvent, ...args: any[]) => unknown} handler
 */
export function registerFrontendHandler(
  channel: IpcChannel,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<void> | unknown,
): void {
  ipcMain.handle(channel, handler);
}

/**
 * Register a listener that will be invoked, when the frontend is sending something on a specific channel.
 *
 * @param {IpcChannel} channel
 * @param {(event: Electron.CrossProcessExports.IpcMainEvent, ...args: any[]) => void} listener
 */
export function registerFrontendListener(
  channel: IpcChannel,
  listener: (event: IpcMainEvent, ...args: any[]) => void,
): void {
  ipcMain.on(channel, listener);
}
