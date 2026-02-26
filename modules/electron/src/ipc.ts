/**
 * modules/electron/src/ipc.ts
 *
 * @file IPC communication layer for the Electron main process. Bridges the main process with renderer windows
 * using Electron's IPC mechanism, providing typed wrappers for all communication patterns.
 *
 * Communication patterns:
 *
 * 1. Request/Response (invoke/handle)
 *    Renderer asks, Main answers.
 *    Example: Request version information.
 *      Frontend:  const versions = await backend.invoke('getVersions')
 *      Backend:   handleFromRenderer('getVersions', () => ({ node: '...' }))
 *
 * 2. Fire-and-Forget (send/on)
 *    Renderer sends, Main reacts without a response.
 *    Example: Trigger a window action.
 *      Frontend:  backend.send('showDisplayDemo')
 *      Backend:   onFromRenderer('showDisplayDemo', () => { ... })
 *
 * 3. Broadcast (broadcast)
 *    Main sends to all renderer windows simultaneously.
 *    Example: Display layout has changed.
 *      Backend:   broadcast('updateDisplayData', displays)
 *      Frontend:  backend.on('updateDisplayData', (displays) => { ... })
 *
 * 4. Targeted Send (sendToRenderer)
 *    Main sends to a specific renderer window.
 *    Example: Report progress to the requesting window.
 *      Backend:   onFromRenderer('startTask', (_event, windowId) => {
 *                   sendToRenderer(windowId, 'taskProgress', 50)
 *                 })
 *      Frontend:  backend.send('startTask')
 *                 backend.on('taskProgress', (percent) => { ... })
 *
 * @author Martin Burchard
 */
import type {IpcChannel} from '@common/definitions.js';
import type {BrowserWindow, IpcMainEvent, IpcMainInvokeEvent} from 'electron';
import {ipcMain} from 'electron';
import {getLogger} from './logging/index.js';

const log = getLogger('electron.ipc');

// ---- Window Registry ----

const windowRegistry = new Map<string, BrowserWindow>();

/**
 * Register a BrowserWindow in the internal window registry. Called by the WindowManager after window creation.
 * Automatically removes the window from the registry when it is closed.
 *
 * @param windowId - The unique identifier for the window.
 * @param win - The BrowserWindow instance to register.
 */
export function registerWindow(windowId: string, win: BrowserWindow): void {
  windowRegistry.set(windowId, win);
  win.on('closed', () => {
    windowRegistry.delete(windowId);
  });
}

// ---- Request/Response (handle) ----

/**
 * Handler function for request/response IPC communication. Processes a request from the renderer and optionally
 * returns a response.
 */
export interface RendererHandler<T> {
  (event: IpcMainInvokeEvent, windowId: string, ...args: any[]): T | Promise<T>;
}

const ipcHandlers = new Map<IpcChannel, RendererHandler<any>>();

/**
 * Register a handler for request/response IPC communication. The renderer calls `backend.invoke(channel, ...args)`
 * and receives the return value as a resolved promise.
 *
 * @param channel - The IPC channel to handle.
 * @param handler - A function that processes the request and returns a response.
 */
export function handleFromRenderer<T>(channel: IpcChannel, handler: RendererHandler<T>): void {
  if (ipcHandlers.has(channel)) {
    log.warn(`Attempted to register another handler for channel '${channel}'. The previous handler will be replaced.`);
  }
  ipcHandlers.set(channel, handler);
  ipcMain.handle(channel, handler);
}

/**
 * Remove a previously registered request/response handler.
 *
 * @param channel - The IPC channel to remove the handler from.
 */
export function removeHandler(channel: IpcChannel): void {
  ipcHandlers.delete(channel);
  ipcMain.removeHandler(channel);
}

// ---- Fire-and-Forget (on/once/off from Renderer) ----

/**
 * Listener function for fire-and-forget IPC communication. Reacts to events sent from the renderer but does
 * not return a response.
 */
export interface RendererListener {
  (event: IpcMainEvent, windowId: string, ...args: any[]): void;
}

/**
 * Register a persistent listener for one-way IPC communication from the renderer. The renderer calls
 * `backend.send(channel, ...args)` and the listener is invoked each time.
 *
 * @param channel - The IPC channel to listen on.
 * @param listener - A function that processes incoming events.
 */
export function onFromRenderer(channel: IpcChannel, listener: RendererListener): void {
  ipcMain.on(channel, listener);
}

/**
 * Register a one-time listener for one-way IPC communication from the renderer. The listener is automatically
 * removed after the first invocation.
 *
 * @param channel - The IPC channel to listen on.
 * @param listener - A function that processes the single incoming event.
 */
export function onceFromRenderer(channel: IpcChannel, listener: RendererListener): void {
  ipcMain.once(channel, listener);
}

/**
 * Remove a previously registered fire-and-forget listener.
 *
 * @param channel - The IPC channel to stop listening on.
 * @param listener - The listener function to remove.
 */
export function offFromRenderer(channel: IpcChannel, listener: RendererListener): void {
  ipcMain.removeListener(channel, listener);
}

// ---- Main to Renderer (broadcast / sendToRenderer) ----

/**
 * Broadcast data to all renderer windows.
 *
 * @param channel - The IPC channel to send on.
 * @param args - The data arguments to send.
 */
export function broadcast<T extends any[]>(channel: IpcChannel, ...args: T): void {
  for (const win of windowRegistry.values()) {
    if (!win.isDestroyed() && win.webContents) {
      win.webContents.send(channel, ...args);
    }
  }
}

/**
 * Send data to a specific renderer window identified by its window ID.
 *
 * @param windowId - The unique identifier of the target window.
 * @param channel - The IPC channel to send on.
 * @param args - The data arguments to send.
 */
export function sendToRenderer<T extends any[]>(windowId: string, channel: IpcChannel, ...args: T): void {
  const win = windowRegistry.get(windowId);
  if (!win) {
    log.warn(`sendToRenderer: no window found for windowId '${windowId}'`);
    return;
  }
  if (!win.isDestroyed() && win.webContents) {
    win.webContents.send(channel, ...args);
  }
}
