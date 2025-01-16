/// <reference types="vite/client" />

import type {Plugin} from 'vite';

export interface PageConfig {
  modules: string[];
  template?: string;
  title?: string;
}

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
 * Custom Plugin Interface for Vite with optional hooks.
 */
export interface CustomPlugin extends Plugin {
  buildStart?: (options: InputOptions) => void;
  buildEnd?: (error?: Error) => void;
  closeBundle?: () => Promise<void> | void;
}
