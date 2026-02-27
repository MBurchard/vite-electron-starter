/**
 * modules/electron/src/windowMgt/WindowController.ts
 *
 * @file Per-window controller that manages pack mode (sizing the window to its content) and display awareness
 * (detecting when the window moves to a different display or display properties change). Created by the
 * WindowManager for every window and disposed automatically when the window closes.
 *
 * @author Martin Burchard
 */
import type {Display, WindowDisplayInfo, WindowPlacement, WindowPlacementOffset} from '@common/core/window.js';
import type {BrowserWindow} from 'electron';
import type {RendererListener} from '../ipc.js';
import {CoreIpcChannels} from '@common/core/ipc.js';
import {screen} from 'electron';
import {offFromRenderer, onFromRenderer} from '../ipc.js';
import {getLogger} from '../logging/index.js';
import {DISPLAY_WATCHER} from '../utils/DisplayWatcher.js';

const log = getLogger('WindowController');
const SHOW_TIMEOUT_MS = 5000;

// ---- Controller Registry ----

const controllerRegistry = new Map<string, WindowController>();

/**
 * Look up a WindowController by its window ID.
 *
 * @param windowId - The unique window identifier.
 * @returns The controller, or undefined if not found.
 */
export function getController(windowId: string): WindowController | undefined {
  return controllerRegistry.get(windowId);
}

// ---- Helper: Convert Electron.Display to WindowDisplayInfo ----

/**
 * Convert an Electron Display object to the renderer-safe WindowDisplayInfo.
 *
 * @param display - The Electron display object.
 * @param primary - Whether this is the primary display.
 * @returns A plain WindowDisplayInfo object.
 */
function toWindowDisplayInfo(display: Electron.Display, primary: boolean): WindowDisplayInfo {
  return {
    id: display.id,
    bounds: {...display.bounds},
    workArea: {...display.workArea},
    scaleFactor: display.scaleFactor,
    rotation: display.rotation,
    label: display.label ?? '',
    primary,
  };
}

// ---- WindowController ----

/**
 * Per-window controller managing pack mode and display awareness. Instantiated by the WindowManager, registered
 * in the controller registry, and automatically disposed when the BrowserWindow closes.
 */
export class WindowController {
  public readonly browserWindow: BrowserWindow;
  public readonly contentPage: string;
  public readonly windowId: string;
  public readonly whenWindowReady: Promise<void>;

  public readonly createdAt = Date.now();
  private readonly packMode: boolean;
  private initialPackReceived = false;
  private visibleLogged = false;
  private lastPackedHeight?: number;
  private readonly initialContentWidth: number;
  private readonly placement?: WindowPlacement;
  private currentDisplayId: number;
  private currentDisplay: WindowDisplayInfo;

  private readonly contentSizeListener: RendererListener;
  private readonly displayUpdateListener: (displays: Display[]) => void;
  private readonly movedListener: () => void;
  private showTimeout?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private readyResolve!: () => void;
  private readyReject!: (error: unknown) => void;
  private readySettled = false;

  /**
   * Create a new WindowController.
   *
   * @param windowId - Unique identifier for the window.
   * @param contentPage - Logical page name (e.g. 'main', 'dialog') used in log messages.
   * @param browserWindow - The BrowserWindow instance to control.
   * @param packModeOrPlacement - Either a boolean for pack mode, or a WindowPlacement (implies no pack mode).
   * @param placement - Optional declarative placement (only when the previous argument is a boolean).
   */
  constructor(
    windowId: string,
    contentPage: string,
    browserWindow: BrowserWindow,
    packModeOrPlacement?: boolean | WindowPlacement,
    placement?: WindowPlacement,
  ) {
    this.windowId = windowId;
    this.contentPage = contentPage;
    this.browserWindow = browserWindow;
    this.whenWindowReady = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    if (typeof packModeOrPlacement === 'boolean') {
      this.packMode = packModeOrPlacement;
      this.placement = placement;
    } else {
      this.packMode = false;
      this.placement = packModeOrPlacement;
    }
    this.initialContentWidth = browserWindow.getContentSize()[0];

    const display = screen.getDisplayMatching(browserWindow.getBounds());
    const primaryId = screen.getPrimaryDisplay().id;
    this.currentDisplayId = display.id;
    this.currentDisplay = toWindowDisplayInfo(display, display.id === primaryId);
    this.validatePlacement();

    // IPC listeners bound to this instance
    this.contentSizeListener = (_event, senderWindowId: string, _width: number, height: number) => {
      if (senderWindowId !== this.windowId) {
        return;
      }
      this.handleContentSize(height);
    };

    this.displayUpdateListener = () => {
      this.checkDisplayChange();
    };

    this.movedListener = () => {
      this.checkDisplayChange();
    };

    this.setup();
  }

  /**
   * Register all IPC listeners and event handlers.
   */
  private setup(): void {
    onFromRenderer(CoreIpcChannels.rendererContentSizeChanged, this.contentSizeListener);

    DISPLAY_WATCHER.on('update', this.displayUpdateListener);
    this.browserWindow.on('moved', this.movedListener);

    this.browserWindow.on('closed', () => {
      this.dispose();
    });

    this.showTimeout = setTimeout(() => {
      if (!this.disposed && !this.browserWindow.isVisible()) {
        log.error(`Window '${this.contentPage}' (${this.windowId}) not visible after ${SHOW_TIMEOUT_MS}ms, closing`);
        this.browserWindow.close();
      }
    }, SHOW_TIMEOUT_MS);

    controllerRegistry.set(this.windowId, this);
    log.debug(`WindowController created for '${this.contentPage}' (${this.windowId}), packMode=${this.packMode}`);
  }

  /**
   * Handle a content size report from the renderer. The width is fixed to the initial value from window creation;
   * only the height adapts to content. Height is clamped to the current display's work area. On the first
   * report the window is centred and shown.
   *
   * @param height - Reported content height in pixels.
   */
  private handleContentSize(height: number): void {
    if (!this.packMode || this.disposed) {
      return;
    }

    const workArea = this.currentDisplay.workArea;
    const clampedHeight = Math.min(height, workArea.height);

    const isFirstPack = !this.initialPackReceived;

    if (isFirstPack) {
      this.initialPackReceived = true;
      this.browserWindow.setOpacity(0);
      this.browserWindow.show();
    }

    const sizeChanged = clampedHeight !== this.lastPackedHeight;
    if (sizeChanged) {
      this.lastPackedHeight = clampedHeight;
      this.browserWindow.setContentSize(this.initialContentWidth, clampedHeight);
      if (this.placement) {
        this.applyPlacement();
      } else if (isFirstPack) {
        this.center();
      }
    }

    if (isFirstPack) {
      this.browserWindow.setOpacity(1);
      this.markVisible();
    }
  }

  /**
   * Centre the window on its current display's work area. Can be called programmatically from the main process.
   */
  public center(): void {
    if (this.disposed) {
      return;
    }

    const workArea = this.currentDisplay.workArea;
    const bounds = this.browserWindow.getBounds();
    const x = Math.round(workArea.x + (workArea.width - bounds.width) / 2);
    const y = Math.round(workArea.y + (workArea.height - bounds.height) / 2);

    this.browserWindow.setPosition(x, y);
  }

  /**
   * Log the time from window creation to the moment the window is actually visible. Called once from
   * handleContentSize (pack mode) or from the WindowManager (non-pack mode) after win.show().
   */
  public markVisible(): void {
    if (this.visibleLogged) {
      return;
    }
    this.visibleLogged = true;
    log.debug(`Window '${this.contentPage}' (${this.windowId}) visible after ${Date.now() - this.createdAt}ms`);
  }

  /**
   * Signal that the window content has finished loading and the window is ready for interaction.
   * Logs the time from creation to ready. Idempotent: only the first call has effect.
   */
  public markReady(): void {
    if (this.readySettled) {
      return;
    }
    this.readySettled = true;
    log.debug(`Window '${this.contentPage}' (${this.windowId}) ready after ${Date.now() - this.createdAt}ms`);
    this.readyResolve();
  }

  /**
   * Signal that the window failed to load. Rejects whenWindowReady with the given error.
   * Idempotent: only the first call has effect.
   *
   * @param error - The error that prevented the window from becoming ready.
   */
  public rejectReady(error: unknown): void {
    if (this.readySettled) {
      return;
    }
    this.readySettled = true;
    this.readyReject(error);
  }

  /**
   * Apply declarative placement to the window using the current display's work area.
   */
  public applyPlacement(): void {
    if (this.disposed || !this.placement) {
      return;
    }

    const workArea = this.currentDisplay.workArea;
    const bounds = this.browserWindow.getBounds();

    const hasTop = this.placement.top !== undefined;
    const hasBottom = this.placement.bottom !== undefined;
    const hasLeft = this.placement.left !== undefined;
    const hasRight = this.placement.right !== undefined;

    const topPx = this.parseOffset(this.placement.top, workArea.height, 'top') ?? 0;
    const bottomPx = this.parseOffset(this.placement.bottom, workArea.height, 'bottom') ?? 0;
    const leftPx = this.parseOffset(this.placement.left, workArea.width, 'left') ?? 0;
    const rightPx = this.parseOffset(this.placement.right, workArea.width, 'right') ?? 0;

    let x: number;
    if (hasLeft) {
      x = workArea.x + leftPx;
    } else if (hasRight) {
      x = workArea.x + workArea.width - bounds.width - rightPx;
    } else if (this.placement.horizontal === 'left') {
      x = workArea.x;
    } else if (this.placement.horizontal === 'right') {
      x = workArea.x + workArea.width - bounds.width;
    } else {
      x = workArea.x + Math.floor((workArea.width - bounds.width) / 2);
    }

    let y: number;
    if (hasTop) {
      y = workArea.y + topPx;
    } else if (hasBottom) {
      y = workArea.y + workArea.height - bounds.height - bottomPx;
    } else if (this.placement.vertical === 'top') {
      y = workArea.y;
    } else if (this.placement.vertical === 'bottom') {
      y = workArea.y + workArea.height - bounds.height;
    } else {
      y = workArea.y + Math.floor((workArea.height - bounds.height) / 2);
    }

    const minX = workArea.x;
    const maxX = workArea.x + workArea.width - bounds.width;
    const minY = workArea.y;
    const maxY = workArea.y + workArea.height - bounds.height;
    const clampedX = Math.max(minX, Math.min(x, maxX));
    const clampedY = Math.max(minY, Math.min(y, maxY));

    this.browserWindow.setPosition(clampedX, clampedY);
  }

  /**
   * Validate placement combinations and log warnings for ambiguous input.
   */
  private validatePlacement(): void {
    if (!this.placement) {
      return;
    }
    if (this.placement.top !== undefined && this.placement.bottom !== undefined) {
      log.warn(`Window '${this.contentPage}' (${this.windowId}): placement has both 'top' and 'bottom'; using 'top'.`);
    }
    if (this.placement.left !== undefined && this.placement.right !== undefined) {
      log.warn(`Window '${this.contentPage}' (${this.windowId}): placement has both 'left' and 'right'; using 'left'.`);
    }
  }

  /**
   * Parse a placement offset value given as pixels (number) or percentage string (e.g. "25%").
   *
   * @param value - The offset value, either a number (px) or a percentage string.
   * @param axisSize - The full axis size in pixels used to resolve percentage values.
   * @param fieldName - The placement field name, used in warning messages for invalid values.
   * @returns The resolved offset in pixels, or undefined if the value is undefined.
   */
  private parseOffset(
    value: WindowPlacementOffset | undefined,
    axisSize: number,
    fieldName: 'top' | 'bottom' | 'left' | 'right',
  ): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (typeof value === 'number') {
      return value;
    }
    const match = /^(-?\d+(?:\.\d+)?)%$/.exec(value);
    if (!match) {
      log.warn(
        `Window '${this.contentPage}' (${this.windowId}): invalid placement '${fieldName}' (${value}); using 0.`,
      );
      return 0;
    }
    const percent = Number(match[1]);
    return Math.round(axisSize * (percent / 100));
  }

  /**
   * Check whether the window has moved to a different display or the display properties have changed.
   * If so, update the internal state and notify the renderer.
   */
  private checkDisplayChange(): void {
    if (this.disposed) {
      return;
    }

    const display = screen.getDisplayMatching(this.browserWindow.getBounds());
    const primaryId = screen.getPrimaryDisplay().id;
    const newInfo = toWindowDisplayInfo(display, display.id === primaryId);

    if (this.hasDisplayChanged(newInfo)) {
      this.currentDisplayId = display.id;
      this.currentDisplay = newInfo;
      log.debug(`Display changed for '${this.contentPage}' (${this.windowId}): display=${display.id}`);

      // Re-clamp if in pack mode and a pack has already happened
      if (this.packMode && this.initialPackReceived) {
        const [, h] = this.browserWindow.getContentSize();
        this.handleContentSize(h);
      }
    }
  }

  /**
   * Compare the new display info against the current state to detect meaningful changes.
   *
   * @param newInfo - The new display info to compare against.
   * @returns True if display ID, scale factor, or work area dimensions have changed.
   */
  private hasDisplayChanged(newInfo: WindowDisplayInfo): boolean {
    if (newInfo.id !== this.currentDisplayId) {
      return true;
    }
    if (newInfo.scaleFactor !== this.currentDisplay.scaleFactor) {
      return true;
    }
    const a = this.currentDisplay.workArea;
    const b = newInfo.workArea;
    return a.width !== b.width || a.height !== b.height || a.x !== b.x || a.y !== b.y;
  }

  /**
   * Clean up all listeners and remove from the registry. Called automatically on window close.
   */
  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    clearTimeout(this.showTimeout);

    offFromRenderer(CoreIpcChannels.rendererContentSizeChanged, this.contentSizeListener);
    DISPLAY_WATCHER.off('update', this.displayUpdateListener);
    this.browserWindow.removeListener('moved', this.movedListener);

    controllerRegistry.delete(this.windowId);
    log.debug(`WindowController disposed for '${this.contentPage}' (${this.windowId})`);
  }
}
