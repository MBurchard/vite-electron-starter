/**
 * modules/electron/src/logging/__tests__/RotatingFileAppender.spec.ts
 *
 * @file Tests for RotatingFileAppender covering date rotation, size rotation, startup behaviour, archive cleanup,
 * and write serialization.
 */
import type {ILogEvent} from '@mburchard/bit-log/definitions';
import {existsSync} from 'node:fs';
import {mkdir, readdir, readFile, rm, utimes, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {RotatingFileAppender} from '../RotatingFileAppender.js';

let logDir: string;
let appender: RotatingFileAppender;

/**
 * Create a minimal ILogEvent at the given timestamp.
 *
 * @param timestamp - Date for the event.
 * @param message - Payload message.
 * @returns A valid ILogEvent.
 */
function makeEvent(timestamp: Date, message: string = 'hello'): ILogEvent {
  return {
    level: 'INFO',
    loggerName: 'test',
    payload: [message],
    timestamp,
  };
}

/**
 * Read the content of a file in the log directory.
 *
 * @param filename - Name of the file to read.
 * @returns The file content as string.
 */
async function readLog(filename: string): Promise<string> {
  return readFile(path.join(logDir, filename), 'utf-8');
}

/**
 * List all files in the log directory, sorted alphabetically.
 *
 * @returns Sorted array of filenames.
 */
async function listFiles(): Promise<string[]> {
  const entries = await readdir(logDir);
  return entries.sort();
}

/**
 * Create a fresh appender instance wired to the temp log directory.
 *
 * @returns A configured RotatingFileAppender.
 */
function createAppender(): RotatingFileAppender {
  const a = new RotatingFileAppender();
  a.filePath = logDir;
  a.baseName = 'app';
  a.extension = 'log';
  return a;
}

beforeEach(async () => {
  vi.useFakeTimers();
  logDir = path.join(tmpdir(), `rotating-appender-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(logDir, {recursive: true});
  appender = createAppender();
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (existsSync(logDir)) {
    await rm(logDir, {recursive: true, force: true});
  }
});

// ---- a) Basic functionality ----

describe('basic functionality', () => {
  it('should write to app.log with correct formatting', async () => {
    const now = new Date('2026-02-25T10:00:00');
    vi.setSystemTime(now);

    await appender.handle(makeEvent(now, 'test message'));

    const files = await listFiles();
    expect(files).toEqual(['app.log']);

    const content = await readLog('app.log');
    expect(content).toContain('test message');
    expect(content).toContain('INFO');
    expect(content).toContain('test');
    expect(content).toMatch(/\n$/);
  });

  it('should skip events below the configured log level', async () => {
    appender.level = 'WARN';
    const now = new Date('2026-02-25T10:00:00');
    vi.setSystemTime(now);

    await appender.handle(makeEvent(now, 'should be filtered'));

    const files = await listFiles();
    expect(files).toHaveLength(0);
  });

  it('should format function payloads via lazy evaluation', async () => {
    const now = new Date('2026-02-25T10:00:00');
    vi.setSystemTime(now);

    const event: ILogEvent = {
      level: 'INFO',
      loggerName: 'test',
      payload: () => 'lazy message',
      timestamp: now,
    };
    await appender.handle(event);

    const content = await readLog('app.log');
    expect(content).toContain('lazy message');
  });

  it('should append multiple events to the same file', async () => {
    const t1 = new Date('2026-02-25T10:00:00');
    const t2 = new Date('2026-02-25T10:00:01');
    vi.setSystemTime(t1);

    await appender.handle(makeEvent(t1, 'first'));
    await appender.handle(makeEvent(t2, 'second'));

    const content = await readLog('app.log');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('first');
    expect(lines[1]).toContain('second');
  });
});

// ---- b) Date rotation ----

describe('date rotation', () => {
  it('should rotate on date change and create archive with correct date', async () => {
    const day1 = new Date('2026-02-25T23:59:59');
    const day2 = new Date('2026-02-26T00:00:01');
    vi.setSystemTime(day1);

    await appender.handle(makeEvent(day1, 'before midnight'));

    vi.setSystemTime(day2);
    await appender.handle(makeEvent(day2, 'after midnight'));

    const files = await listFiles();
    expect(files).toContain('app-2026-02-25.log');
    expect(files).toContain('app.log');

    const archive = await readLog('app-2026-02-25.log');
    expect(archive).toContain('before midnight');

    const active = await readLog('app.log');
    expect(active).toContain('after midnight');
    expect(active).not.toContain('before midnight');
  });
});

// ---- c) Size rotation ----

describe('size rotation', () => {
  it('should rotate when file exceeds maxFileSize', async () => {
    appender.maxFileSize = 200; // very small limit for testing
    const now = new Date('2026-02-25T09:00:00');
    vi.setSystemTime(now);

    // Write enough to exceed the limit
    const bigMessage = 'x'.repeat(150);
    await appender.handle(makeEvent(now, bigMessage));

    // This should trigger size rotation
    const later = new Date('2026-02-25T09:05:00');
    vi.setSystemTime(later);
    await appender.handle(makeEvent(later, bigMessage));

    const files = await listFiles();
    // Archive should contain start time (09-00-00) from birthtime-based init
    const archiveFile = files.find(f => f.startsWith('app-2026-02-25_'));
    expect(archiveFile).toBeDefined();
    expect(files).toContain('app.log');

    // Active file should only contain the latest message
    const active = await readLog('app.log');
    const archiveContent = await readLog(archiveFile!);
    expect(archiveContent).toContain(bigMessage);
    expect(active).toContain(bigMessage);
  });
});

// ---- d) Startup rotation ----

describe('startup rotation', () => {
  it('should rotate existing app.log from a previous day on first write', async () => {
    // Pre-create a log file with old mtime
    const oldDate = new Date('2026-02-24T15:30:00');
    const activeFile = path.join(logDir, 'app.log');
    await writeFile(activeFile, 'old content\n');
    await utimes(activeFile, oldDate, oldDate);

    const now = new Date('2026-02-25T08:00:00');
    vi.setSystemTime(now);

    await appender.handle(makeEvent(now, 'new day'));

    const files = await listFiles();
    expect(files).toContain('app-2026-02-24.log');
    expect(files).toContain('app.log');

    const archive = await readLog('app-2026-02-24.log');
    expect(archive).toContain('old content');

    const active = await readLog('app.log');
    expect(active).toContain('new day');
    expect(active).not.toContain('old content');
  });

  it('should resume byte count for an existing app.log from today', async () => {
    appender.maxFileSize = 200;

    // Pre-create a file from "today" with some content
    const now = new Date('2026-02-25T10:00:00');
    vi.setSystemTime(now);

    const activeFile = path.join(logDir, 'app.log');
    const existingContent = `${'x'.repeat(150)}\n`;
    await writeFile(activeFile, existingContent);
    // Set mtime to today
    await utimes(activeFile, now, now);

    // This write should push past the limit and trigger size rotation
    const later = new Date('2026-02-25T10:05:00');
    vi.setSystemTime(later);
    await appender.handle(makeEvent(later, 'x'.repeat(100)));

    const files = await listFiles();
    const archiveFile = files.find(f => f.startsWith('app-2026-02-25_'));
    expect(archiveFile).toBeDefined();
  });
});

// ---- e) Cleanup ----

describe('archive cleanup', () => {
  it('should delete archives older than maxAgeDays and keep recent ones', async () => {
    appender.maxAgeDays = 7;

    // Create old archive (10 days ago)
    await writeFile(path.join(logDir, 'app-2026-02-15.log'), 'old');

    // Create recent archive (3 days ago)
    await writeFile(path.join(logDir, 'app-2026-02-22.log'), 'recent');

    // Create a non-matching file that should be left alone
    await writeFile(path.join(logDir, 'other.txt'), 'keep');

    const now = new Date('2026-02-25T10:00:00');
    vi.setSystemTime(now);

    await appender.handle(makeEvent(now, 'trigger init'));

    const files = await listFiles();
    expect(files).not.toContain('app-2026-02-15.log');
    expect(files).toContain('app-2026-02-22.log');
    expect(files).toContain('other.txt');
    expect(files).toContain('app.log');
  });

  it('should also clean up size-rotated archives', async () => {
    appender.maxAgeDays = 7;

    // Old size-rotated archive
    await writeFile(path.join(logDir, 'app-2026-02-10_14-30-00.log'), 'old size rot');

    const now = new Date('2026-02-25T10:00:00');
    vi.setSystemTime(now);

    await appender.handle(makeEvent(now, 'trigger'));

    const files = await listFiles();
    expect(files).not.toContain('app-2026-02-10_14-30-00.log');
  });
});

// ---- f) Write serialization ----

describe('write serialization', () => {
  it('should handle 50 concurrent events without corruption', async () => {
    const now = new Date('2026-02-25T10:00:00');
    vi.setSystemTime(now);

    const promises: Promise<void>[] = [];
    for (let i = 0; i < 50; i++) {
      const t = new Date(now.getTime() + i);
      promises.push(appender.handle(makeEvent(t, `msg-${i}`)));
    }
    await Promise.all(promises);

    const content = await readLog('app.log');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(50);

    // Verify each line is complete (no interleaving)
    for (let i = 0; i < 50; i++) {
      expect(lines[i]).toContain(`msg-${i}`);
    }
  });
});

// ---- g) Combined size + date rotation ----

describe('combined rotations', () => {
  it('should handle size rotation followed by date rotation on the same day', async () => {
    appender.maxFileSize = 200;

    const morning = new Date('2026-02-25T09:00:00');
    vi.setSystemTime(morning);

    const bigMsg = 'x'.repeat(150);
    await appender.handle(makeEvent(morning, bigMsg));

    // Trigger size rotation
    const midday = new Date('2026-02-25T12:00:00');
    vi.setSystemTime(midday);
    await appender.handle(makeEvent(midday, bigMsg));

    // Trigger date rotation
    const nextDay = new Date('2026-02-26T08:00:00');
    vi.setSystemTime(nextDay);
    await appender.handle(makeEvent(nextDay, 'next day'));

    const files = await listFiles();
    // Should have: size-rotated archive, date-rotated archive, and active file
    const sizeArchive = files.find(f => /^app-2026-02-25_\d{2}-\d{2}-\d{2}\.log$/.test(f));
    expect(sizeArchive).toBeDefined();
    expect(files).toContain('app-2026-02-25.log');
    expect(files).toContain('app.log');

    const active = await readLog('app.log');
    expect(active).toContain('next day');
  });
});

// ---- h) Fresh start ----

describe('fresh start', () => {
  it('should start cleanly when no existing log file is present', async () => {
    const now = new Date('2026-02-25T10:00:00');
    vi.setSystemTime(now);

    await appender.handle(makeEvent(now, 'first ever'));

    const files = await listFiles();
    expect(files).toEqual(['app.log']);

    const content = await readLog('app.log');
    expect(content).toContain('first ever');
  });

  it('should start cleanly when log directory is empty', async () => {
    const now = new Date('2026-02-25T10:00:00');
    vi.setSystemTime(now);

    // Directory exists but is empty
    const files = await listFiles();
    expect(files).toHaveLength(0);

    await appender.handle(makeEvent(now, 'brand new'));

    const afterFiles = await listFiles();
    expect(afterFiles).toEqual(['app.log']);
  });
});
