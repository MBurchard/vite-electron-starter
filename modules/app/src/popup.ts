import {getLog} from '@app/logging.js';

const log = getLog('app.popup');

window.addEventListener('DOMContentLoaded', async () => {
  log.debug('DOMContentLoaded');
});
