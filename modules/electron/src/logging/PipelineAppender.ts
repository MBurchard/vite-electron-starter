/**
 * modules/electron/src/logging/PipelineAppender.ts
 *
 * @file Central logging orchestrator that merges backend and frontend log events into a unified output with correct
 * timestamp ordering. Uses a reorder buffer with dynamic delay to compensate for asynchronous IPC delivery of
 * frontend events.
 *
 * Backend events flow through the normal appender chain via handle(). Frontend events arrive directly via
 * handleFrontendEvent() from the IPC listener. On flush, events are delegated to all registered child appenders
 * (e.g. Console + File).
 *
 * Configurable via `configureLogging`; child appenders are instantiated from a nested `delegates` config object
 * via a setter that mirrors configureLogging's own instantiation logic.
 *
 * @author Martin Burchard
 */
import type {IAppender, ILogEvent, LogLevel} from '@mburchard/bit-log/definitions';
import {isPresent} from '@mburchard/bit-log/definitions';

type EventOrigin = 'Backend' | 'Frontend';

interface BufferedEvent {
  event: ILogEvent;
  origin: EventOrigin;
}

interface DelegateConfig {
  Class: new () => IAppender;
  level?: LogLevel;
  [key: string]: unknown;
}

const RESERVED_DELEGATE_CONFIG_KEYS = new Set(['Class', 'level']);

/**
 * Central logging pipeline that buffers, reorders and delegates log events to child appenders.
 *
 * Registered as the sole appender on the root logger. Backend events arrive via the normal `handle()` path, frontend
 * events via `handleFrontendEvent()`. Both are buffered, sorted by timestamp, and flushed to all registered delegate
 * appenders with an origin prefix ("Backend : " / "Frontend: ") prepended to callSite.file.
 */
export class PipelineAppender implements IAppender {
  level?: LogLevel;

  /** Base path to strip from backend file paths, so the prefix is not truncated. */
  backendBasePath?: string;

  /** Maximum delay in ms before the buffer is flushed as safety net. */
  maxDelay: number = 100;

  // ---- Internal state ----

  private readonly _delegates: Record<string, IAppender> = {};
  private readonly buffer: BufferedEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  // ---- Delegate management ----

  /**
   * Getter for the registered delegate appenders.
   *
   * @returns The delegate appenders keyed by name.
   */
  get delegates(): Record<string, IAppender> {
    return this._delegates;
  }

  /**
   * Setter for nested delegate appender configs. Called by `configureLogging` via `Reflect.set`. Instantiates each
   * delegate from its config, applying properties the same way configureLogging handles top-level appender configs.
   *
   * @param config - Map of delegate names to their configuration objects.
   */
  set delegates(config: Record<string, DelegateConfig>) {
    for (const [name, delegateConfig] of Object.entries(config)) {
      const instance = new delegateConfig.Class();
      if (isPresent(delegateConfig.level)) {
        instance.level = delegateConfig.level;
      }
      for (const [key, value] of Object.entries(delegateConfig)) {
        if (!RESERVED_DELEGATE_CONFIG_KEYS.has(key) && isPresent(value)) {
          Reflect.set(instance, key, value);
        }
      }
      this._delegates[name] = instance;
    }
  }

  /**
   * Add a delegate appender programmatically (alternative to the delegates setter).
   *
   * @param name - The key under which to register the delegate.
   * @param appender - The appender instance to register.
   */
  addDelegate(name: string, appender: IAppender): void {
    this._delegates[name] = appender;
  }

  // ---- IAppender interface ----

  /**
   * Check whether this appender will handle the given event based on its log level.
   *
   * @param event - The log event to check.
   * @returns True if the event should be handled.
   */
  willHandle(event: ILogEvent): boolean {
    return !isPresent(this.level) || event.level >= this.level;
  }

  /**
   * Receive a backend event from the normal appender chain. Inserts into the buffer and starts/resets the
   * max-delay timer.
   *
   * @param event - The backend log event.
   */
  async handle(event: ILogEvent): Promise<void> {
    if (!this.willHandle(event)) {
      return;
    }
    this.insertIntoBuffer(event, 'Backend');
    this.resetFlushTimer();
  }

  /**
   * Receive a frontend event directly from the IPC listener. Inserts into the buffer and flushes all events with
   * timestamps <= this event's timestamp, because no earlier frontend event can still be in transit.
   *
   * @param event - The frontend log event.
   */
  handleFrontendEvent(event: ILogEvent): void {
    if (!this.willHandle(event)) {
      return;
    }
    this.insertIntoBuffer(event, 'Frontend');
    this.flushUpTo(event.timestamp);
  }

  /**
   * Flush all remaining buffered events and close all delegates on shutdown.
   */
  close(): void {
    this.clearFlushTimer();
    this.flushAll();
    for (const delegate of Object.values(this._delegates)) {
      delegate.close?.();
    }
  }

  // ---- Buffer management ----

  /**
   * Insert an event into the buffer, maintaining sorted order by timestamp (binary search).
   *
   * @param event - The log event to insert.
   * @param origin - Whether the event originated from backend or frontend.
   */
  private insertIntoBuffer(event: ILogEvent, origin: EventOrigin): void {
    const entry: BufferedEvent = {event, origin};
    const ts = event.timestamp.getTime();

    let low = 0;
    let high = this.buffer.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.buffer[mid].event.timestamp.getTime() <= ts) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    this.buffer.splice(low, 0, entry);
  }

  /**
   * Flush all events from the buffer whose timestamp <= cutoff.
   *
   * @param cutoff - The cutoff date; events up to and including this timestamp are flushed.
   */
  private flushUpTo(cutoff: Date): void {
    const cutoffMs = cutoff.getTime();
    let count = 0;
    for (const entry of this.buffer) {
      if (entry.event.timestamp.getTime() <= cutoffMs) {
        count++;
      } else {
        break;
      }
    }
    /* v8 ignore next -- always >= 1; handleFrontendEvent inserts before calling flushUpTo @preserve */
    if (count > 0) {
      const toFlush = this.buffer.splice(0, count);
      for (const entry of toFlush) {
        this.flushEntry(entry);
      }
    }
    if (this.buffer.length === 0) {
      this.clearFlushTimer();
    }
  }

  /**
   * Flush all remaining events (timer expiry or close).
   */
  private flushAll(): void {
    const toFlush = this.buffer.splice(0, this.buffer.length);
    for (const entry of toFlush) {
      this.flushEntry(entry);
    }
  }

  /**
   * Prepare a single buffered event (shorten path, prepend origin prefix) and delegate to all registered child
   * appenders.
   *
   * @param entry - The buffered event to flush.
   */
  private flushEntry(entry: BufferedEvent): void {
    const event = entry.event;

    if (event.callSite) {
      const prefix = entry.origin === 'Frontend' ? 'Frontend: ' : 'Backend : ';
      const shortenedFile = this.shortenPath(event.callSite.file, entry.origin);
      event.callSite = {
        ...event.callSite,
        file: `${prefix}${shortenedFile}`,
      };
    }

    for (const [name, delegate] of Object.entries(this._delegates)) {
      if (delegate.willHandle(event)) {
        /* v8 ignore next 3 -- delegate error handler; delegates handle their own errors internally @preserve */
        delegate.handle(event).catch((err) => {
          console.error(`Error in PipelineAppender delegate '${name}':`, err);
        });
      }
    }
  }

  // ---- Path shortening ----

  /**
   * Shorten a file path to its meaningful part so the origin prefix fits within the column width used by
   * AbstractBaseAppender's truncateOrExtendLeft(file, 50).
   *
   * - Frontend: strip URL origin (protocol + host + port) or file:/// prefix
   * - Backend: strip file:/// prefix, then configurable backendBasePath
   * - Both: strip monorepo prefix up to last "src/" for compact output
   *
   * @param file - The raw file path from the callSite.
   * @param origin - Whether the event originated from backend or frontend.
   * @returns The shortened file path.
   */
  private shortenPath(file: string, origin: EventOrigin): string {
    let filePath = file;

    if (origin === 'Frontend') {
      // Dev: "http://localhost:5173/src/index.ts" -> "src/index.ts"
      // Prod: "file:///...app.asar/modules/app/src/index.ts" -> filesystem path
      const protocolEnd = filePath.indexOf('://');
      if (protocolEnd !== -1) {
        const pathStart = filePath.indexOf('/', protocolEnd + 3);
        if (pathStart !== -1) {
          filePath = filePath.substring(pathStart + 1);
        }
      }
    } else {
      // Backend: strip file:/// prefix (Electron ESM uses file:// URLs in stack traces)
      if (filePath.startsWith('file:///')) {
        filePath = filePath.substring(7);
      }

      // Strip backendBasePath prefix
      if (this.backendBasePath && filePath.startsWith(this.backendBasePath)) {
        const stripped = filePath.substring(this.backendBasePath.length);
        filePath = stripped.startsWith('/') ? stripped.substring(1) : stripped;
      }
    }

    // In monorepos or bundled apps the remaining path may still contain long prefixes
    // (e.g. "modules/electron/src/..." or "...app.asar/modules/app/src/...").
    // Strip up to and including the last "src/" for compact, consistent output.
    const srcIdx = filePath.lastIndexOf('src/');
    if (srcIdx >= 0) {
      return filePath.substring(srcIdx + 4);
    }

    return filePath;
  }

  // ---- Timer management ----

  /**
   * Cancel any pending flush timer and start a new one with `maxDelay` duration. Called after each backend event
   * to ensure the buffer is eventually flushed even when no frontend event arrives.
   */
  private resetFlushTimer(): void {
    this.clearFlushTimer();
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushAll();
    }, this.maxDelay);
  }

  /**
   * Cancel any pending flush timer without starting a new one.
   */
  private clearFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
