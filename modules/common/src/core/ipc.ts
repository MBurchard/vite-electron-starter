/**
 * modules/common/src/core/ipc.ts
 *
 * @file Core IPC channel constants shared between Electron main and renderer contexts.
 */

/**
 * IPC channels used by core starter functionality.
 */
export const CoreIpcChannels = {
  // logs messages from the frontend to the backend
  frontendLogging: 'frontendLogging',
  // Request version information (Electron, Node.js, Chrome).
  getVersions: 'getVersions',
  // Renderer -> Main: report that content size has changed
  rendererContentSizeChanged: 'rendererContentSizeChanged',
} as const;

/**
 * Union of all predefined core IPC channel names.
 */
export type CoreIpcChannel = typeof CoreIpcChannels[keyof typeof CoreIpcChannels];
