export type IpcChannel = 'frontend-logging' | 'getVersions' | 'show-demo-popup';

export interface Versions {
  chrome: string;
  electron: string;
  node: string;
}
