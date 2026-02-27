import type {ViteElectronConfig} from './types/env.js';
import process from 'node:process';

export const viteElectronConfig: ViteElectronConfig = {
  app: {
    root: 'modules/app',
    pages: {
      // ---- Core Pages ----
      main: {
        devTools: true,
        modules: ['src/index.ts'],
        title: `${process.env.VITE_APP_TITLE ?? 'Vite-Electron-Starter'} - Version: ${process.env.npm_package_version}`,
      },
      dialog: {
        modules: ['src/dialog.ts'],
        template: 'dialog.html',
        title: 'Dialog',
      },
      // ---- Demo Pages (remove for clean starter) ----
      displayDemo: {
        modules: ['src/demo/displayDemo.ts'],
        title: 'Display Demo',
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
