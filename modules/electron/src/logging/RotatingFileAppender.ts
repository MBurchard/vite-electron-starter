/**
 * modules/electron/src/logging/RotatingFileAppender.ts
 *
 * @file File appender with automatic log rotation. The active log is always written to a file without a date suffix
 * (e.g. `app.log`). Rotation happens on two triggers:
 *
 * - **Date change:** at midnight (or wake-from-standby) the current file is renamed to `app-YYYY-MM-DD.log` with
 *   the previous day's date.
 * - **Size limit:** when the accumulated byte count exceeds `maxFileSize`, the current file is renamed to
 *   `app-YYYY-MM-DD_HH-mm-ss.log` where the timestamp reflects when the file content started (not the rotation moment).
 *
 * Old archive files beyond `maxAgeDays` are cleaned up on startup.
 *
 * @author Martin Burchard
 */
import type {ILogEvent} from '@mburchard/bit-log/definitions';
import {Buffer} from 'node:buffer';
import {appendFile, readdir, rename, stat, unlink} from 'node:fs/promises';
import path from 'node:path';
import {AbstractBaseAppender} from '@mburchard/bit-log/appender/AbstractBaseAppender';

const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const DEFAULT_MAX_AGE_DAYS = 30;
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Build a regex matching rotated archive filenames: `baseName-YYYY-MM-DD.ext` (date rotation)
 * or `baseName-YYYY-MM-DD_HH-mm-ss.ext` (size rotation). The date portion is captured in group 1.
 *
 * @param baseName - The base filename without extension (e.g. 'app').
 * @param extension - The file extension without dot (e.g. 'log').
 * @returns A RegExp that matches and captures the date from archive filenames.
 */
function buildArchivePattern(baseName: string, extension: string): RegExp {
  return new RegExp(`^${baseName}-(\\d{4}-\\d{2}-\\d{2})(?:_\\d{2}-\\d{2}-\\d{2})?\\.${extension}$`);
}

/**
 * File appender that rotates on date change and size limit, with automatic archive cleanup.
 *
 * Properties are set via `Reflect.set` by the PipelineAppender delegates setter, matching the configuration pattern
 * used by bit-log's `configureLogging`.
 */
export class RotatingFileAppender extends AbstractBaseAppender {
  /** Log directory path. */
  filePath: string = '';

  /** Base filename without extension (default: 'app'). */
  baseName: string = 'app';

  /** File extension without dot (default: 'log'). */
  extension: string = 'log';

  /** Whether to include ANSI colour codes in the output. */
  colored: boolean = false;

  /** Whether to pretty-print complex objects. */
  pretty: boolean = false;

  /** Maximum file size in bytes before size rotation triggers (default: 5 MB). */
  maxFileSize: number = DEFAULT_MAX_FILE_SIZE;

  /** Number of days to keep archive files (default: 30). */
  maxAgeDays: number = DEFAULT_MAX_AGE_DAYS;

  // ---- Internal state ----

  private logQueue: Promise<void> = Promise.resolve();
  private currentDateString: string = '';
  private currentFileStartTime: string = '';
  private currentFileSize: number = 0;
  private initialized: boolean = false;

  // ---- IAppender interface ----

  /**
   * Queue-based entry point. Serializes all write operations through a promise chain to prevent interleaved output
   * from concurrent callers.
   *
   * @param event - The log event to handle.
   */
  async handle(event: ILogEvent): Promise<void> {
    if (!this.willHandle(event)) {
      return;
    }
    const pending = this.logQueue.then(() => this.processEvent(event));
    /* v8 ignore next 3 -- queue error handler; processEvent has its own error handling @preserve */
    this.logQueue = pending.catch((err) => {
      console.error('Error in RotatingFileAppender.handle:', err);
    });
    return pending;
  }

  // ---- Core processing ----

  /**
   * Process a single event: lazy-init on first write, check date change, format the line, check size limit, and
   * append to the active file.
   *
   * @param event - The log event to process.
   */
  private async processEvent(event: ILogEvent): Promise<void> {
    if (!this.initialized) {
      await this.initOnFirstWrite(event.timestamp);
    }

    // Date rotation check
    const eventDate = this.toDateString(event.timestamp);
    if (eventDate !== this.currentDateString) {
      await this.rotateDateChange(this.currentDateString);
      this.currentDateString = eventDate;
      this.currentFileStartTime = this.toTimeString(event.timestamp);
      this.currentFileSize = 0;
    }

    // Format and write
    const line = this.formatLogLine(event);
    const bytes = Buffer.byteLength(line, 'utf-8');

    // Size rotation check (before writing, so the rotated file stays within the limit)
    if (this.currentFileSize > 0 && this.currentFileSize + bytes > this.maxFileSize) {
      await this.rotateSizeLimit();
      this.currentFileStartTime = this.toTimeString(event.timestamp);
      this.currentFileSize = 0;
    }

    await appendFile(this.activeFilePath(), line);
    this.currentFileSize += bytes;
  }

  // ---- Initialization ----

  /**
   * Lazy initialization on the first write. Checks whether an existing active log file needs rotation (stale date),
   * recovers byte count for today's file, and runs archive cleanup.
   *
   * @param now - Timestamp of the first event being processed.
   */
  private async initOnFirstWrite(now: Date): Promise<void> {
    this.initialized = true;
    const activeFile = this.activeFilePath();

    try {
      const stats = await stat(activeFile);
      const fileDate = this.toDateString(stats.mtime);
      const today = this.toDateString(now);

      if (fileDate !== today) {
        // File is from a previous day, rotate it away
        this.currentDateString = fileDate;
        this.currentFileStartTime = this.toTimeString(stats.birthtime);
        await this.rotateDateChange(fileDate);
        this.currentDateString = today;
        this.currentFileStartTime = this.toTimeString(now);
        this.currentFileSize = 0;
      } else {
        // File is from today, resume
        this.currentDateString = today;
        this.currentFileSize = stats.size;
        this.currentFileStartTime = this.toTimeString(stats.birthtime);
      }
    } catch (err) {
      /* v8 ignore else -- unexpected fs error; re-thrown to queue error handler @preserve */
      if (err.code === 'ENOENT') {
        // No existing file, fresh start
        this.currentDateString = this.toDateString(now);
        this.currentFileStartTime = this.toTimeString(now);
        this.currentFileSize = 0;
      } else {
        throw err;
      }
    }

    // Cleanup old archives (fire-and-forget within the queue)
    await this.cleanupArchives(now);
  }

  // ---- Rotation ----

  /**
   * Rename the active file for date rotation: `app.log` -> `app-YYYY-MM-DD.log`.
   *
   * @param archiveDate - The date string (YYYY-MM-DD) to use in the archive filename.
   */
  private async rotateDateChange(archiveDate: string): Promise<void> {
    const activeFile = this.activeFilePath();
    const archiveFile = path.join(this.filePath, `${this.baseName}-${archiveDate}.${this.extension}`);
    try {
      await rename(activeFile, archiveFile);
    } catch (err) {
      /* v8 ignore next 3 -- defensive guard for unexpected fs errors; ENOENT is expected @preserve */
      if (err.code !== 'ENOENT') {
        console.error('Error during date rotation:', err);
      }
    }
  }

  /**
   * Rename the active file for size rotation: `app.log` -> `app-YYYY-MM-DD_HH-mm-ss.log`. The timestamp reflects when
   * the file content started, not the rotation moment.
   */
  private async rotateSizeLimit(): Promise<void> {
    const activeFile = this.activeFilePath();
    const archiveName = `${this.baseName}-${this.currentDateString}_${this.currentFileStartTime}.${this.extension}`;
    const archiveFile = path.join(this.filePath, archiveName);
    try {
      await rename(activeFile, archiveFile);
    } catch (err) {
      /* v8 ignore next 3 -- defensive guard for unexpected fs errors; ENOENT is expected @preserve */
      if (err.code !== 'ENOENT') {
        console.error('Error during size rotation:', err);
      }
    }
  }

  // ---- Cleanup ----

  /**
   * Scan the log directory and delete archive files older than `maxAgeDays`.
   *
   * @param now - Reference timestamp for age calculation.
   */
  private async cleanupArchives(now: Date): Promise<void> {
    const pattern = buildArchivePattern(this.baseName, this.extension);
    const cutoff = now.getTime() - this.maxAgeDays * MILLIS_PER_DAY;

    try {
      const entries = await readdir(this.filePath);
      for (const entry of entries) {
        const match = pattern.exec(entry);
        if (!match) {
          continue;
        }
        const dateStr = match[1];
        const fileTime = new Date(`${dateStr}T00:00:00`).getTime();
        if (fileTime < cutoff) {
          await unlink(path.join(this.filePath, entry));
        }
      }
    } catch (err) {
      /* v8 ignore next 3 -- defensive guard for unexpected fs errors; ENOENT is expected @preserve */
      if (err.code !== 'ENOENT') {
        console.error('Error during archive cleanup:', err);
      }
    }
  }

  // ---- Formatting helpers ----

  /**
   * Format a log event into a single line: prefix + payload, terminated by a newline.
   *
   * @param event - The log event to format.
   * @returns The formatted line including trailing newline.
   */
  private formatLogLine(event: ILogEvent): string {
    const parts = [this.formatPrefix(event, this.colored)];
    if (typeof event.payload === 'function') {
      parts.push(event.payload());
    } else {
      parts.push(...event.payload.map(item => this.formatAny(item, this.pretty, this.colored)));
    }
    return `${parts.join(' ')}\n`;
  }

  /**
   * Build the full path to the active log file.
   *
   * @returns Absolute path, e.g. `/path/to/logs/app.log`.
   */
  private activeFilePath(): string {
    return path.join(this.filePath, `${this.baseName}.${this.extension}`);
  }

  /**
   * Format a Date as 'YYYY-MM-DD'.
   *
   * @param date - The date to format.
   * @returns Date string in YYYY-MM-DD format.
   */
  private toDateString(date: Date): string {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Format a Date as 'HH-mm-ss'.
   *
   * @param date - The date to format.
   * @returns Time string in HH-mm-ss format.
   */
  private toTimeString(date: Date): string {
    const h = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    const s = date.getSeconds().toString().padStart(2, '0');
    return `${h}-${min}-${s}`;
  }
}
