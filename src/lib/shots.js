// Screenshot comparison. These functions work on raw RGBA pixels so they can
// be tested without a browser; decoding and drawing happen in the service
// worker (comparing) and the inbox (showing what changed).

// How far apart two pixels' colors may be (0-255, any channel) and still count
// as the same. Screenshots are stored as lossy WebP, so a little noise is normal.
export const PIXEL_TOLERANCE = 40;

// The size screenshots are scaled down to before they're compared.
export const COMPARE_WIDTH = 240;

function pixelDiffers(a, b, i, tolerance) {
  return Math.abs(a[i] - b[i]) > tolerance
    || Math.abs(a[i + 1] - b[i + 1]) > tolerance
    || Math.abs(a[i + 2] - b[i + 2]) > tolerance;
}

// The percentage (0-100) of pixels that differ between two images of the same
// size, given as RGBA arrays.
export function pixelDifference(a, b, tolerance = PIXEL_TOLERANCE) {
  if (!a || !b || a.length !== b.length || a.length % 4) return 100;
  const total = a.length / 4;
  if (!total) return 0;
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) if (pixelDiffers(a, b, i, tolerance)) changed++;
  return (changed / total) * 100;
}

// Whether two screenshot sizes are close enough to compare pixel by pixel.
// A page that got taller or narrower is a change in itself.
export function sameShape(a, b) {
  return Math.abs(a.width - b.width) <= 2 && Math.abs(a.height - b.height) <= 2;
}

// The square cells (in the images' own pixels) that hold changed pixels, for
// outlining changes. Neighbouring cells are merged into rectangles row by row.
export function changedCells(a, b, width, height, cell = 12, tolerance = PIXEL_TOLERANCE) {
  const boxes = [];
  if (!a || !b || a.length !== b.length || a.length !== width * height * 4) return boxes;
  for (let cy = 0; cy < height; cy += cell) {
    let run = null;
    for (let cx = 0; cx < width; cx += cell) {
      let hit = false;
      for (let y = cy; y < Math.min(cy + cell, height) && !hit; y++) {
        for (let x = cx; x < Math.min(cx + cell, width); x++) {
          if (pixelDiffers(a, b, (y * width + x) * 4, tolerance)) {
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        if (run) run.w = Math.min(cx + cell, width) - run.x;
        else run = { x: cx, y: cy, w: Math.min(cell, width - cx), h: Math.min(cell, height - cy) };
      } else if (run) {
        boxes.push(run);
        run = null;
      }
    }
    if (run) boxes.push(run);
  }
  return boxes;
}

// The notification text for a screenshot-only change.
export function describeShotChange(percent, { resized = false } = {}) {
  if (resized) return 'Looks different: the watched area changed size.';
  const p = percent >= 10 ? Math.round(percent) : Math.max(0.1, Math.round(percent * 10) / 10);
  return `Looks different: ${p}% of the screenshot changed.`;
}
