/**
 * modules/electron/src/windowMgt/dialog/types.ts
 *
 * @file Public dialog service contracts for backend callers.
 */

import type {
  DialogActionEvent,
  DialogClosedEvent,
  DialogOpenedEvent,
  DialogShownEvent,
} from '@common/dialog/lifecycle.js';
import type {DialogResult} from '@common/dialog/types.js';

/**
 * Optional lifecycle hooks invoked during dialog open/show/action/close phases.
 */
export interface DialogLifecycleHooks {
  onOpened?: (event: DialogOpenedEvent) => void;
  onShown?: (event: DialogShownEvent) => void;
  onAction?: (event: DialogActionEvent) => void;
  onClosed?: (event: DialogClosedEvent) => void;
}

/**
 * Options controlling the dialog BrowserWindow creation.
 */
export interface OpenDialogWindowOptions {
  withDevTools?: boolean;
}

/**
 * Handle returned by openDialogWindow(), providing lifecycle promises and a programmatic close method.
 */
export interface DialogHandle {
  dialogId: string;
  whenOpened: Promise<DialogOpenedEvent>;
  whenShown: Promise<DialogShownEvent>;
  result: Promise<DialogResult>;
  close: () => Promise<void>;
}
