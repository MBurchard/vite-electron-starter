import {configureLogging, useLog} from '@mburchard/bit-log';
import {ConsoleAppender} from '@mburchard/bit-log/dist/appender/ConsoleAppender.js';
import {FileAppender} from '@mburchard/bit-log/dist/appender/FileAppender.js';
import {LogLevel} from '@mburchard/bit-log/dist/definitions.js';
import {fileExists, mkDir} from './file-utils';
import 'source-map-support/register.js';

// temporarily change the log level of the ROOT logger to DEBUG
const rootLog = useLog('');
rootLog.level = LogLevel.DEBUG;

const log = useLog('electron.logging');

export async function setupApplicationLogging(logPath: string): Promise<void> {
  try {
    log.debug('set up Application Logging from configuration');
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
          colored: true,
          pretty: true,
          filePath: logPath,
        },
      },
      root: {
        appender: ['CONSOLE', 'APP_FILE'],
        level: 'DEBUG',
      },
    });
  } catch (e) {
    log.error('error during method setupApplicationLogging', e);
  }
}

export const getLogger = useLog;
