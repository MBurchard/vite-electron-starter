import type {Versions} from '@common/definitions.js';
import {getLog} from '@common/logging.js';
import {contextBridge, ipcRenderer} from 'electron';

const log = getLog('electron.preload');

/**
 * Request some data/information from the Electron main process.
 *
 * @param {string} channel
 * @param args
 * @return {Promise<*>}
 */
async function invoke<T>(channel: string, ...args: any[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args);
}

/**
 * Send some data/information to the Electron main process.
 *
 * @param {string} channel
 * @param args
 */
function emit(channel: string, ...args: any[]): void {
  ipcRenderer.send(channel, ...args);
}

export interface Backend {
  emit: (channel: string, ...args: any[]) => void;
  getVersions: () => Promise<Versions>;
  invoke: <T>(channel: string, ...args: any[]) => Promise<T>;
}

const backend: Backend = {
  emit,
  getVersions: async () => {
    return invoke('getVersions');
  },
  invoke,
};

declare global {
  interface Window {
    backend: Backend;
  }
}

contextBridge.exposeInMainWorld('backend', backend);

log.debug('Preload JS prepared');
