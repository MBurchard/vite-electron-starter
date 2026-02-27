/**
 * modules/electron/src/windowMgt/dialog/DialogIpc.ts
 *
 * @file IPC registration for the dialog subsystem.
 */

import type {DialogCloseSource} from '@common/dialog/types.js';
import {DialogIpcChannels} from '@common/dialog/ipc.js';
import {onFromRenderer} from '../../ipc.js';
import {
  handleDialogAction,
  handleDialogDismissed,
  markDialogOpened,
  markDialogShown,
} from './DialogService.js';

let handlersRegistered = false;

/**
 * Register core dialog IPC handlers once.
 */
export function setupDialogHandlers(): void {
  if (handlersRegistered) {
    return;
  }
  handlersRegistered = true;

  onFromRenderer(DialogIpcChannels.dialogOpened, (_event, windowId: string) => {
    markDialogOpened(windowId);
  });

  onFromRenderer(DialogIpcChannels.dialogShown, (_event, windowId: string) => {
    markDialogShown(windowId);
  });

  onFromRenderer(DialogIpcChannels.dialogAction, (_event, windowId: string, buttonId: string, payload?: unknown) => {
    handleDialogAction(windowId, buttonId, payload);
  });

  onFromRenderer(
    DialogIpcChannels.dialogDismissed,
    (_event, windowId: string, source: DialogCloseSource) => {
      if (source === 'titlebar-x' || source === 'esc') {
        handleDialogDismissed(windowId, source);
      }
    },
  );
}
