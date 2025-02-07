import type {Versions} from '@common/definitions.js';
import {getLog} from '@app/logging.js';
import electronLogo from '@assets/electron.svg';
import typescriptLogo from '@assets/typescript.svg';
import viteLogo from '@assets/vite.svg';
import '@css/style.css';

const log = getLog('app.main');
const {backend} = window;

function showDisplayDemo() {
  log.debug('show display demo');
  backend.emit('showDisplayDemo');
}

window.addEventListener('DOMContentLoaded', async () => {
  log.debug('DOMContentLoaded');

  let versions: Versions | undefined;
  try {
    versions = await backend.getVersions();
    log.debug('Versions:', versions);
  } catch {}

  document.querySelector('#app')!.innerHTML = `
  <div>
    <img src="${viteLogo}" class="logo" alt="Vite logo" />
    <img src="${electronLogo}" class="logo" alt="Electron logo" />
    <img src="${typescriptLogo}" class="logo" alt="TypeScript logo" />
    <h1>Vite + Electron + TypeScript</h1>
    <p>Current used program versions:</p>
    <div class="tiles">
      <div class="tile">Chrome: ${versions?.chrome}</div>
      <div class="tile">Electron: ${versions?.electron}</div>
      <div class="tile">Node: ${versions?.node}</div>
    </div>
    <p>&nbsp;</p>
    <p>
      <button id="displayDemoBtn">Demo Window Manager</button>
    </p>
  </div>`;
  document.querySelector<HTMLButtonElement>('#displayDemoBtn')?.addEventListener('click', showDisplayDemo);
});
