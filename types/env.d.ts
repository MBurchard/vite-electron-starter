/// <reference types="vite/client" />

import type {Plugin} from 'vite';

declare global {
  interface ImportMetaEnv {
    readonly VITE_APP_PAGE_DEVTOOLS?: string;
  }
}

/**
 * Configuration for a single page entry in the multi-page build.
 */
export interface PageConfig {
  devTools?: boolean;
  id?: string;
  modules: string[];
  template?: string;
  title?: string;
}

/**
 * Top-level configuration describing module roots, page entries, and output paths for the Vite + Electron build.
 */
export interface ViteElectronConfig {
  app: {
    root: string;
    pages: {
      [pageName: string]: PageConfig;
    };
  };
  common: {
    root: string;
  };
  electron: {
    root: string;
  };
  preload: {
    root: string;
  };
  output: {
    app: string;
    electron: string;
  };
}

/**
 * Custom Plugin Interface for Vite with optional lifecycle hooks.
 *
 * Note: InputOptions comes from Rollup's type definitions, made globally available through Vite's re-exports.
 */
export interface CustomPlugin extends Plugin {
  buildStart?: (options: InputOptions) => void;
  buildEnd?: (error?: Error) => void;
  closeBundle?: () => Promise<void> | void;
}
