/**
 * modules/electron-preload/src/preload.ts
 *
 * @file Preload script that bridges the isolated renderer context with the Electron main process. Configures
 * logging with backend forwarding, exposes a typed `window.backend` API via contextBridge for IPC communication
 * (invoke, send, on/once/off), and manages an optional ResizeObserver for automatic content-size reporting.
 *
 * @author Martin Burchard
 */
import type {Versions} from '@common/core/versions.js';
import type {IpcChannel} from '@common/definitions.js';
import type {ILogEvent} from '@mburchard/bit-log/definitions';
import {CoreIpcChannels} from '@common/core/ipc.js';
import {createBoundAppenderClass} from '@common/logging/BackendForwardingAppender.js';
import {debounce} from '@common/utils.js';
import {configureLogging, useLog} from '@mburchard/bit-log';
import {ConsoleAppender} from '@mburchard/bit-log/appender/ConsoleAppender';
import {contextBridge, ipcRenderer} from 'electron';

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

// ---- Logging ----

configureLogging({
  appender: {
    CONSOLE: {
      Class: ConsoleAppender,
    },
    BACKEND: {
      Class: createBoundAppenderClass(event => send(CoreIpcChannels.frontendLogging, event)),
    },
  },
  root: {
    appender: ['CONSOLE', 'BACKEND'],
    level: 'DEBUG',
  },
});

const log = useLog('electron.preload');
const windowId = getWindowId() ?? 'unknown';

// ---- IPC Listener Management ----

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

// ---- Auto-Resize Observer ----

const debouncedReportSize = debounce(() => {
  const w = document.body.offsetWidth;
  const h = document.body.offsetHeight;
  log.debug(`(${windowId}) Auto-resize fired: ${w}x${h}`);
  send(CoreIpcChannels.rendererContentSizeChanged, w, h);
}, 50);

let resizeObserver: ResizeObserver | undefined;

// ---- Backend API ----

/**
 * Typed API for per-window operations exposed as `backend.window`.
 */
export interface WindowAPI {
  /**
   * Disable the automatic content-size observer. Pending debounced reports are cancelled.
   */
  disableAutoResize: () => void;

  /**
   * Enable the automatic content-size observer. A ResizeObserver on `document.body` reports size changes to the
   * main process, debounced at 50ms. Enabled automatically for pack windows after DOMContentLoaded.
   */
  enableAutoResize: () => void;

  /**
   * Report the current content size to the main process immediately, bypassing the debounce.
   *
   * @param width - Content width in pixels.
   * @param height - Content height in pixels.
   */
  reportContentSize: (width: number, height: number) => void;
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
  window: WindowAPI;
}

const windowAPI: WindowAPI = {
  disableAutoResize: () => {
    if (!resizeObserver) {
      return;
    }
    log.debug(`(${windowId}) Auto-resize observer disabled`);
    debouncedReportSize.cancel();
    resizeObserver.disconnect();
    resizeObserver = undefined;
  },
  enableAutoResize: () => {
    if (resizeObserver) {
      return;
    }
    log.debug(`(${windowId}) Auto-resize observer enabled`);
    resizeObserver = new ResizeObserver(debouncedReportSize);
    resizeObserver.observe(document.body);
  },
  reportContentSize: (width: number, height: number) => {
    send(CoreIpcChannels.rendererContentSizeChanged, width, height);
  },
};

const backend: Backend = {
  forwardLogEvent: (event: ILogEvent) => {
    send(CoreIpcChannels.frontendLogging, event);
  },
  getVersions: async () => {
    return invoke(CoreIpcChannels.getVersions);
  },
  invoke,
  off,
  on,
  once,
  send,
  window: windowAPI,
};

declare global {
  // noinspection JSUnusedGlobalSymbols
  interface Window {
    backend: Backend;
  }
}

contextBridge.exposeInMainWorld('backend', backend);

// eslint-disable-next-line node/prefer-global/process
if (process.argv.includes('--auto-resize')) {
  window.addEventListener('DOMContentLoaded', () => windowAPI.enableAutoResize(), {once: true});
}

log.debug(`(${windowId}) Preload JS finished`);
