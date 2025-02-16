export interface Display extends Electron.Display {
  primary: boolean;
}

// Defines all IPC Channels as a lookup object.
// This provides clean typing, code completion, and avoids typos.
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

// The type IpcChannel includes all predefined IPC Channels,
// but also allows for the use of other string values.
export type IpcChannel = typeof IpcChannels[keyof typeof IpcChannels] | (string & {});

export interface Versions {
  chrome: string;
  electron: string;
  node: string;
}
