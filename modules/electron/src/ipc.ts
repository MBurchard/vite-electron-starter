/**
 * modules/electron/src/ipc.ts
 *
 * @file IPC communication layer for the Electron main process. Provides functions to register handlers (request/
 * response) and listeners (fire-and-forget) for frontend-to-backend communication, as well as broadcasting
 * data to all renderer windows.
 *
 * @author Martin Burchard
 */
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
 * Register a handler for IPC communication between the frontend and backend. The handler can process incoming
 * requests and return a response to the frontend.
 *
 * @param channel - The IPC channel to listen on.
 * @param handler - A function that handles incoming requests.
 */
export function registerFrontendHandler<T>(channel: IpcChannel, handler: FrontendIpcHandler<T>): void {
  if (ipcHandlers.has(channel)) {
    log.warn(`Attempted to register another handler for channel '${channel}'. The previous handler will be replaced.`);
  }
  ipcHandlers.set(channel, handler);

  ipcMain.handle(channel, handler);
}

/**
 * Unregister a previously registered IPC handler.
 *
 * @param channel - The IPC channel to remove the handler from.
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
 * Register a listener for one-way IPC communication from the frontend to the backend. The listener reacts to
 * events but does not return a response.
 *
 * @param channel - The IPC channel to listen on.
 * @param listener - A function that processes incoming events.
 * @param once - If true, the listener is invoked only once.
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
 * Unregister a previously registered IPC listener.
 *
 * @param channel - The IPC channel to stop listening on.
 * @param listener - The function to remove.
 */
export function unregisterFrontendListener(channel: IpcChannel, listener: FrontendIpcListener): void {
  ipcMain.removeListener(channel, listener);
}

/**
 * Send data to all renderer processes.
 *
 * @param channel - The IPC channel to send data on.
 * @param args - The data arguments to send.
 */
export function sendFrontend<T extends any[]>(channel: IpcChannel, ...args: T): void {
  const allWindows = BrowserWindow.getAllWindows();
  allWindows.forEach((win) => {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send(channel, ...args);
    }
  });
}
