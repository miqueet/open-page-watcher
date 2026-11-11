import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pixelDifference, changedCells, sameShape, describeShotChange, steadyCapture,
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

test('a capture is only kept when nothing moved and it matches the viewport', () => {
  const area = { vw: 800, vh: 600, x: 10, y: 20, w: 300, h: 120 };
  assert.equal(steadyCapture(area, { ...area }, { width: 1600, height: 1200 }), true);
  assert.equal(steadyCapture(area, { ...area, y: 20.5 }, { width: 800, height: 600 }), true);
  // The window was still resizing: the picture has another shape.
  assert.equal(steadyCapture(area, area, { width: 500, height: 600 }), false);
  // The viewport or the watched part changed between measuring and capturing.
  assert.equal(steadyCapture(area, { ...area, vw: 500 }, { width: 800, height: 600 }), false);
  assert.equal(steadyCapture(area, { ...area, y: 60 }, { width: 800, height: 600 }), false);
  assert.equal(steadyCapture(area, undefined, { width: 800, height: 600 }), false);
});
