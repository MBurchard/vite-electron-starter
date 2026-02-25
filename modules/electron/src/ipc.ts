import type {IpcChannel} from '@common/definitions.js';
import type {IpcMainEvent, IpcMainInvokeEvent} from 'electron';
import {BrowserWindow, ipcMain} from 'electron';
import {getLogger} from './logging/index.js';

const log = getLogger('electron.ipc');

/**
 * Interface for an IPC handler that processes a request from the frontend and optionally returns a response.
 */
export interface FrontendIpcHandler<T> {
  (event: IpcMainInvokeEvent, windowId: string, ...args: any[]): T | Promise<T>;
}

/**
 * Stores handlers per channel.
 */
const ipcHandlers = new Map<IpcChannel, FrontendIpcHandler<any>>();

/**
 * Registers a handler for IPC communication between the frontend and backend.
 * The handler can process incoming requests and return a response to the frontend.
 *
 * @template T - The expected return type of the handler.
 * @param {IpcChannel} channel - The IPC channel to listen on.
 * @param {FrontendIpcHandler<T>} handler - A function that handles incoming requests.
 */
export function registerFrontendHandler<T>(channel: IpcChannel, handler: FrontendIpcHandler<T>): void {
  if (ipcHandlers.has(channel)) {
    log.warn(`Attempted to register another handler for channel '${channel}'. The previous handler will be replaced.`);
  }
  ipcHandlers.set(channel, handler);

  ipcMain.handle(channel, handler);
}

/**
 * Unregisters a previously registered IPC handler.
 *
 * @param {IpcChannel} channel - The IPC channel to remove the handler from.
 */
export function unregisterFrontendHandler(channel: IpcChannel): void {
  ipcHandlers.delete(channel);
  ipcMain.removeHandler(channel);
}

/**
 * Interface for an IPC listener that reacts to frontend events but does not return a response.
 */
export interface FrontendIpcListener {
  (event: IpcMainEvent, windowId: string, ...args: any[]): void;
}

/**
 * Registers a listener for one-way IPC communication from the frontend to the backend.
 * The listener reacts to events but does not return a response.
 *
 * @param {IpcChannel} channel - The IPC channel to listen on.
 * @param {FrontendIpcListener} listener - A function that processes incoming events.
 * @param {boolean} [once] - If true, the listener is invoked only once.
 */
export function registerFrontendListener(
  channel: IpcChannel,
  listener: FrontendIpcListener,
  once: boolean = false,
): void {
  if (once) {
    ipcMain.once(channel, listener);
  } else {
    ipcMain.on(channel, listener);
  }
}

/**
 * Unregisters a previously registered IPC listener.
 *
 * @param {IpcChannel} channel - The IPC channel to stop listening on.
 * @param {FrontendIpcListener} listener - The function to remove.
 */
export function unregisterFrontendListener(channel: IpcChannel, listener: FrontendIpcListener): void {
  ipcMain.removeListener(channel, listener);
}

/**
 * Send data to all renderer processes.
 *
 * @param {IpcChannel} channel - The IPC channel to send data on.
 * @param {...any[]} args - The data arguments to send.
 */
export function sendFrontend<T extends any[]>(channel: IpcChannel, ...args: T): void {
  const allWindows = BrowserWindow.getAllWindows();
  allWindows.forEach((win) => {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send(channel, ...args);
    }
  });
}
