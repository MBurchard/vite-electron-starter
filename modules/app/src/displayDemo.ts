import type {Display} from '@common/definitions.js';
import {getLog} from '@app/logging.js';
import '@css/style.css';

const log = getLog('app.display.demo');
const {backend} = window;

function createOverlayElement(
  left: string | number,
  top: string | number,
  width: string | number,
  height: string | number,
): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.style.left = typeof left === 'number' ? `${left}px` : left;
  overlay.style.top = typeof top === 'number' ? `${top}px` : top;
  overlay.style.width = typeof width === 'number' ? `${width}px` : width;
  overlay.style.height = typeof height === 'number' ? `${height}px` : height;
  return overlay;
}

function visualiseDisplays(displays: Display[]) {
  log.debug('visualise displays', displays);

  const minX = Math.min(...displays.map(d => d.bounds.x));
  const minY = Math.min(...displays.map(d => d.bounds.y));

  const maxWidth = Math.max(...displays.map(d => d.bounds.x + d.bounds.width)) - minX;
  const maxHeight = Math.max(...displays.map(d => d.bounds.y + d.bounds.height)) - minY;

  const scale = 800 / maxWidth;

  const container = document.createElement('div');
  container.className = 'displays';
  container.style.width = `${maxWidth * scale}px`;
  container.style.height = `${maxHeight * scale}px`;

  displays.forEach((display) => {
    const borderWidth = 2;
    const left = (display.bounds.x - minX) * scale - borderWidth / 2;
    const top = (display.bounds.y - minY) * scale - borderWidth / 2;
    const width = display.bounds.width * scale - borderWidth;
    const height = display.bounds.height * scale - borderWidth;

    const displayElement = document.createElement('div');
    displayElement.className = 'display';
    if (display.internal) {
      displayElement.classList.add('internal');
    }
    displayElement.style.left = `${left}px`;
    displayElement.style.top = `${top}px`;
    displayElement.style.width = `${width}px`;
    displayElement.style.height = `${height}px`;
    displayElement.style.border = `${borderWidth}px solid black`;
    displayElement.textContent = display.label;

    const idLabel = document.createElement('div');
    idLabel.className = 'idLabel';
    idLabel.textContent = `ID: ${display.id}`;
    displayElement.appendChild(idLabel);

    if (display.primary) {
      const primary = document.createElement('div');
      primary.className = 'primary';
      primary.textContent = 'Primary';
      displayElement.appendChild(primary);
    }

    const topBarHeight = (display.workArea.y - display.bounds.y) * scale;
    if (topBarHeight > 0) {
      const topOverlay = createOverlayElement(0, 0, '100%', `${topBarHeight}px`);
      displayElement.appendChild(topOverlay);
    }

    const bottomBarHeight =
      ((display.bounds.y + display.bounds.height) - (display.workArea.y + display.workArea.height)) * scale;
    if (bottomBarHeight > 0) {
      const bottomOverlay = createOverlayElement(0, '100%', '100%', `${bottomBarHeight}px`);
      displayElement.appendChild(bottomOverlay);
    }

    const leftBarWidth = (display.workArea.x - display.bounds.x) * scale;
    if (leftBarWidth > 0) {
      const leftOverlay = createOverlayElement(0, 0, `${leftBarWidth}px`, '100%');
      displayElement.appendChild(leftOverlay);
    }

    const rightBarWidth =
      ((display.bounds.x + display.bounds.width) - (display.workArea.x + display.workArea.width)) * scale;
    if (rightBarWidth > 0) {
      const rightOverlay = createOverlayElement('100%', 0, `${rightBarWidth}px`, '100%');
      displayElement.appendChild(rightOverlay);
    }

    container.appendChild(displayElement);
  });

  const app = document.querySelector('#app');
  if (app) {
    while (app.firstChild) {
      app.removeChild(app.firstChild);
    }
    app.appendChild(container);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  // initial display setup
  const displayData = await backend.invoke<Display[]>('getDisplayData');
  visualiseDisplays(displayData);
  // react on display setup updates
  backend.on<[Display[]]>('updateDisplayData', visualiseDisplays);
});
