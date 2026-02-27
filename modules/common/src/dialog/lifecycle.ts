/**
 * modules/common/src/dialog/lifecycle.ts
 *
 * @file Dialog lifecycle payload types for hook callbacks and IPC events.
 */

import type {DialogCloseSource, DialogResult} from './types.js';

/**
 * Emitted when the dialog window has been created and the renderer has initialised.
 */
export interface DialogOpenedEvent {
  windowId: string;
  at: number;
}

/**
 * Emitted when the dialog renderer has completed its first layout and reported content size.
 */
export interface DialogShownEvent {
  windowId: string;
  at: number;
}

/**
 * Emitted when the user clicks a dialog button. Carries the button ID and optional payload.
 */
export interface DialogActionEvent {
  windowId: string;
  buttonId: string;
  payload?: unknown;
  at: number;
}

/**
 * Emitted when the dialog is dismissed by a non-button source (e.g. Escape key or titlebar close).
 */
export interface DialogDismissedEvent {
  windowId: string;
  source: Exclude<DialogCloseSource, 'button'>;
  at: number;
}

/**
 * Final event emitted when the dialog window has been closed, carrying the result from DialogResult.
 */
export interface DialogClosedEvent extends DialogResult {}
