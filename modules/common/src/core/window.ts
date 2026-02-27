/**
 * modules/common/src/core/window.ts
 *
 * @file Shared window/display geometry and metadata types.
 */

/**
 * Axis-aligned rectangle describing a window's or display's position and size.
 */
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Pixel or percentage value used for placement offsets.
 * Percentage values are interpreted relative to the display work area.
 */
export type WindowPlacementOffset = number | `${number}%`;

/**
 * Preferred horizontal alignment for placement.
 */
export type WindowPlacementHorizontal = 'left' | 'center' | 'right';

/**
 * Preferred vertical alignment for placement.
 */
export type WindowPlacementVertical = 'top' | 'center' | 'bottom';

/**
 * Declarative placement options for positioning a window in a display work area.
 */
export interface WindowPlacement {
  horizontal?: WindowPlacementHorizontal;
  vertical?: WindowPlacementVertical;
  top?: WindowPlacementOffset;
  bottom?: WindowPlacementOffset;
  left?: WindowPlacementOffset;
  right?: WindowPlacementOffset;
}

/**
 * Display information sent to the renderer, independent of Electron internals.
 */
export interface WindowDisplayInfo {
  id: number;
  bounds: WindowBounds;
  workArea: WindowBounds;
  scaleFactor: number;
  rotation: number;
  label: string;
  primary: boolean;
}

/**
 * Extended display information including a flag indicating the primary display.
 */
export interface Display extends Electron.Display {
  primary: boolean;
}
