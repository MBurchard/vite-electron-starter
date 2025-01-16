import type {ViteElectronConfig} from './vite-env.js';
import process from 'node:process';

export const viteElectronConfig: ViteElectronConfig = {
  app: {
    root: 'modules/app',
    pages: {
      main: {
        modules: ['src/index.ts'],
        title: `${process.env.VITE_APP_TITLE ?? 'Vite-Electron-Starter'} - Version: ${process.env.npm_package_version}`,
      },
      popup: {
        modules: ['src/popup.ts'],
        template: 'popup.html',
        title: 'My PopUp Title',
      },
    },
  },
  common: {
    root: 'modules/common',
  },
  electron: {
    root: 'modules/electron',
  },
  preload: {
    root: 'modules/electron-preload',
  },
  output: {
    app: '../../dist',
    electron: '../../dist-electron',
  },
};
