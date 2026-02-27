/**
 * modules/common/src/dialog/ipc.ts
 *
 * @file IPC channel constants dedicated to the dialog subsystem.
 */

/**
 * IPC channels used exclusively by the core dialog system.
 */
export const DialogIpcChannels = {
  // Main -> Dialog: push DialogConfig after window is ready
  initDialog: 'initDialog',
  // Dialog -> Main: renderer has initialized and bound handlers
  dialogOpened: 'dialogOpened',
  // Dialog -> Main: dialog was laid out and pack sizing was reported
  dialogShown: 'dialogShown',
  // Dialog -> Main: one dialog button was clicked
  dialogAction: 'dialogAction',
  // Dialog -> Main: dialog dismissed without button click (x, esc)
  dialogDismissed: 'dialogDismissed',
  // Main -> Dialog: replace message/content text
  dialogSetMessage: 'dialogSetMessage',
} as const;

/**
 * Union of all predefined dialog IPC channel names.
 */
export type DialogIpcChannel = typeof DialogIpcChannels[keyof typeof DialogIpcChannels];
