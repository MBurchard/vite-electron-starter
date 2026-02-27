/**
 * modules/electron/src/windowMgt/dialog/DialogService.ts
 *
 * @file Backend-owned dialog lifecycle service. Stores per-dialog config/state, exposes openDialogWindow(), and
 * processes renderer intents (opened/shown/action/dismissed) to produce typed dialog results.
 */

import type {
  DialogActionEvent,
  DialogOpenedEvent,
  DialogShownEvent,
} from '@common/dialog/lifecycle.js';
import type {
  DialogCloseSource,
  DialogConfig,
  DialogResult,
} from '@common/dialog/types.js';
import type {DialogHandle, DialogLifecycleHooks, OpenDialogWindowOptions} from './types.js';
import {DialogIpcChannels} from '@common/dialog/ipc.js';
import {v4 as uuidv4} from 'uuid';
import {sendToRenderer} from '../../ipc.js';
import {getLogger} from '../../logging/index.js';
import {createWindow} from '../WindowManager.js';
import {setupDialogHandlers} from './DialogIpc.js';

const log = getLogger('electron.dialog');

/**
 * A promise with an externally accessible resolve function, used for lifecycle signalling.
 */
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

/**
 * Internal bookkeeping for a single dialog instance including its config, lifecycle state, and deferred promises.
 */
interface DialogEntry {
  config: DialogConfig;
  hooks?: DialogLifecycleHooks;
  opened: Deferred<DialogOpenedEvent>;
  shown: Deferred<DialogShownEvent>;
  result: Deferred<DialogResult>;
  openedResolved: boolean;
  shownResolved: boolean;
  resultResolved: boolean;
  browserWindow?: Electron.BrowserWindow;
}

const dialogStore = new Map<string, DialogEntry>();

// ---- Public API ----

/**
 * Open a dialog window and return lifecycle/result handles.
 *
 * @param config - Full dialog configuration rendered by the dialog window.
 * @param hooks - Optional lifecycle hooks invoked for open/show/action/close events.
 * @param options - Optional window behaviour overrides for dialog creation.
 * @returns A dialog handle with lifecycle promises and a programmatic close method.
 */
export function openDialogWindow(
  config: DialogConfig,
  hooks?: DialogLifecycleHooks,
  options?: OpenDialogWindowOptions,
): DialogHandle {
  setupDialogHandlers();
  const dialogId = `dialog-${uuidv4()}`;
  const opened = createDeferred<DialogOpenedEvent>();
  const shown = createDeferred<DialogShownEvent>();
  const result = createDeferred<DialogResult>();

  dialogStore.set(dialogId, {
    config,
    hooks,
    opened,
    openedResolved: false,
    result,
    resultResolved: false,
    shown,
    shownResolved: false,
  });

  const controller = createWindow({
    contentPage: 'dialog',
    pack: true,
    placement: config.placement,
    withDevTools: options?.withDevTools,
    windowId: dialogId,
    windowOptions: {
      alwaysOnTop: true,
      frame: false,
      // macOS window shadow clashes with border-radius on transparent windows
      hasShadow: false,
      height: 300,
      transparent: true,
      // +4px compensates for the transparent body padding (2px each side) in dialog.css
      width: (config.width ?? 500) + 4,
    },
  });

  if (!controller) {
    resolveResult(dialogId, 'window-destroyed');
  } else {
    const entry = dialogStore.get(dialogId);
    if (entry) {
      entry.browserWindow = controller.browserWindow;
    }
    controller.browserWindow.on('closed', () => {
      resolveResult(dialogId, 'window-destroyed');
    });
    controller.whenWindowReady.then(() => {
      sendToRenderer(dialogId, DialogIpcChannels.initDialog, config);
    }).catch((reason) => {
      log.error('Error loading dialog window', reason);
      resolveResult(dialogId, 'window-destroyed');
    });
  }

  return {
    close: async () => {
      finalizeAndClose(dialogId, 'programmatic');
    },
    dialogId,
    result: result.promise,
    whenOpened: opened.promise,
    whenShown: shown.promise,
  };
}

/**
 * Mark dialog as opened (renderer initialized).
 *
 * @param windowId - Unique dialog window ID.
 */
export function markDialogOpened(windowId: string): void {
  resolveOpened(windowId);
}

/**
 * Mark dialog as shown (renderer completed first layout + pack report).
 *
 * @param windowId - Unique dialog window ID.
 */
export function markDialogShown(windowId: string): void {
  resolveShown(windowId);
}

/**
 * Handle button action from the renderer.
 *
 * @param windowId - Unique dialog window ID.
 * @param buttonId - ID of the button that was pressed.
 * @param payload - Optional payload sent with the action.
 */
export function handleDialogAction(windowId: string, buttonId: string, payload?: unknown): void {
  const entry = dialogStore.get(windowId);
  if (!entry) {
    return;
  }

  const button = entry.config.buttons.find(candidate => candidate.id === buttonId);
  if (!button) {
    log.warn(`Unknown dialog button '${buttonId}' for window '${windowId}'`);
    return;
  }

  const actionEvent: DialogActionEvent = {
    at: Date.now(),
    buttonId,
    payload: payload ?? button.payload,
    windowId,
  };
  entry.hooks?.onAction?.(actionEvent);

  if (button.closesDialog !== false) {
    finalizeAndClose(windowId, 'button', {buttonId, payload: actionEvent.payload});
  }
}

/**
 * Handle non-button dismiss requests from the renderer.
 *
 * @param windowId - Unique dialog window ID.
 * @param source - Dismiss source (`titlebar-x` or `esc`).
 */
export function handleDialogDismissed(
  windowId: string,
  source: Exclude<DialogCloseSource, 'button' | 'programmatic' | 'window-destroyed'>,
): void {
  finalizeAndClose(windowId, source);
}

/**
 * Update the dialog message and push it to the renderer.
 *
 * @param windowId - Unique dialog window ID.
 * @param message - Full message content to render.
 */
export function setDialogMessage(windowId: string, message: string): void {
  const entry = dialogStore.get(windowId);
  if (!entry) {
    return;
  }

  entry.config.message = message;
  sendToRenderer(windowId, DialogIpcChannels.dialogSetMessage, message);
}

// ---- Internal Helpers ----

/**
 * Create a deferred promise pair used for lifecycle and result signalling.
 *
 * @returns Deferred object containing promise and resolver.
 * @internal
 */
function createDeferred<T>(): Deferred<T> {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  if (!resolve) {
    throw new Error('Failed to initialize deferred promise');
  }

  return {promise, resolve};
}

/**
 * Resolve the "opened" lifecycle once and trigger optional hooks.
 *
 * @param windowId - Unique dialog window ID.
 * @internal
 */
function resolveOpened(windowId: string): void {
  const entry = dialogStore.get(windowId);
  if (!entry || entry.openedResolved) {
    return;
  }

  entry.openedResolved = true;
  const event: DialogOpenedEvent = {windowId, at: Date.now()};
  entry.opened.resolve(event);
  entry.hooks?.onOpened?.(event);
}

/**
 * Resolve the "shown" lifecycle once and trigger optional hooks.
 *
 * @param windowId - Unique dialog window ID.
 * @internal
 */
function resolveShown(windowId: string): void {
  const entry = dialogStore.get(windowId);
  if (!entry || entry.shownResolved) {
    return;
  }

  entry.shownResolved = true;
  const event: DialogShownEvent = {windowId, at: Date.now()};
  entry.shown.resolve(event);
  entry.hooks?.onShown?.(event);
}

/**
 * Resolve the final dialog result once and clear stored dialog state.
 *
 * @param windowId - Unique dialog window ID.
 * @param source - Close source that produced this final result.
 * @param details - Optional result details like button and payload.
 * @param details.buttonId - Optional ID of the button that caused dialog closure.
 * @param details.payload - Optional payload returned with the close result.
 * @internal
 */
function resolveResult(
  windowId: string,
  source: DialogCloseSource,
  details: {buttonId?: string; payload?: unknown} = {},
): void {
  const entry = dialogStore.get(windowId);
  if (!entry || entry.resultResolved) {
    return;
  }

  entry.resultResolved = true;
  const result: DialogResult = {
    at: Date.now(),
    buttonId: details.buttonId,
    payload: details.payload,
    source,
    windowId,
  };

  entry.result.resolve(result);
  entry.hooks?.onClosed?.(result);
  dialogStore.delete(windowId);
}

/**
 * Close the backing Electron window of a dialog if it is still alive.
 *
 * @param windowId - Unique dialog window ID.
 * @internal
 */
function closeWindow(windowId: string): void {
  const entry = dialogStore.get(windowId);
  const browserWindow = entry?.browserWindow;
  if (browserWindow && !browserWindow.isDestroyed()) {
    browserWindow.close();
  }
}

/**
 * Finalize a dialog closure flow by closing the window and resolving the result.
 *
 * @param windowId - Unique dialog window ID.
 * @param source - Close source that should be written to the final result.
 * @param details - Optional result details like button and payload.
 * @param details.buttonId - Optional ID of the button that caused dialog closure.
 * @param details.payload - Optional payload returned with the close result.
 * @internal
 */
function finalizeAndClose(
  windowId: string,
  source: DialogCloseSource,
  details: {buttonId?: string; payload?: unknown} = {},
): void {
  closeWindow(windowId);
  resolveResult(windowId, source, details);
}
