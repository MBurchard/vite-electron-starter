/**
 * modules/electron/src/windowMgt/dialog/index.ts
 *
 * @file Public entry point for dialog subsystem APIs.
 */

export {openDialogWindow, setDialogMessage} from './DialogService.js';
export type {DialogHandle, DialogLifecycleHooks, OpenDialogWindowOptions} from './types.js';
