/**
 * modules/electron-preload/src/preload.ts
 *
 * @file Preload script that bridges the isolated renderer context with the Electron main process. Exposes a typed
 * `window.backend` API via contextBridge for IPC communication (invoke, send, on/once/off) and log forwarding.
 *
 * @author Martin Burchard
 */
import type {IpcChannel, Versions} from '@common/definitions.js';
import type {ILogEvent} from '@mburchard/bit-log/definitions';
import {IpcChannels} from '@common/definitions.js';
import {useLog} from '@mburchard/bit-log';
import {contextBridge, ipcRenderer} from 'electron';

const log = useLog('electron.preload');

/**
 * Extract the window ID from the process argv injected by the WindowManager.
 *
 * @returns The window ID string, or undefined if not found.
 */
function getWindowId(): string | undefined {
  // It's already declared within the preload environment
  // eslint-disable-next-line node/prefer-global/process
  const windowIdArg = process.argv.find(arg => arg.startsWith('--window-id?'));
  /* v8 ignore next @preserve */
  return windowIdArg ? windowIdArg.split('?')[1] : undefined;
}

/**
 * Request some data/information from the Electron main process.
 *
 * @param channel - The IPC channel to invoke.
 * @param args - Additional arguments to pass.
 * @returns The response from the main process handler.
 */
async function invoke<T>(channel: IpcChannel, ...args: any[]): Promise<T> {
  return ipcRenderer.invoke(channel, getWindowId(), ...args);
}

/**
 * Send some data/information to the Electron main process (fire-and-forget).
 *
 * @param channel - The IPC channel to send on.
 * @param args - Additional arguments to pass.
 */
function send(channel: IpcChannel, ...args: any[]): void {
  ipcRenderer.send(channel, getWindowId(), ...args);
}

const backendListeners = new Map<IpcChannel, WeakMap<(...args: any[]) => void, (...args: any[]) => void>>();

/**
 * Listen for updates with data from the Electron main process.
 *
 * @param channel - The IPC channel to listen on.
 * @param callback - Callback function that receives multiple arguments.
 */
function on<T extends any[]>(channel: IpcChannel, callback: (...args: T) => void): void {
  const listener = (_event: Electron.IpcRendererEvent, ...args: T) => callback(...args);
  if (!backendListeners.has(channel)) {
    backendListeners.set(channel, new WeakMap());
  }
  backendListeners.get(channel)?.set(callback, listener);
  ipcRenderer.on(channel, listener);
}

/**
 * Listen for a single update from the Electron main process. The listener is automatically removed after the
 * first invocation.
 *
 * @param channel - The IPC channel to listen on.
 * @param callback - Callback function that receives multiple arguments.
 */
function once<T extends any[]>(channel: IpcChannel, callback: (...args: T) => void): void {
  const listener = (_event: Electron.IpcRendererEvent, ...args: T) => callback(...args);
  ipcRenderer.once(channel, listener);
}

/**
 * Remove a previously registered event listener.
 *
 * @param channel - The IPC channel to stop listening on.
 * @param callback - The callback to remove.
 */
function off<T extends any[]>(channel: IpcChannel, callback: (...args: T) => void): void {
  const channelListeners = backendListeners.get(channel);
  if (channelListeners) {
    const listener = channelListeners.get(callback);
    if (listener) {
      ipcRenderer.removeListener(channel, listener);
      channelListeners.delete(callback);
    }
  }
}

/**
 * Typed interface for the backend bridge exposed to the renderer via contextBridge.
 */
export interface Backend {
  forwardLogEvent: (event: ILogEvent) => void;
  getVersions: () => Promise<Versions>;
  invoke: <T>(channel: IpcChannel, ...args: any[]) => Promise<T>;
  off: <T extends any[]>(channel: IpcChannel, callback: (...args: T) => void) => void;
  on: <T extends any[]>(channel: IpcChannel, callback: (...args: T) => void) => void;
  once: <T extends any[]>(channel: IpcChannel, callback: (...args: T) => void) => void;
  send: (channel: IpcChannel, ...args: any[]) => void;
}

const backend: Backend = {
  forwardLogEvent: (event: ILogEvent) => {
    send(IpcChannels.frontendLogging, event);
  },
  getVersions: async () => {
    return invoke(IpcChannels.getVersions);
  },
  invoke,
  off,
  on,
  once,
  send,
};

declare global {
  // noinspection JSUnusedGlobalSymbols
  interface Window {
    backend: Backend;
  }
}

contextBridge.exposeInMainWorld('backend', backend);

window.addEventListener('DOMContentLoaded', () => {
  send(`windowFullyLoaded-${getWindowId()}`);
});

log.debug('Preload JS finished');
