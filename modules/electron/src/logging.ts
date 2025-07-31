import type {ILogEvent} from '@mburchard/bit-log/definitions';
import {configureLogging, useLog} from '@mburchard/bit-log';
import {Ansi} from '@mburchard/bit-log/ansi';
import {ConsoleAppender} from '@mburchard/bit-log/appender/ConsoleAppender';
import {FileAppender} from '@mburchard/bit-log/appender/FileAppender';
import {app} from 'electron';
import {registerFrontendListener} from './ipc.js';
import {getLogPath} from './utils/electron-utils.js';
import {fileExists, mkDir} from './utils/file-utils.js';
import 'source-map-support/register.js';

// temporarily change the log level of the ROOT logger to DEBUG
useLog('', 'DEBUG');

const log = useLog('electron.logging');

let isLoggingSetup = false;

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
        CONSOLE: {
          Class: ConsoleAppender,
          colored: true,
          pretty: true,
        },
        APP_FILE: {
          Class: FileAppender,
          baseName: 'electron.main',
          filePath: logPath,
          colored: true,
          pretty: true,
        },
        FRONTEND_APP_FILE: {
          Class: FileAppender,
          baseName: 'frontend.app',
          filePath: logPath,
          colored: true,
          pretty: true,
        },
      },
      root: {
        appender: ['CONSOLE', 'APP_FILE'],
        includeCallSite: true,
        level: 'DEBUG',
      },
      logger: {
        'frontend-app': {
          appender: ['FRONTEND_APP_FILE'],
          level: 'DEBUG',
        },
      },
    });
    const frontendLoggingHelper = useLog('frontend-app');
    const msg =
      `${Ansi.magenta('**********')} App (${Ansi.cyan(app.getVersion())}) (re)started ${Ansi.magenta('**********')}`;
    log.info(msg);
    frontendLoggingHelper.info(msg);
    registerFrontendListener('frontendLogging', (_event, _windowId, logEvent: ILogEvent) => {
      if (logEvent != null) {
        frontendLoggingHelper.emit(logEvent);
      }
    });
  } catch (e) {
    log.error('error during method setupApplicationLogging', e);
  }
}

setupApplicationLogging().catch(reason => log.error('error during setup application logging', reason));

export const getLogger = useLog;
