/**
 * modules/common/src/dialog/types.ts
 *
 * @file Shared dialog data contracts used by renderer and backend.
 */
import type {WindowPlacement} from '@common/core/window.js';

/**
 * Visual style category for a dialog.
 */
export type DialogType = 'confirm' | 'error' | 'info' | 'success' | 'warning';

/**
 * Styling hint for dialog action buttons.
 */
export type DialogButtonVariant = 'primary' | 'secondary' | 'danger';

/**
 * Single action button configuration for a dialog.
 */
export interface DialogButtonConfig {
  /** Stable identifier returned as part of dialog results. */
  id: string;
  /** Button text shown in the UI. */
  label: string;
  /** Optional style hint used by the renderer. */
  variant?: DialogButtonVariant;
  /** Whether this button closes the dialog. Defaults to true. */
  closesDialog?: boolean;
  /** Optional static payload emitted with action/result events. */
  payload?: unknown;
}

/**
 * Configuration for opening a dialog window.
 */
export interface DialogConfig {
  /** Whether the renderer auto-reports content size via ResizeObserver. Defaults to true. */
  autoResize?: boolean;
  /** Dialog type controlling colour scheme. */
  type?: DialogType;
  /** Title displayed in the dialog header. */
  title: string;
  /** Body text displayed in the dialog window. Defaults to empty. */
  message?: string;
  /** Optional fixed width in pixels. Defaults to 500. */
  width?: number;
  /** Optional placement strategy for dialog positioning within the display work area. */
  placement?: WindowPlacement;
  /** Buttons to render, in display order. */
  buttons: DialogButtonConfig[];
  /** Whether the header close button should be available. Defaults to true. */
  closableByX?: boolean;
  /** Whether ESC should dismiss the dialog. Defaults to true. */
  closableByEsc?: boolean;
}

/**
 * Source/reason that caused the dialog to close.
 */
export type DialogCloseSource =
  'button' |
  'titlebar-x' |
  'esc' |
  'programmatic' |
  'window-destroyed';

/**
 * Final result emitted when a dialog closes.
 */
export interface DialogResult {
  source: DialogCloseSource;
  buttonId?: string;
  payload?: unknown;
  windowId: string;
  at: number;
}
