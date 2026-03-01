/**
 * modules/common/src/demo/ipc.ts
 *
 * @file IPC channel constants for demo-only features. Delete this file (and its callers) when using this
 * project as a starter template.
 */

/**
 * IPC channels used exclusively by demo code. Not part of the core starter template.
 */
export const IpcDemoChannels = {
  // Renderer -> Main: trigger opening of the display demo window
  showDisplayDemo: 'showDisplayDemo',
  // Renderer -> Main (invoke/handle): request current display list
  getDisplayData: 'getDisplayData',
  // Main -> Renderer: broadcast updated display list on layout change
  updateDisplayData: 'updateDisplayData',
  // Renderer -> Main: run a startup dialogue sequence demo with progressive status updates
  showStartupDialogDemo: 'showStartupDialogDemo',
  // Renderer -> Main: show a confirmation dialogue with buttons for each dialogue type
  showDialogTypeDemo: 'showDialogTypeDemo',
  // Renderer -> Main: show a success dialogue on the primary screen
  showScreenPrimaryDemo: 'showScreenPrimaryDemo',
  // Renderer -> Main: show a success dialogue on the app (main window) screen
  showScreenAppDemo: 'showScreenAppDemo',
  // Renderer -> Main: show a success dialogue on the active (cursor) screen after 5s delay
  showScreenActiveDemo: 'showScreenActiveDemo',
} as const;

export type DemoIpcChannel = typeof IpcDemoChannels[keyof typeof IpcDemoChannels];
