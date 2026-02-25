/**
 * modules/common/src/definitions.ts
 *
 * @file Shared type definitions and IPC channel constants used by both the Electron main process and the renderer.
 *
 * @author Martin Burchard
 */

/**
 * Extended display information including a flag indicating the primary display.
 */
export interface Display extends Electron.Display {
  primary: boolean;
}

/**
 * All IPC channel identifiers as a lookup object. Provides clean typing, code completion, and avoids typos.
 */
export const IpcChannels = {
  // logs messages from the frontend to the backend
  frontendLogging: 'frontendLogging',
  // request display data from the backend
  getDisplayData: 'getDisplayData',
  // Request version information (Electron, Node.js, Chrome).
  getVersions: 'getVersions',
  // Trigger the opening of the display demo window.
  showDisplayDemo: 'showDisplayDemo',
  // Sends updated display data from the backend to the frontend.
  updateDisplayData: 'updateDisplayData',
} as const;

/**
 * Union of all predefined IPC channel names, plus any arbitrary string for extensibility.
 */
export type IpcChannel = typeof IpcChannels[keyof typeof IpcChannels] | (string & {});

/**
 * Version information for the Electron runtime components.
 */
export interface Versions {
  chrome: string;
  electron: string;
  node: string;
}
