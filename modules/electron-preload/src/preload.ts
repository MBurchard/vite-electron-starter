import type {IpcChannel, Versions} from '@common/definitions.js';
import type {ILogEvent} from '@mburchard/bit-log/dist/definitions.js';
import {useLog} from '@mburchard/bit-log';
import {contextBridge, ipcRenderer} from 'electron';

const log = useLog('electron.preload');

function getWindowId(): string | undefined {
  // It's already declared within the preload environment
  // eslint-disable-next-line node/prefer-global/process
  const windowIdArg = process.argv.find(arg => arg.startsWith('--window-id?'));
  return windowIdArg ? windowIdArg.split('?')[1] : undefined;
}

/**
 * Request some data/information from the Electron main process.
 *
 * @param {IpcChannel} channel
 * @param args
 * @return {Promise<*>}
 */
async function invoke<T>(channel: IpcChannel, ...args: any[]): Promise<T> {
  return ipcRenderer.invoke(channel, getWindowId(), ...args);
}

/**
 * Send some data/information to the Electron main process.
 *
 * @param {IpcChannel} channel
 * @param args
 */
function emit(channel: IpcChannel, ...args: any[]): void {
  ipcRenderer.send(channel, getWindowId(), ...args);
}

const backendListeners = new Map<IpcChannel, WeakMap<(...args: any[]) => void, (...args: any[]) => void>>();

/**
 * Listen for updates with data from the Electron main process.
 *
 * @param {IpcChannel} channel
 * @param {Function} callback - Callback function that receives multiple arguments.
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
 * Remove a previously registered event listener.
 *
 * @param {IpcChannel} channel
 * @param {(event: any) => void} callback
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

export interface Backend {
  emit: (channel: IpcChannel, ...args: any[]) => void;
  forwardLogEvent: (event: ILogEvent) => void;
  getVersions: () => Promise<Versions>;
  invoke: <T>(channel: IpcChannel, ...args: any[]) => Promise<T>;
  on: <T extends any[]>(channel: IpcChannel, callback: (...args: T) => void) => void;
  off: <T extends any[]>(channel: IpcChannel, callback: (...args: T) => void) => void;
}

const backend: Backend = {
  emit,
  forwardLogEvent: (event: ILogEvent) => {
    emit('frontendLogging', event);
  },
  getVersions: async () => {
    return invoke('getVersions');
  },
  invoke,
  on,
  off,
};

declare global {
  // noinspection JSUnusedGlobalSymbols
  interface Window {
    backend: Backend;
  }
}

contextBridge.exposeInMainWorld('backend', backend);

window.addEventListener('DOMContentLoaded', () => {
  emit('windowFullyLoaded');
});

log.debug('Preload JS finished');
