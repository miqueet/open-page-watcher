import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pixelDifference, changedCells, sameShape, describeShotChange, steadyCapture, captureCrop,
} from '../src/lib/shots.js';

function image(width, height, paint = () => [255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return data;
}

test('identical and slightly noisy pictures do not differ', () => {
  const a = image(20, 10);
  assert.equal(pixelDifference(a, a), 0);
  assert.equal(pixelDifference(a, image(20, 10, () => [240, 250, 230])), 0);
});

test('the share of changed pixels is reported in percent', () => {
  const a = image(10, 10);
  const b = image(10, 10, (x, y) => (y < 2 ? [255, 0, 0] : [255, 255, 255]));
  assert.equal(pixelDifference(a, b), 20);
  assert.equal(pixelDifference(a, image(5, 5)), 100);
});

test('changed cells are merged along a row', () => {
  const a = image(48, 24);
  const b = image(48, 24, (x, y) => (x >= 13 && x < 30 && y < 3 ? [0, 0, 0] : [255, 255, 255]));
  assert.deepEqual(changedCells(a, b, 48, 24, 12), [{ x: 12, y: 0, w: 24, h: 12 }]);
  assert.deepEqual(changedCells(a, a, 48, 24, 12), []);
});

test('size changes are spotted and described', () => {
  assert.equal(sameShape({ width: 100, height: 50 }, { width: 101, height: 52 }), true);
  assert.equal(sameShape({ width: 100, height: 50 }, { width: 100, height: 80 }), false);
  assert.equal(describeShotChange(4.26), 'Looks different: 4.3% of the screenshot changed.');
  assert.equal(describeShotChange(37.6), 'Looks different: 38% of the screenshot changed.');
  assert.equal(describeShotChange(0.01), 'Looks different: 0.1% of the screenshot changed.');
  assert.equal(describeShotChange(100, { resized: true }), 'Looks different: the watched area changed size.');
});

test('a capture is only kept when nothing moved while it was taken', () => {
  const area = { vw: 800, vh: 600, x: 10, y: 20, w: 300, h: 120 };
  assert.equal(steadyCapture(area, { ...area }, { width: 1600, height: 1200 }), true);
  assert.equal(steadyCapture(area, { ...area, y: 20.5 }, { width: 800, height: 600 }), true);
  assert.equal(steadyCapture(area, area, { width: 0, height: 600 }), false);
  // The viewport or the watched part changed between measuring and capturing.
  assert.equal(steadyCapture(area, { ...area, vw: 500 }, { width: 800, height: 600 }), false);
  assert.equal(steadyCapture(area, { ...area, y: 60 }, { width: 800, height: 600 }), false);
  assert.equal(steadyCapture(area, undefined, { width: 800, height: 600 }), false);
  assert.equal(steadyCapture({ ...area, dpr: 1 }, { ...area, dpr: 2 }, { width: 800, height: 600 }), false);
});

test('the watched area is found in the capture at the right scale', () => {
  const area = { vw: 1280, vh: 720, dpr: 1, x: 0, y: 0, w: 308, h: 128 };
  // The whole viewport, at the device pixel ratio.
  assert.deepEqual(captureCrop(area, { width: 1280, height: 720 }), { sx: 0, sy: 0, sw: 308, sh: 128 });
  assert.deepEqual(captureCrop({ ...area, dpr: 2, x: 10 }, { width: 2560, height: 1440 }), { sx: 20, sy: 0, sw: 616, sh: 256 });
  // A pixel or two off the expected size (fractional ratios round).
  assert.deepEqual(captureCrop({ ...area, dpr: 1.25 }, { width: 1600, height: 901 }), { sx: 0, sy: 0, sw: 385, sh: 160 });
  // The whole viewport, scaled down by Chrome: same shape, so same scale both ways.
  assert.deepEqual(captureCrop({ ...area, dpr: 2 }, { width: 1280, height: 720 }), { sx: 0, sy: 0, sw: 308, sh: 128 });
});

test('a capture cut off at the window is not stretched to fit the viewport', () => {
  // Seen on GitHub's runners: an 800x600 hidden window with a 1280x720
  // viewport is sometimes captured at 800x600, the viewport's top-left part.
  // Stretching it gave the same page a 1.6x zoomed crop ("Looks different: 11%").
  const area = { vw: 1280, vh: 720, dpr: 1, x: 0, y: 0, w: 308, h: 128 };
  assert.deepEqual(captureCrop(area, { width: 800, height: 600 }), { sx: 0, sy: 0, sw: 308, sh: 128 });
  // When the watched part isn't all inside the cut-off picture, it can't be used.
  assert.equal(captureCrop({ ...area, x: 600 }, { width: 800, height: 600 }), null);
  assert.equal(captureCrop({ ...area, y: 500 }, { width: 800, height: 600 }), null);
  assert.equal(captureCrop(area, { width: 0, height: 600 }), null);
  assert.equal(captureCrop(undefined, { width: 800, height: 600 }), null);
});
