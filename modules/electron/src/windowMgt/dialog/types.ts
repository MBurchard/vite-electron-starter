/**
 * modules/electron/src/windowMgt/dialog/types.ts
 *
 * @file Public dialogue service contracts for backend callers.
 */

import type {WindowPlacement} from '@common/core/window.js';
import type {
  DialogActionEvent,
  DialogClosedEvent,
  DialogOpenedEvent,
  DialogShownEvent,
} from '@common/dialog/lifecycle.js';
import type {DialogResult} from '@common/dialog/types.js';

/**
 * Optional overrides for convenience dialogue functions (showInfo, showWarning, etc.).
 */
export interface SimpleDialogOptions {
  /** Optional fixed width in pixels. Defaults to 500. */
  width?: number;
  /** Optional placement strategy for dialogue positioning. */
  placement?: WindowPlacement;
  /** Whether the header close button should be available. Defaults to true. */
  closableByX?: boolean;
  /** Whether ESC should dismiss the dialogue. Defaults to true. */
  closableByEsc?: boolean;
}

/**
 * Optional lifecycle hooks invoked during dialogue open/show/action/close phases.
 */
export interface DialogLifecycleHooks {
  onOpened?: (event: DialogOpenedEvent) => void;
  onShown?: (event: DialogShownEvent) => void;
  onAction?: (event: DialogActionEvent) => void;
  onClosed?: (event: DialogClosedEvent) => void;
}

/**
 * Options controlling the dialogue BrowserWindow creation.
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
