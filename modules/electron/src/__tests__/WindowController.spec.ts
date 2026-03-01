/**
 * modules/electron/src/__tests__/WindowController.spec.ts
 *
 * @file Tests for WindowController covering pack mode (clamping, first-pack show/centre), display change detection,
 * bounds requests via the registry, and dispose cleanup.
 */
import type {WindowBounds} from '@common/definitions.js';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

// ---- Hoisted mocks ----

const mocks = vi.hoisted(() => {
  const displayWatcherListeners = new Map<string, Set<(...args: any[]) => void>>();

  return {
    // IPC helpers
    onFromRenderer: vi.fn(),
    offFromRenderer: vi.fn(),
    sendToRenderer: vi.fn(),

    // screen
    getDisplayMatching: vi.fn(),
    getPrimaryDisplay: vi.fn(),
    getCursorScreenPoint: vi.fn(),
    getDisplayNearestPoint: vi.fn(),

    // DisplayWatcher
    displayWatcherOn: vi.fn((event: string, listener: (...args: any[]) => void) => {
      if (!displayWatcherListeners.has(event)) {
        displayWatcherListeners.set(event, new Set());
      }
      displayWatcherListeners.get(event)!.add(listener);
    }),
    displayWatcherOff: vi.fn((event: string, listener: (...args: any[]) => void) => {
      displayWatcherListeners.get(event)?.delete(listener);
    }),
    displayWatcherListeners,

    // Logger
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
});

vi.mock('electron', () => ({
  screen: {
    getDisplayMatching: mocks.getDisplayMatching,
    getPrimaryDisplay: mocks.getPrimaryDisplay,
    getCursorScreenPoint: mocks.getCursorScreenPoint,
    getDisplayNearestPoint: mocks.getDisplayNearestPoint,
  },
}));

vi.mock('../ipc.js', () => ({
  onFromRenderer: mocks.onFromRenderer,
  offFromRenderer: mocks.offFromRenderer,
  sendToRenderer: mocks.sendToRenderer,
}));

vi.mock('../utils/DisplayWatcher.js', () => ({
  DISPLAY_WATCHER: {
    on: mocks.displayWatcherOn,
    off: mocks.displayWatcherOff,
  },
}));

vi.mock('../logging/index.js', () => ({
  getLogger: () => ({
    debug: mocks.debug,
    error: mocks.error,
    warn: mocks.warn,
  }),
}));

// ---- Module import (after mocks) ----

const {WindowController, getController, setMainWindowId, getMainWindowId} =
  await import('../windowMgt/WindowController.js');

// ---- Test helpers ----

const PRIMARY_DISPLAY = {
  id: 1,
  bounds: {x: 0, y: 0, width: 1920, height: 1080},
  workArea: {x: 0, y: 0, width: 1920, height: 1040},
  scaleFactor: 1,
  rotation: 0,
  label: 'Primary',
};

const SECONDARY_DISPLAY = {
  id: 2,
  bounds: {x: 1920, y: 0, width: 2560, height: 1440},
  workArea: {x: 1920, y: 0, width: 2560, height: 1400},
  scaleFactor: 2,
  rotation: 0,
  label: 'Secondary',
};

/**
 * Create a mock BrowserWindow with the given initial bounds.
 *
 * @param bounds - Initial bounds rectangle.
 * @returns A mock object implementing the BrowserWindow interface.
 */
function createMockWindow(bounds: WindowBounds = {x: 100, y: 100, width: 800, height: 600}) {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  let currentBounds = {...bounds};
  let contentSize = {width: bounds.width, height: bounds.height};

  return {
    getBounds: vi.fn(() => ({...currentBounds})),
    getContentSize: vi.fn(() => [contentSize.width, contentSize.height]),
    setContentSize: vi.fn((w: number, h: number) => {
      contentSize = {width: w, height: h};
      currentBounds = {...currentBounds, width: w, height: h};
    }),
    setPosition: vi.fn((x: number, y: number) => {
      currentBounds = {...currentBounds, x, y};
    }),
    show: vi.fn(),
    close: vi.fn(),
    setOpacity: vi.fn(),
    isVisible: vi.fn(() => false),
    isDestroyed: vi.fn(() => false),
    on: vi.fn((event: string, cb: (...args: any[]) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(cb);
    }),
    removeListener: vi.fn((event: string, cb: (...args: any[]) => void) => {
      listeners.get(event)?.delete(cb);
    }),
    // Test helper: emit an event
    _emit(event: string, ...args: any[]) {
      listeners.get(event)?.forEach(cb => cb(...args));
    },
    _listeners: listeners,
  };
}

/**
 * Set up the default display mocks (primary display, matching primary).
 */
function setupDefaultDisplayMocks() {
  mocks.getDisplayMatching.mockReturnValue(PRIMARY_DISPLAY);
  mocks.getPrimaryDisplay.mockReturnValue({id: PRIMARY_DISPLAY.id});
}

/**
 * Extract the IPC listener registered via onFromRenderer for a given channel.
 *
 * @param channel - The IPC channel name.
 * @returns The listener function, or undefined if not found.
 */
function getRegisteredListener(channel: string): ((...args: any[]) => void) | undefined {
  const call = mocks.onFromRenderer.mock.calls.find((args: any[]) => args[0] === channel);
  return call?.[1];
}

// ---- Tests ----

describe('windowController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.displayWatcherListeners.clear();
    setupDefaultDisplayMocks();
  });

  afterEach(() => {
    // Clean up any controllers left in the registry
    const controller = getController('test-window');
    controller?.dispose();
  });

  // ---- Construction and Registry ----

  describe('construction', () => {
    it('should register itself in the controller registry', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);
      expect(getController('test-window')).toBe(controller);
      controller.dispose();
    });

    it('should register an IPC listener for rendererContentSizeChanged', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      expect(mocks.onFromRenderer).toHaveBeenCalledWith('rendererContentSizeChanged', expect.any(Function));
      controller.dispose();
    });

    it('should subscribe to DisplayWatcher updates', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      expect(mocks.displayWatcherOn).toHaveBeenCalledWith('update', expect.any(Function));
      controller.dispose();
    });

    it('should register a moved listener on the BrowserWindow', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      expect(win.on).toHaveBeenCalledWith('moved', expect.any(Function));
      controller.dispose();
    });

    it('should accept a WindowPlacement as fourth parameter (shorthand without pack mode)', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, {horizontal: 'right'});

      // Pack mode should be off: content size reports are ignored
      const packListener = getRegisteredListener('rendererContentSizeChanged')!;
      packListener({}, 'test-window', 400, 300);
      expect(win.setContentSize).not.toHaveBeenCalled();

      // Placement should be active: applyPlacement uses the horizontal: 'right' value
      controller.applyPlacement();
      // x = workArea.x + workArea.width - bounds.width = 0 + 1920 - 800 = 1120
      expect(win.setPosition).toHaveBeenCalledWith(1120, expect.any(Number));
      controller.dispose();
    });

    it('should close the window when it is not visible after the show timeout', () => {
      vi.useFakeTimers();
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      vi.advanceTimersByTime(5000);

      expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('not visible after 5000ms'));
      expect(win.close).toHaveBeenCalledOnce();
      controller.dispose();
      vi.useRealTimers();
    });
  });

  // ---- Pack Mode ----

  describe('pack mode', () => {
    it('should ignore pack events when pack mode is disabled', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      const packListener = getRegisteredListener('rendererContentSizeChanged')!;
      packListener({}, 'test-window', 400, 300);

      expect(win.setContentSize).not.toHaveBeenCalled();
      controller.dispose();
    });

    it('should set content size using initial width and reported height', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, true);

      const packListener = getRegisteredListener('rendererContentSizeChanged')!;
      packListener({}, 'test-window', 400, 300);

      // Width stays at initial 800 (from mock window), only height from renderer
      expect(win.setContentSize).toHaveBeenCalledWith(800, 300);
      controller.dispose();
    });

    it('should clamp height to work area without changing width', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, true);

      const packListener = getRegisteredListener('rendererContentSizeChanged')!;
      packListener({}, 'test-window', 3000, 2000);

      // Width stays at initial 800, height clamped to work area (1040)
      expect(win.setContentSize).toHaveBeenCalledWith(800, 1040);
      controller.dispose();
    });

    it('should show and centre the window on the first pack', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, true);

      const packListener = getRegisteredListener('rendererContentSizeChanged')!;
      packListener({}, 'test-window', 400, 300);

      expect(win.show).toHaveBeenCalledOnce();
      expect(win.setPosition).toHaveBeenCalled();
      controller.dispose();
    });

    it('should not show again on subsequent packs', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, true);

      const packListener = getRegisteredListener('rendererContentSizeChanged')!;
      packListener({}, 'test-window', 400, 300);
      win.show.mockClear();

      packListener({}, 'test-window', 500, 400);
      expect(win.show).not.toHaveBeenCalled();
      controller.dispose();
    });

    it('should ignore pack events from other windows', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, true);

      const packListener = getRegisteredListener('rendererContentSizeChanged')!;
      packListener({}, 'other-window', 400, 300);

      expect(win.setContentSize).not.toHaveBeenCalled();
      controller.dispose();
    });

    it('should apply placement and warn on conflicting anchors (top over bottom, left over right)', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, true, {
        bottom: 20,
        left: 100,
        right: 50,
        top: '10%',
      });

      expect(mocks.warn).toHaveBeenCalledWith(
        'Window \'test\' (test-window): placement has both \'top\' and \'bottom\'; using \'top\'.',
      );
      expect(mocks.warn).toHaveBeenCalledWith(
        'Window \'test\' (test-window): placement has both \'left\' and \'right\'; using \'left\'.',
      );

      const packListener = getRegisteredListener('rendererContentSizeChanged')!;
      packListener({}, 'test-window', 400, 300);

      expect(win.setPosition).toHaveBeenCalledWith(100, 104);
      controller.dispose();
    });

    it('should place the window using a right pixel offset', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, true, {right: 50});

      const packListener = getRegisteredListener('rendererContentSizeChanged')!;
      packListener({}, 'test-window', 400, 300);

      // x = workArea.x + workArea.width - bounds.width - right = 0 + 1920 - 800 - 50 = 1070
      expect(win.setPosition).toHaveBeenCalledWith(1070, expect.any(Number));
      controller.dispose();
    });

    it('should place the window using a bottom pixel offset', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, true, {bottom: 40});

      const packListener = getRegisteredListener('rendererContentSizeChanged')!;
      packListener({}, 'test-window', 400, 300);

      // y = workArea.y + workArea.height - bounds.height - bottom = 0 + 1040 - 300 - 40 = 700
      expect(win.setPosition).toHaveBeenCalledWith(expect.any(Number), 700);
      controller.dispose();
    });

    it('should align to horizontal left', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, true, {horizontal: 'left'});

      const packListener = getRegisteredListener('rendererContentSizeChanged')!;
      packListener({}, 'test-window', 400, 300);

      expect(win.setPosition).toHaveBeenCalledWith(0, expect.any(Number));
      controller.dispose();
    });

    it('should align to horizontal right', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, true, {horizontal: 'right'});

      const packListener = getRegisteredListener('rendererContentSizeChanged')!;
      packListener({}, 'test-window', 400, 300);

      // x = workArea.x + workArea.width - bounds.width = 0 + 1920 - 800 = 1120
      expect(win.setPosition).toHaveBeenCalledWith(1120, expect.any(Number));
      controller.dispose();
    });

    it('should align to vertical top', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, true, {vertical: 'top'});

      const packListener = getRegisteredListener('rendererContentSizeChanged')!;
      packListener({}, 'test-window', 400, 300);

      expect(win.setPosition).toHaveBeenCalledWith(expect.any(Number), 0);
      controller.dispose();
    });

    it('should align to vertical bottom', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, true, {vertical: 'bottom'});

      const packListener = getRegisteredListener('rendererContentSizeChanged')!;
      packListener({}, 'test-window', 400, 300);

      // y = workArea.y + workArea.height - bounds.height = 0 + 1040 - 300 = 740
      expect(win.setPosition).toHaveBeenCalledWith(expect.any(Number), 740);
      controller.dispose();
    });

    it('should warn and use 0 for an invalid offset string', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, true, {
        top: 'abc' as any,
      });

      const packListener = getRegisteredListener('rendererContentSizeChanged')!;
      packListener({}, 'test-window', 400, 300);

      expect(mocks.warn).toHaveBeenCalledWith(
        'Window \'test\' (test-window): invalid placement \'top\' (abc); using 0.',
      );
      // With top=0 the window sits at workArea.y = 0
      expect(win.setPosition).toHaveBeenCalledWith(expect.any(Number), 0);
      controller.dispose();
    });
  });

  // ---- markVisible ----

  describe('markVisible', () => {
    it('should be idempotent: second markVisible does not log again', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      controller.markVisible();
      const visibleLogs = mocks.debug.mock.calls.filter(
        (args: any[]) => typeof args[0] === 'string' && args[0].includes('visible after'),
      );
      expect(visibleLogs).toHaveLength(1);

      controller.markVisible();
      const visibleLogsAfter = mocks.debug.mock.calls.filter(
        (args: any[]) => typeof args[0] === 'string' && args[0].includes('visible after'),
      );
      expect(visibleLogsAfter).toHaveLength(1);

      controller.dispose();
    });
  });

  // ---- Center ----

  describe('center', () => {
    it('should centre the window on its current display work area', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      controller.center();

      expect(win.setPosition).toHaveBeenCalled();
      controller.dispose();
    });

    it('should not centre when disposed', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      controller.dispose();
      win.setPosition.mockClear();
      controller.center();

      expect(win.setPosition).not.toHaveBeenCalled();
    });
  });

  // ---- applyPlacement guards ----

  describe('applyPlacement', () => {
    it('should not position when no placement is set', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      controller.applyPlacement();

      expect(win.setPosition).not.toHaveBeenCalled();
      controller.dispose();
    });

    it('should not position when disposed', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false, {horizontal: 'center'});

      controller.dispose();
      win.setPosition.mockClear();
      controller.applyPlacement();

      expect(win.setPosition).not.toHaveBeenCalled();
    });
  });

  // ---- Display Change ----

  describe('display change', () => {
    it('should detect display change on moved event', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      mocks.getDisplayMatching.mockReturnValue(SECONDARY_DISPLAY);
      mocks.getPrimaryDisplay.mockReturnValue({id: PRIMARY_DISPLAY.id});

      win._emit('moved');

      expect(mocks.debug).toHaveBeenCalledWith(
        expect.stringContaining('Display changed'),
      );
      controller.dispose();
    });

    it('should detect display change on DisplayWatcher update', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      mocks.getDisplayMatching.mockReturnValue(SECONDARY_DISPLAY);
      mocks.getPrimaryDisplay.mockReturnValue({id: PRIMARY_DISPLAY.id});

      mocks.displayWatcherListeners.get('update')?.forEach(cb => cb([]));

      expect(mocks.debug).toHaveBeenCalledWith(
        expect.stringContaining('Display changed'),
      );
      controller.dispose();
    });

    it('should not log a display change when display has not changed', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      win._emit('moved');

      expect(mocks.debug).not.toHaveBeenCalledWith(
        expect.stringContaining('Display changed'),
        expect.anything(),
      );
      controller.dispose();
    });

    it('should detect scale factor change on the same display', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      const scaledDisplay = {...PRIMARY_DISPLAY, scaleFactor: 2};
      mocks.getDisplayMatching.mockReturnValue(scaledDisplay);

      win._emit('moved');

      expect(mocks.debug).toHaveBeenCalledWith(
        expect.stringContaining('Display changed'),
      );
      controller.dispose();
    });

    it('should re-clamp on display change in pack mode', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, true);

      // First pack
      const packListener = getRegisteredListener('rendererContentSizeChanged')!;
      packListener({}, 'test-window', 400, 300);
      win.setContentSize.mockClear();

      // Move to a display with smaller work area
      const smallDisplay = {
        ...PRIMARY_DISPLAY,
        id: 3,
        workArea: {x: 0, y: 0, width: 300, height: 200},
      };
      mocks.getDisplayMatching.mockReturnValue(smallDisplay);

      win._emit('moved');

      // Width stays at initial 800, height clamped to small display work area (200)
      expect(win.setContentSize).toHaveBeenCalledWith(800, 200);
      controller.dispose();
    });

    it('should ignore display change checks after dispose', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      // Capture the listener before dispose removes it from the map
      const updateListeners = [...(mocks.displayWatcherListeners.get('update') ?? [])];
      expect(updateListeners).toHaveLength(1);

      controller.dispose();
      mocks.debug.mockClear();
      mocks.getDisplayMatching.mockReturnValue(SECONDARY_DISPLAY);

      // Simulate a late callback reaching the already-disposed controller
      updateListeners.forEach(cb => cb([]));

      expect(mocks.debug).not.toHaveBeenCalledWith(expect.stringContaining('Display changed'));
    });
  });

  // ---- getController (registry) ----

  describe('getController', () => {
    it('should return the controller by window ID', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      expect(getController('test-window')).toBe(controller);
      controller.dispose();
    });

    it('should return undefined for unknown window ID', () => {
      expect(getController('nonexistent')).toBeUndefined();
    });
  });

  // ---- whenWindowReady ----

  describe('whenWindowReady', () => {
    it('should resolve whenWindowReady after markReady is called', async () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      controller.markReady();
      await expect(controller.whenWindowReady).resolves.toBeUndefined();
      controller.dispose();
    });

    it('should log timing on markReady', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      controller.markReady();

      expect(mocks.debug).toHaveBeenCalledWith(expect.stringContaining('ready after'));
      controller.dispose();
    });

    it('should be idempotent: second markReady has no effect', async () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      controller.markReady();
      controller.markReady();

      const readyLogs = mocks.debug.mock.calls.filter(
        (args: any[]) => typeof args[0] === 'string' && args[0].includes('ready after'),
      );
      expect(readyLogs).toHaveLength(1);

      await expect(controller.whenWindowReady).resolves.toBeUndefined();
      controller.dispose();
    });

    it('should reject whenWindowReady after rejectReady is called', async () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);
      const error = new Error('load failed');

      controller.rejectReady(error);

      await expect(controller.whenWindowReady).rejects.toBe(error);
      controller.dispose();
    });

    it('should be idempotent: markReady after rejectReady has no effect', async () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);
      const error = new Error('load failed');

      controller.rejectReady(error);
      controller.markReady();

      await expect(controller.whenWindowReady).rejects.toBe(error);
      controller.dispose();
    });

    it('should be idempotent: rejectReady after markReady has no effect', async () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      controller.markReady();
      controller.rejectReady(new Error('too late'));

      await expect(controller.whenWindowReady).resolves.toBeUndefined();
      controller.dispose();
    });
  });

  // ---- Screen Targeting ----

  describe('screen targeting', () => {
    it('should use the primary display when screen is "primary"', () => {
      const win = createMockWindow();
      mocks.getPrimaryDisplay.mockReturnValue(SECONDARY_DISPLAY);

      const controller = new WindowController('test-window', 'test', win as any, false, {
        screen: 'primary',
        horizontal: 'center',
      });

      // Window should have been moved to the target display's workArea origin
      expect(win.setPosition).toHaveBeenCalledWith(SECONDARY_DISPLAY.workArea.x, SECONDARY_DISPLAY.workArea.y);
      controller.dispose();
    });

    it('should use the main window display when screen is "app"', () => {
      // Create a "main window" on the secondary display
      mocks.getDisplayMatching.mockReturnValue(PRIMARY_DISPLAY);
      const mainWin = createMockWindow({x: 100, y: 100, width: 800, height: 600});
      const mainController = new WindowController('main-window', 'main', mainWin as any, false);
      setMainWindowId('main-window');

      // Now create the target window with screen: 'app'
      // getDisplayMatching should be called with the main window's bounds
      mocks.getDisplayMatching.mockImplementation((bounds: WindowBounds) => {
        if (bounds.x === 100 && bounds.y === 100) {
          return SECONDARY_DISPLAY;
        }
        return PRIMARY_DISPLAY;
      });

      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false, {
        screen: 'app',
        horizontal: 'center',
      });

      // Window should be moved to the secondary display's workArea
      expect(win.setPosition).toHaveBeenCalledWith(SECONDARY_DISPLAY.workArea.x, SECONDARY_DISPLAY.workArea.y);

      controller.dispose();
      mainController.dispose();
    });

    it('should fall back to primary with a warning when screen is "app" but no main window is registered', () => {
      // Ensure no main window is registered by setting a non-existent ID
      setMainWindowId('nonexistent');
      mocks.getPrimaryDisplay.mockReturnValue(SECONDARY_DISPLAY);

      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false, {
        screen: 'app',
        horizontal: 'center',
      });

      expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining('no main window'));
      expect(win.setPosition).toHaveBeenCalledWith(SECONDARY_DISPLAY.workArea.x, SECONDARY_DISPLAY.workArea.y);
      controller.dispose();
    });

    it('should use the cursor display when screen is "active"', () => {
      const cursorPoint = {x: 2000, y: 500};
      mocks.getCursorScreenPoint.mockReturnValue(cursorPoint);
      mocks.getDisplayNearestPoint.mockReturnValue(SECONDARY_DISPLAY);

      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false, {
        screen: 'active',
        horizontal: 'center',
      });

      expect(mocks.getCursorScreenPoint).toHaveBeenCalled();
      expect(mocks.getDisplayNearestPoint).toHaveBeenCalledWith(cursorPoint);
      expect(win.setPosition).toHaveBeenCalledWith(SECONDARY_DISPLAY.workArea.x, SECONDARY_DISPLAY.workArea.y);
      controller.dispose();
    });

    it('should use getDisplayMatching (unchanged behaviour) when no screen is set', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      expect(mocks.getDisplayMatching).toHaveBeenCalledWith(win.getBounds());
      // setPosition should NOT have been called from resolveTargetDisplay (no screen relocation)
      expect(win.setPosition).not.toHaveBeenCalled();
      controller.dispose();
    });

    it('should track the main window ID via getMainWindowId', () => {
      setMainWindowId('my-main');
      expect(getMainWindowId()).toBe('my-main');
    });
  });

  // ---- Dispose ----

  describe('dispose', () => {
    it('should remove IPC listeners on dispose', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      controller.dispose();

      expect(mocks.offFromRenderer).toHaveBeenCalledWith('rendererContentSizeChanged', expect.any(Function));
    });

    it('should unsubscribe from DisplayWatcher on dispose', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      controller.dispose();

      expect(mocks.displayWatcherOff).toHaveBeenCalledWith('update', expect.any(Function));
    });

    it('should remove the moved listener on dispose', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      controller.dispose();

      expect(win.removeListener).toHaveBeenCalledWith('moved', expect.any(Function));
    });

    it('should remove from controller registry on dispose', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      controller.dispose();

      expect(getController('test-window')).toBeUndefined();
    });

    it('should dispose automatically when the window closes', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      expect(getController('test-window')).toBe(controller);

      win._emit('closed');

      expect(getController('test-window')).toBeUndefined();
    });

    it('should be safe to call dispose twice', () => {
      const win = createMockWindow();
      const controller = new WindowController('test-window', 'test', win as any, false);

      controller.dispose();
      controller.dispose();

      // offFromRenderer should only have been called once per channel
      const contentSizeCalls = mocks.offFromRenderer.mock.calls
        .filter((args: any[]) => args[0] === 'rendererContentSizeChanged');
      expect(contentSizeCalls).toHaveLength(1);
    });
  });
});
