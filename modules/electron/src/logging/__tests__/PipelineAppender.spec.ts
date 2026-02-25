import type {IAppender, ILogEvent} from '@mburchard/bit-log/definitions';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PipelineAppender} from '../PipelineAppender.js';

/** Create a minimal ILogEvent with the given timestamp and optional callSite. */
function makeEvent(timestampMs: number, name: string = 'test', file?: string): ILogEvent {
  return {
    level: 'INFO',
    loggerName: name,
    payload: [`event-${timestampMs}`],
    timestamp: new Date(timestampMs),
    ...(file ? {callSite: {file, line: 1, column: 1}} : {}),
  };
}

/** Create a mock delegate appender that records handled events. */
function mockDelegate(): {appender: IAppender; events: ILogEvent[]} {
  const events: ILogEvent[] = [];
  const appender: IAppender = {
    handle: vi.fn(async (event: ILogEvent) => {
      events.push(event);
    }),
    willHandle: vi.fn(() => true),
  };
  return {appender, events};
}

describe('pipelineAppender', () => {
  let pipeline: PipelineAppender;
  let delegate: ReturnType<typeof mockDelegate>;

  beforeEach(() => {
    vi.useFakeTimers();
    pipeline = new PipelineAppender();
    pipeline.maxDelay = 50;
    delegate = mockDelegate();
    pipeline.addDelegate('MOCK', delegate.appender);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ---- Buffer ordering ----

  it('should flush events in timestamp order when frontend event arrives', async () => {
    await pipeline.handle(makeEvent(200, 'a'));
    await pipeline.handle(makeEvent(100, 'b'));
    pipeline.handleFrontendEvent(makeEvent(250, 'c'));

    expect(delegate.events).toHaveLength(3);
    expect(delegate.events[0].payload).toEqual(['event-100']);
    expect(delegate.events[1].payload).toEqual(['event-200']);
    expect(delegate.events[2].payload).toEqual(['event-250']);
  });

  it('should only flush events up to frontend timestamp', async () => {
    await pipeline.handle(makeEvent(100));
    await pipeline.handle(makeEvent(300));
    pipeline.handleFrontendEvent(makeEvent(200));

    expect(delegate.events).toHaveLength(2);
    expect(delegate.events[0].payload).toEqual(['event-100']);
    expect(delegate.events[1].payload).toEqual(['event-200']);

    pipeline.close();
    expect(delegate.events).toHaveLength(3);
    expect(delegate.events[2].payload).toEqual(['event-300']);
  });

  // ---- Timer flush ----

  it('should flush buffer on timer expiry', async () => {
    await pipeline.handle(makeEvent(100));
    await pipeline.handle(makeEvent(200));

    expect(delegate.events).toHaveLength(0);
    vi.advanceTimersByTime(50);
    expect(delegate.events).toHaveLength(2);
  });

  it('should reset timer on each new backend event', async () => {
    await pipeline.handle(makeEvent(100));
    vi.advanceTimersByTime(30);
    await pipeline.handle(makeEvent(200));
    vi.advanceTimersByTime(30);

    // 60ms total, but timer was reset after 30ms — still 20ms remaining
    expect(delegate.events).toHaveLength(0);

    vi.advanceTimersByTime(20);
    expect(delegate.events).toHaveLength(2);
  });

  // ---- close() ----

  it('should flush all on close', async () => {
    await pipeline.handle(makeEvent(100));
    await pipeline.handle(makeEvent(200));

    expect(delegate.events).toHaveLength(0);
    pipeline.close();
    expect(delegate.events).toHaveLength(2);
  });

  // ---- Origin prefix ----

  it('should prepend "Backend : " to callSite.file for backend events', async () => {
    await pipeline.handle(makeEvent(100, 'test', '/project/src/main.ts'));
    pipeline.close();

    expect(delegate.events[0].callSite?.file).toBe('Backend : main.ts');
  });

  it('should prepend "Frontend: " to callSite.file for frontend events', () => {
    pipeline.handleFrontendEvent(makeEvent(100, 'test', 'http://localhost:5173/src/index.ts'));

    expect(delegate.events[0].callSite?.file).toBe('Frontend: index.ts');
  });

  // ---- Path shortening ----

  it('should strip URL origin from frontend paths (dev)', () => {
    pipeline.handleFrontendEvent(makeEvent(100, 'test', 'http://localhost:5173/src/index.ts'));

    expect(delegate.events[0].callSite?.file).toBe('Frontend: index.ts');
  });

  it('should strip file:/// and monorepo prefix from frontend paths (production)', () => {
    const asarPath = 'file:///Users/dev/releases/App.app/Contents/Resources/app.asar/modules/app/src/index.ts';
    pipeline.handleFrontendEvent(makeEvent(100, 'test', asarPath));

    expect(delegate.events[0].callSite?.file).toBe('Frontend: index.ts');
  });

  it('should strip backendBasePath and monorepo prefix from backend paths', async () => {
    pipeline.backendBasePath = '/Users/dev/project';
    await pipeline.handle(makeEvent(100, 'test', '/Users/dev/project/modules/electron/src/main.ts'));
    pipeline.close();

    expect(delegate.events[0].callSite?.file).toBe('Backend : main.ts');
  });

  it('should strip file:/// prefix from backend paths (Electron ESM)', async () => {
    pipeline.backendBasePath = '/Users/dev/project';
    await pipeline.handle(makeEvent(100, 'test', 'file:///Users/dev/project/modules/electron/src/main.ts'));
    pipeline.close();

    expect(delegate.events[0].callSite?.file).toBe('Backend : main.ts');
  });

  it('should strip src/ when path starts directly with it', async () => {
    pipeline.backendBasePath = '/Users/dev/project';
    await pipeline.handle(makeEvent(100, 'test', '/Users/dev/project/src/main.ts'));
    pipeline.close();

    expect(delegate.events[0].callSite?.file).toBe('Backend : main.ts');
  });

  it('should leave backend path unchanged when no backendBasePath and no src/', async () => {
    await pipeline.handle(makeEvent(100, 'test', '/some/absolute/path/main.ts'));
    pipeline.close();

    expect(delegate.events[0].callSite?.file).toBe('Backend : /some/absolute/path/main.ts');
  });

  it('should handle frontend paths without protocol gracefully', () => {
    pipeline.handleFrontendEvent(makeEvent(100, 'test', 'plain-file.ts'));

    expect(delegate.events[0].callSite?.file).toBe('Frontend: plain-file.ts');
  });

  // ---- Edge cases ----

  it('should handle events without callSite gracefully', async () => {
    await pipeline.handle(makeEvent(100));
    pipeline.close();

    expect(delegate.events).toHaveLength(1);
    expect(delegate.events[0].callSite).toBeUndefined();
  });

  it('should not modify the original callSite object', async () => {
    const event = makeEvent(100, 'test', 'original.ts');
    const originalFile = event.callSite!.file;

    await pipeline.handle(event);
    pipeline.close();

    expect(delegate.events[0].callSite?.file).toBe('Backend : original.ts');
    expect(originalFile).toBe('original.ts');
  });

  it('should respect level filter via willHandle', async () => {
    pipeline.level = 'WARN';
    await pipeline.handle(makeEvent(100)); // level is INFO — should be filtered
    pipeline.close();

    expect(delegate.events).toHaveLength(0);
  });

  // ---- Multi-delegate ----

  it('should flush to all registered delegates', async () => {
    const second = mockDelegate();
    pipeline.addDelegate('SECOND', second.appender);

    await pipeline.handle(makeEvent(100));
    pipeline.close();

    expect(delegate.events).toHaveLength(1);
    expect(second.events).toHaveLength(1);
  });

  // ---- delegates setter ----

  it('should instantiate delegates from config via setter', async () => {
    const freshPipeline = new PipelineAppender();
    freshPipeline.maxDelay = 50;

    // Real class — vi.fn() arrow functions are not constructable
    class MockAppender {
      colored?: boolean;
      pretty?: boolean;
      handle = vi.fn(async () => {});
      willHandle = vi.fn(() => true);
    }

    // Simulates what configureLogging does via Reflect.set
    Reflect.set(freshPipeline, 'delegates', {
      TEST: {
        Class: MockAppender,
        colored: true,
        pretty: true,
      },
    });

    // Verify the delegate was created and configured
    // @ts-expect-error accessing private _delegates for testing
    const instance = freshPipeline._delegates.TEST as MockAppender;
    expect(instance.colored).toBe(true);
    expect(instance.pretty).toBe(true);
  });
});
