import type {Versions} from '@common/definitions.js';
import type {ILogEvent} from '@mburchard/bit-log/dist/definitions.js';
import {useLog} from '@mburchard/bit-log';
import {contextBridge, ipcRenderer} from 'electron';

const log = useLog('electron.preload');

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
  forwardLogEvent: (event: ILogEvent) => void;
  getVersions: () => Promise<Versions>;
  invoke: <T>(channel: string, ...args: any[]) => Promise<T>;
}

const backend: Backend = {
  emit,
  forwardLogEvent: (event: ILogEvent) => {
    emit('frontend-logging', event);
  },
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

log.debug('Preload JS finished');
