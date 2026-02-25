import type {IAppender, ILogEvent} from '@mburchard/bit-log/definitions';
import {configureLogging, useLog} from '@mburchard/bit-log';
import {Ansi} from '@mburchard/bit-log/ansi';
import {ConsoleAppender} from '@mburchard/bit-log/appender/ConsoleAppender';
import {FileAppender} from '@mburchard/bit-log/appender/FileAppender';
import {app} from 'electron';
import {registerFrontendListener} from '../ipc.js';
import {getLogPath} from '../utils/electron-utils.js';
import {fileExists, mkDir} from '../utils/file-utils.js';
import {PipelineAppender} from './PipelineAppender.js';
import 'source-map-support/register.js';

// temporarily change the log level of the ROOT logger to DEBUG
useLog('', 'DEBUG');

const log = useLog('electron.logging');

let isLoggingSetup = false;

/**
 * Initialise the application logging pipeline. Creates the log directory if needed,
 * configures the PipelineAppender with Console + File delegates, and wires up
 * the frontend IPC listener so renderer events flow through the same pipeline.
 */
async function setupApplicationLogging(): Promise<void> {
  if (isLoggingSetup) {
    return;
  }
  isLoggingSetup = true;
  try {
    const logPath = getLogPath();
    log.debug(`set up Application Logging in path: ${logPath}`);
    if (!await fileExists(logPath)) {
      log.debug(`the filepath for logging '${logPath}' does not exists, creating...`);
      const result = await mkDir(logPath);
      log.info('filepath created:', result);
    }
    configureLogging({
      appender: {
        PIPELINE: {
          Class: PipelineAppender,
          backendBasePath: app.getAppPath(),
          delegates: {
            CONSOLE: {
              Class: ConsoleAppender,
              colored: true,
              pretty: true,
            },
            FILE: {
              Class: FileAppender,
              baseName: 'app',
              filePath: logPath,
              colored: true,
              pretty: true,
            },
          },
        },
      },
      root: {
        appender: ['PIPELINE'],
        includeCallSite: true,
        level: 'DEBUG',
      },
    });

    const msg =
      `${Ansi.magenta('**********')} App (${Ansi.cyan(app.getVersion())}) (re)started ${Ansi.magenta('**********')}`;
    log.info(msg);

    // Frontend IPC → PipelineAppender
    const rootLogger = useLog('') as unknown as {appender: Record<string, IAppender>};
    const pipeline = rootLogger.appender.PIPELINE as PipelineAppender;
    registerFrontendListener('frontendLogging', (_event, _windowId, logEvent: ILogEvent) => {
      if (logEvent != null) {
        pipeline.handleFrontendEvent(logEvent);
      }
    });
  } catch (e) {
    log.error('error during method setupApplicationLogging', e);
  }
}

setupApplicationLogging().catch(reason => log.error('error during setup application logging', reason));

export const getLogger = useLog;
