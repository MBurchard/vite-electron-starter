export interface Display extends Electron.Display {
  primary: boolean;
}

export type IpcChannel =
  // logs messages from the frontend to the backend
  'frontendLogging' |
  // request display data from the backend
  'getDisplayData' |
  // Request version information (Electron, Node.js, Chrome).
  'getVersions' |
  // Trigger the opening of the display demo window.
  'showDisplayDemo' |
  // Sends updated display data from the backend to the frontend.
  'updateDisplayData' |
  // Notifies the backend that a window has fully loaded.
  'windowFullyLoaded';

export interface Versions {
  chrome: string;
  electron: string;
  node: string;
}
