import {getLog} from '@common/logging.js';
import {doSth} from '@common/someutil.js';

const log = getLog('app.main');

window.addEventListener('DOMContentLoaded', async () => {
  log.debug('DOMContentLoaded');
  document.querySelector('#test')!.innerHTML = doSth('Main');
});
