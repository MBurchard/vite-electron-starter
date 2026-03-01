/**
 * modules/electron/src/demo/displayDemo.ts
 *
 * @file IPC handlers for the display demo window. Manages display data queries, live display updates,
 * and the display demo window lifecycle. Delete this file when using this project as a starter template.
 *
 * @author Martin Burchard
 */
import type {Display, WindowPlacement} from '@common/core/window.js';
import type {BrowserWindow} from 'electron';
import {IpcDemoChannels} from '@common/demo/ipc.js';
import {delay} from '@common/utils.js';
import {broadcast, handleFromRenderer, offFromRenderer, onFromRenderer, removeHandler} from '../ipc.js';
import {getLogger} from '../logging/index.js';
import {DISPLAY_WATCHER} from '../utils/DisplayWatcher.js';
import {
  openDialogWindow,
  setDialogMessage,
  showError,
  showInfo,
  showSuccess,
  showWarning,
} from '../windowMgt/dialog/index.js';
import {createWindow} from '../windowMgt/WindowManager.js';

const log = getLogger('electron.demo.display');

// ---- Public API ----

/**
 * Register display-demo-specific IPC handlers.
 *
 * @param mainWindow - The main BrowserWindow instance (already ready).
 */
export function registerDisplayDemoHandlers(mainWindow: BrowserWindow) {
  onFromRenderer(IpcDemoChannels.showDisplayDemo, () => {
    showDisplayDemo(mainWindow);
  });
}

// ---- Internal Helpers ----

/**
 * Open the display demo window and hide/show the main window around its lifecycle.
 *
 * @param mainWindow - The main BrowserWindow instance.
 */
function showDisplayDemo(mainWindow: BrowserWindow) {
  log.debug('show display demo');

  const onDisplayUpdate = (displays: Display[]) => {
    broadcast(IpcDemoChannels.updateDisplayData, displays);
  };

  handleFromRenderer(IpcDemoChannels.getDisplayData, (): Display[] => {
    return DISPLAY_WATCHER.getDisplays();
  });
  DISPLAY_WATCHER.on('update', onDisplayUpdate);

  const demoController = createWindow({
    contentPage: 'displayDemo',
    windowOptions: {
      height: 768,
      width: 1024,
    },
  });

  if (!demoController) {
    log.error('Failed to create display demo window');
    removeHandler(IpcDemoChannels.getDisplayData);
    DISPLAY_WATCHER.off('update', onDisplayUpdate);
    return;
  }

  demoController.whenWindowReady.then(() => {
    onFromRenderer(IpcDemoChannels.showStartupDialogDemo, showStartupDialogDemo);
    onFromRenderer(IpcDemoChannels.showDialogTypeDemo, showDialogTypeDemo);
    onFromRenderer(IpcDemoChannels.showScreenPrimaryDemo, showScreenPrimaryDemo);
    onFromRenderer(IpcDemoChannels.showScreenAppDemo, showScreenAppDemo);
    onFromRenderer(IpcDemoChannels.showScreenActiveDemo, showScreenActiveDemo);
  }).catch((reason) => {
    log.error('Display demo window failed to load:', reason);
  });

  if (!mainWindow.isDestroyed()) {
    mainWindow.hide();
  }

  demoController.browserWindow.on('closed', () => {
    log.debug('Display demo closed, showing main window');
    removeHandler(IpcDemoChannels.getDisplayData);
    DISPLAY_WATCHER.off('update', onDisplayUpdate);
    offFromRenderer(IpcDemoChannels.showStartupDialogDemo, showStartupDialogDemo);
    offFromRenderer(IpcDemoChannels.showDialogTypeDemo, showDialogTypeDemo);
    offFromRenderer(IpcDemoChannels.showScreenPrimaryDemo, showScreenPrimaryDemo);
    offFromRenderer(IpcDemoChannels.showScreenAppDemo, showScreenAppDemo);
    offFromRenderer(IpcDemoChannels.showScreenActiveDemo, showScreenActiveDemo);
    if (!mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
}

/**
 * Open the startup dialogue demo, stream progress lines, and close it after a short delay.
 */
function showStartupDialogDemo() {
  const STARTUP_MESSAGES = [
    'Initializing Vite-Electron Starter...',
    'Loading configuration...',
    'Preparing logging pipeline...',
    'Bootstrapping IPC channels...',
    'Starting window management...',
    'Checking display environment...',
    'Warming renderer bridge...',
    'Applying UI resources...',
    'Running final health checks...',
    'Initialization complete.',
  ];

  const dialog = openDialogWindow({
    autoResize: false,
    type: 'info',
    title: 'Application Startup',
    placement: {
      horizontal: 'center',
      top: '30%',
    },
    closableByEsc: false,
    closableByX: false,
    buttons: [],
  });

  dialog.whenShown.then(async () => {
    let currentMessage = '';

    for (const line of STARTUP_MESSAGES) {
      currentMessage = currentMessage ? `${currentMessage}\n${line}` : line;
      setDialogMessage(dialog.dialogId, currentMessage);
      await delay(250);
    }
    await delay(2_000);
  }).catch((reason) => {
    log.error('Error while showing startup dialog:', reason);
  }).finally(() => {
    dialog.close().catch((reason) => {
      log.error('Failed to close startup dialog after error:', reason);
    });
  });
}

/**
 * Show a confirmation dialogue letting the user pick a dialogue type, then open that type as a follow-up.
 */
function showDialogTypeDemo() {
  const placement: WindowPlacement = {
    horizontal: 'center',
    top: '30%',
  };
  const confirm = openDialogWindow({
    type: 'confirm',
    title: 'Dialog Type Demo',
    message: 'Pick a dialog type to preview:',
    placement,
    buttons: [
      {id: 'error', label: 'Error', variant: 'primary'},
      {id: 'info', label: 'Info', variant: 'primary'},
      {id: 'success', label: 'Success', variant: 'primary'},
      {id: 'warning', label: 'Warning', variant: 'primary'},
    ],
  });

  confirm.result.then((result) => {
    const showFn = {
      error: showError,
      info: showInfo,
      success: showSuccess,
      warning: showWarning,
    }[result.buttonId ?? ''];
    if (!showFn) {
      return;
    }
    const type = result.buttonId!;
    const title = `${type.charAt(0).toUpperCase()}${type.slice(1)} Dialogue`;
    showFn(title, `This is a ${type} dialogue.\nIt uses the ${type} colour scheme.`).catch((reason) => {
      log.error('Error while showing follow-up dialogue:', reason);
    });
  }).catch((reason) => {
    log.error('Error while showing dialogue type demo:', reason);
  });
}

/**
 * Show a success dialogue on the primary display.
 */
function showScreenPrimaryDemo() {
  showSuccess('Primary Screen', 'This dialogue opened on the primary display.', {
    placement: {screen: 'primary', horizontal: 'center', top: '30%'},
  }).catch((reason) => {
    log.error('Error while showing primary screen demo:', reason);
  });
}

/**
 * Show a success dialogue on the same display as the main application window.
 */
function showScreenAppDemo() {
  showSuccess('App Screen', 'This dialogue opened on the main window display.', {
    placement: {screen: 'app', horizontal: 'center', top: '30%'},
  }).catch((reason) => {
    log.error('Error while showing app screen demo:', reason);
  });
}

/**
 * Show a success dialogue on the display under the cursor, after a 5-second delay.
 */
function showScreenActiveDemo() {
  delay(5_000).then(() => {
    return showSuccess('Active Screen', 'This dialogue opened on the display under your cursor.', {
      placement: {screen: 'active', horizontal: 'center', top: '30%'},
    });
  }).catch((reason) => {
    log.error('Error while showing active screen demo:', reason);
  });
}
