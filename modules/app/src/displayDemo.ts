import type {Display} from '@common/definitions.js';
import {getLog} from '@app/logging.js';

const log = getLog('app.display.demo');
const {backend} = window;

function createLabelElement(text: string): HTMLDivElement {
  const label = document.createElement('div');
  label.textContent = text;
  label.style.position = 'absolute';
  label.style.top = '6px';
  label.style.right = '6px';
  label.style.background = 'rgba(255, 255, 255, 0.7)';
  label.style.color = 'black';
  label.style.fontSize = '12px';
  label.style.padding = '2px 4px';
  label.style.borderRadius = '3px';
  label.style.fontWeight = 'bold';
  return label;
}

function createOverlayElement(left: number, top: number, width: number, height: number): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.left = `${left}px`;
  overlay.style.top = `${top}px`;
  overlay.style.width = `${width}px`;
  overlay.style.height = `${height}px`;
  overlay.style.background = 'rgba(0, 0, 0, 0.2)';
  return overlay;
}

function createPrimaryLabel(): HTMLDivElement {
  const label = document.createElement('div');
  label.textContent = 'Primary';
  label.style.position = 'absolute';
  label.style.top = '6px';
  label.style.left = '6px';
  label.style.background = 'rgba(100, 180, 100, 0.6)';
  label.style.color = 'white';
  label.style.fontSize = '12px';
  label.style.padding = '2px 6px';
  label.style.borderRadius = '3px';
  label.style.fontWeight = 'bold';
  return label;
}

function visualiseDisplays(displays: Display[]) {
  log.debug('visualise displays', displays);

  const minX = Math.min(...displays.map(d => d.bounds.x));
  const minY = Math.min(...displays.map(d => d.bounds.y));

  const maxWidth = Math.max(...displays.map(d => d.bounds.x + d.bounds.width)) - minX;
  const maxHeight = Math.max(...displays.map(d => d.bounds.y + d.bounds.height)) - minY;

  const scale = 800 / maxWidth;

  const container = document.createElement('div');
  container.style.position = 'relative';
  container.style.width = `${maxWidth * scale}px`;
  container.style.height = `${maxHeight * scale}px`;
  container.style.border = '1px solid #ccc';
  container.style.background = '#f0f0f0';
  container.style.margin = '20px auto';

  displays.forEach((display) => {
    const borderWidth = 2;
    const left = (display.bounds.x - minX) * scale - borderWidth / 2;
    const top = (display.bounds.y - minY) * scale - borderWidth / 2;
    const width = display.bounds.width * scale - borderWidth;
    const height = display.bounds.height * scale - borderWidth;

    const displayElement = document.createElement('div');
    displayElement.style.position = 'absolute';
    displayElement.style.left = `${left}px`;
    displayElement.style.top = `${top}px`;
    displayElement.style.width = `${width}px`;
    displayElement.style.height = `${height}px`;
    displayElement.style.border = `${borderWidth}px solid black`;
    displayElement.style.background = display.internal ? '#ADD8E6' : '#FFD700';
    displayElement.style.display = 'flex';
    displayElement.style.alignItems = 'center';
    displayElement.style.justifyContent = 'center';
    displayElement.style.fontSize = '14px';
    displayElement.textContent = display.label;

    // ID-Label hinzufügen (oben rechts)
    const idLabel = createLabelElement(`ID: ${display.id}`);
    displayElement.appendChild(idLabel);

    // "Primary" Label hinzufügen, falls das Display primär ist
    if (display.primary) {
      displayElement.appendChild(createPrimaryLabel());
    }

    container.appendChild(displayElement);

    // Taskleisten berechnen und Schatten hinzufügen
    const topBarHeight = (display.workArea.y - display.bounds.y) * scale;
    if (topBarHeight > 0) {
      container.appendChild(createOverlayElement(left, top, width + borderWidth, topBarHeight));
    }

    const bottomBarHeight =
      ((display.bounds.y + display.bounds.height) - (display.workArea.y + display.workArea.height)) * scale;
    if (bottomBarHeight > 0) {
      container.appendChild(
        createOverlayElement(left, top + height - bottomBarHeight, width + borderWidth, bottomBarHeight),
      );
    }

    const leftBarWidth = (display.workArea.x - display.bounds.x) * scale;
    if (leftBarWidth > 0) {
      container.appendChild(createOverlayElement(left, top, leftBarWidth, height + borderWidth));
    }

    const rightBarWidth =
      ((display.bounds.x + display.bounds.width) - (display.workArea.x + display.workArea.width)) * scale;
    if (rightBarWidth > 0) {
      container.appendChild(
        createOverlayElement(left + width - rightBarWidth, top, rightBarWidth, height + borderWidth),
      );
    }
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
