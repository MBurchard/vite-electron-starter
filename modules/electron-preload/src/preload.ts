import {getLog} from '@common/logging.js';
import {contextBridge} from 'electron';

const log = getLog('electron.preload');

contextBridge.exposeInMainWorld('backend', {
  doSthElse: () => {
    log.debug('do something else');
  },
});

log.debug('Preload JS prepared');
