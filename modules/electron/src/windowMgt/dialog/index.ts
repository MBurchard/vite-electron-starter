/**
 * modules/electron/src/windowMgt/dialog/index.ts
 *
 * @file Public entry point for dialogue subsystem APIs.
 */

export {openDialogWindow, setDialogMessage, showError, showInfo, showSuccess, showWarning} from './DialogService.js';
export type {DialogHandle, DialogLifecycleHooks, OpenDialogWindowOptions, SimpleDialogOptions} from './types.js';
