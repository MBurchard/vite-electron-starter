import type {Display} from '@common/definitions.js';
import {EventEmitter} from 'node:events';
import {app, screen} from 'electron';
import {getLogger} from '../logging/index.js';

const log = getLogger('DisplayWatcher');

/**
 * Singleton that monitors connected displays and emits 'update' events
 * whenever the display layout changes (added, removed, or metrics changed).
 */
class DisplayWatcher extends EventEmitter {
  private static instance: DisplayWatcher;
  private currentDisplays: Display[] = [];

  private constructor() {
    super();
    this.init().catch(reason => log.error('error during DisplayWatcher init', reason));
  }

  /**
   * Return the current snapshot of all connected displays.
   */
  public getDisplays(): Display[] {
    return this.currentDisplays;
  }

  /**
   * Return the singleton instance, creating it on first access.
   */
  public static getInstance(): DisplayWatcher {
    if (!DisplayWatcher.instance) {
      DisplayWatcher.instance = new DisplayWatcher();
    }
    return DisplayWatcher.instance;
  }

  /**
   * Wait for Electron to be ready, then start monitoring display changes.
   */
  private async init() {
    await app.whenReady();
    this.startWatching();
  }

  /**
   * Register screen event listeners and perform the initial display snapshot.
   */
  private startWatching() {
    const updateDisplays = () => {
      const primaryDisplayId = screen.getPrimaryDisplay().id;

      this.currentDisplays = screen.getAllDisplays().map(display => ({
        ...display,
        primary: display.id === primaryDisplayId,
      }));

      log.debug('Updated display layout:', this.currentDisplays);

      this.emit('update', this.currentDisplays);
    };

    updateDisplays();

    screen.on('display-added', updateDisplays);
    screen.on('display-removed', updateDisplays);
    screen.on('display-metrics-changed', updateDisplays);
  }

  public on(event: 'update', listener: (displays: Display[]) => void): this {
    return super.on(event, listener);
  }

  public off(event: 'update', listener: (displays: Display[]) => void): this {
    return super.off(event, listener);
  }
}

export const DISPLAY_WATCHER = DisplayWatcher.getInstance();
