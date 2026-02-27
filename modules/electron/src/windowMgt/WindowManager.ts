/**
 * modules/electron/src/windowMgt/WindowManager.ts
 *
 * @file Factory for creating Electron BrowserWindows with security defaults (context isolation, sandbox, no node
 * integration). Handles preload script injection, window ID assignment, content page loading for both dev server
 * and production builds, and window lifecycle tracking.
 *
 * Usage:
 *
 *   const controller = createWindow({
 *     contentPage: 'main',           // loads main.html (prod) or /main (dev server)
 *     windowOptions: {               // standard BrowserWindowConstructorOptions
 *       width: 1024,
 *       height: 768,
 *     },
 *     withDevTools: true,            // open DevTools in development mode
 *   });
 *   // controller is available immediately; loading happens in the background.
 *   await controller.whenWindowReady;  // optional: wait until content has loaded
 *
 * Security: webPreferences are enforced by the factory and cannot be overridden via windowOptions.
 * Each window receives a unique ID, is registered in the IPC window registry, and reports its
 * startup duration via a one-time IPC event from the preload script.
 *
 * @author Martin Burchard
 */
import type {WindowPlacement} from '@common/core/window.js';
import type {BrowserWindowConstructorOptions} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {app, BrowserWindow} from 'electron';
import {v4 as uuidv4} from 'uuid';
import {registerWindow} from '../ipc.js';
import {getLogger} from '../logging/index.js';
import {WindowController} from './WindowController.js';

const log = getLogger('WindowManager');
const pageDevToolsByPage = parsePageDevTools();

/**
 * Parse the VITE_APP_PAGE_DEVTOOLS environment variable into a per-page boolean map.
 *
 * @returns Object mapping page names to their DevTools enabled state.
 */
function parsePageDevTools(): Record<string, boolean> {
  try {
    const raw = import.meta.env.VITE_APP_PAGE_DEVTOOLS as unknown;
    if (!raw) {
      return {};
    }

    const parsed = typeof raw === 'string' ? JSON.parse(raw) as unknown : raw;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      log.warn(
        'Invalid VITE_APP_PAGE_DEVTOOLS format, expected object map and falling back to all pages without DevTools.',
      );
      return {};
    }

    return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, value === true]));
  } catch (error) {
    log.warn('Invalid VITE_APP_PAGE_DEVTOOLS, falling back to all pages without DevTools.', error);
    return {};
  }
}

/**
 * Configuration for creating a new BrowserWindow.
 */
interface WindowConfiguration {
  /** Page name without extension, used as URL segment (dev) and filename with `.html` suffix (prod). */
  contentPage: string;
  /** Standard Electron window options. Note: `webPreferences` will be overridden by security defaults. */
  windowOptions?: BrowserWindowConstructorOptions;
  /** Override page-level DevTools config (only effective in development mode). */
  withDevTools?: boolean;
  /** Enable pack mode: window stays hidden until the first pack, then sizes to content. */
  pack?: boolean;
  /** Centre the window on its display before showing. Has no effect in pack mode (centering is automatic there). */
  center?: boolean;
  /** Optional declarative placement for initial and pack-related positioning. */
  placement?: WindowPlacement;
  /** Optional window ID. If omitted, a UUIDv4 is generated. */
  windowId?: string;
}

const ENV = process.env.NODE_ENV ?? 'production';

/**
 * Create a new BrowserWindow with the given configuration. Sets up security defaults (context isolation, sandbox,
 * no node integration), injects a unique window ID, and creates a WindowController for pack mode and display
 * awareness. Content loading and show logic happen asynchronously in the background; use
 * `controller.whenWindowReady` to wait for the content to finish loading.
 *
 * @param conf - Window configuration including content page, options, and devtools flag.
 * @returns The WindowController wrapping the created BrowserWindow, or undefined if an error occurred.
 */
export function createWindow(conf: WindowConfiguration): WindowController | undefined {
  try {
    const windowOptions = conf.windowOptions || {};
    const packMode = conf.pack === true;
    const showWindow = !packMode && !(windowOptions.show === false);
    const windowId = conf.windowId ?? uuidv4();
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const preloadJS = path.join(__dirname, '..', 'preload.js');
    const withDevTools = conf.withDevTools ?? pageDevToolsByPage[conf.contentPage] ?? false;

    log.debug('using preload script:', preloadJS);

    // Security-critical: webPreferences are set explicitly and intentionally override
    // any webPreferences from windowOptions to enforce context isolation and sandbox.
    const win = new BrowserWindow({
      ...windowOptions,
      show: false,
      webPreferences: {
        additionalArguments: [`--window-id?${windowId}`, ...(packMode ? ['--auto-resize'] : [])],
        contextIsolation: true,
        nodeIntegration: false,
        preload: preloadJS,
        sandbox: true,
        webviewTag: false,
      },
    });

    registerWindow(windowId, win);

    const controller = new WindowController(windowId, conf.contentPage, win, packMode, conf.placement);

    if (ENV === 'development' && withDevTools) {
      log.debug('Using devtools');
      win.webContents.openDevTools();
    }

    loadAndShow(controller, conf, showWindow).catch((reason) => {
      log.error(`Error loading window '${conf.contentPage}' (${windowId}):`, reason);
      controller.rejectReady(reason);
    });

    return controller;
  } catch (e) {
    log.error('Error in Function createWindow:', conf, '\n', e);
  }
}

/**
 * Load the content page and, for non-pack windows, show the window afterwards. Marks the controller as ready
 * once loading completes successfully.
 *
 * @param controller - The WindowController wrapping the target window.
 * @param conf - The original window configuration.
 * @param showWindow - Whether to show the window after loading (false for pack mode windows).
 */
async function loadAndShow(
  controller: WindowController,
  conf: WindowConfiguration,
  showWindow: boolean,
): Promise<void> {
  const win = controller.browserWindow;

  if (ENV === 'development' && process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(`${process.env.VITE_DEV_SERVER_URL}${conf.contentPage}`);
  } else {
    log.info('App Path:', app.getAppPath());
    const filePath = path.resolve(app.getAppPath(), 'dist', `${conf.contentPage}.html`);
    await fs.access(filePath);
    log.debug('loading content page', filePath);
    await win.loadFile(filePath);
  }

  if (showWindow) {
    if (conf.placement) {
      controller.applyPlacement();
    } else if (conf.center) {
      controller.center();
    }
    win.show();
    controller.markVisible();
  }

  controller.markReady();
}
