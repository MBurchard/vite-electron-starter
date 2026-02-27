/**
 * modules/common/src/logging/BackendForwardingAppender.ts
 *
 * @file Appender that forwards log events to the Electron main process. The transport function is injected externally,
 * so the appender works in both the preload context (direct IPC send) and the renderer context (preload bridge).
 * Events arriving before a sender is set are queued and flushed automatically once the sender becomes available.
 *
 * @author Martin Burchard
 */
import type {ILogEvent} from '@mburchard/bit-log/definitions';
import {AbstractBaseAppender} from '@mburchard/bit-log/appender/AbstractBaseAppender';

const MAX_QUEUE_SIZE = 200;

/**
 * Transport function signature for forwarding a single log event.
 */
export type LogEventSender = (event: ILogEvent) => void;

/**
 * Forwards log events to the Electron backend via an injectable sender function. Events arriving before the sender
 * is available are buffered in a startup queue (up to {@link MAX_QUEUE_SIZE} entries). Setting the sender flushes
 * the queue automatically.
 */
export class BackendForwardingAppender extends AbstractBaseAppender {
  private queue: ILogEvent[] | null = [];
  private sender: LogEventSender | undefined;

  /**
   * Set or replace the transport function. If events were queued before, the queue is flushed immediately.
   *
   * @param sender - Transport function that delivers a single log event to the backend.
   */
  setSender(sender: LogEventSender): void {
    this.sender = sender;
    if (this.queue) {
      for (const queued of this.queue) {
        sender(queued);
      }
      this.queue = null;
    }
  }

  /**
   * Forward the event via the configured sender. If no sender is available yet, the event is buffered.
   *
   * @param event - The log event to forward.
   */
  async doHandle(event: ILogEvent): Promise<void> {
    if (!this.sender) {
      if (this.queue && this.queue.length < MAX_QUEUE_SIZE) {
        this.queue.push(event);
      }
      return;
    }

    this.sender(event);
  }
}

/**
 * Create a BackendForwardingAppender subclass with a pre-bound sender. Useful for `configureLogging` which
 * instantiates appenders via `new Class()` without constructor arguments.
 *
 * @param sender - Transport function to bind into the appender.
 * @returns A class that can be passed as `Class` in an `AppenderConfig`.
 */
export function createBoundAppenderClass(sender: LogEventSender): new () => BackendForwardingAppender {
  return class BoundBackendForwardingAppender extends BackendForwardingAppender {
    constructor() {
      super();
      this.setSender(sender);
    }
  };
}
