/**
 * modules/app/src/BackendForwardingAppender.ts
 *
 * @file Appender that forwards log events from the renderer process to the Electron main process via the preload
 * bridge. Falls back silently when the backend is not yet available (e.g. during early initialization).
 *
 * @author Martin Burchard
 */
import type {ILogEvent} from '@mburchard/bit-log/definitions';
import {AbstractBaseAppender} from '@mburchard/bit-log/appender/AbstractBaseAppender';

/**
 * Forwards log events to the Electron backend through the preload-exposed `window.backend.forwardLogEvent` bridge.
 */
export class BackendForwardingAppender extends AbstractBaseAppender {
  /**
   * Forward the event to the backend if the bridge is available.
   *
   * @param event - The log event to forward.
   */
  async handle(event: ILogEvent): Promise<void> {
    if (!this.willHandle(event)) {
      return;
    }
    // During logging initialization in the preload script, the backend may not be ready
    if (window?.backend?.forwardLogEvent) {
      window.backend.forwardLogEvent(event);
    }
  }
}
