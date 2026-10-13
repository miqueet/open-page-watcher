import { firstNumber } from '../lib/conditions.js';

// "Number history": the first number in each saved version, drawn as a step
// line over time (a value holds until the next change). Built from plain SVG;
// the tooltip and table use textContent only.

const SVG = 'http://www.w3.org/2000/svg';
const HEIGHT = 180;
const PAD = { top: 14, right: 64, bottom: 26, left: 52 };

// Points for the chart, or null when the history isn't about a number.
// Shown when at least two versions carry a number and the watched text is
// short (a price, a count) or the watch has a number rule.
export function numberSeries(history, { numericRule = false } = {}) {
  const points = [];
  for (const h of history) {
    const value = firstNumber(h.text);
    if (value !== null) points.push({ t: h.t, value });
  }
  if (points.length < 2) return null;
  const latest = history[history.length - 1]?.text || '';
  if (!numericRule && latest.length > 300) return null;
  return points;
}

// Up to ~count round tick values covering [min, max].
export function niceTicks(min, max, count = 4) {
  if (!(Number.isFinite(min) && Number.isFinite(max))) return [];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  const ticks = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-9; v += step) {
    ticks.push(Number(v.toPrecision(12)));
    if (ticks.length > 20) break;
  }
  if (ticks[ticks.length - 1] < max) ticks.push(Number((ticks[ticks.length - 1] + step).toPrecision(12)));
  return ticks;
}

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function formatNumber(n) {
  return Math.abs(n) >= 10000 ? compact.format(n) : plain.format(n);
}

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function text(x, y, value, attrs = {}) {
  const node = svg('text', { x, y, ...attrs });
  node.textContent = value;
  return node;
}

function dateLabel(t, spanMs) {
  const d = new Date(t);
  return spanMs < 36 * 3600e3
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function draw(container, points, width, now) {
  const plotW = Math.max(80, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const t0 = points[0].t;
  const t1 = Math.max(now, points[points.length - 1].t + 1);
  const values = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const x = (t) => PAD.left + ((t - t0) / (t1 - t0)) * plotW;
  const y = (v) => PAD.top + (1 - (v - y0) / (y1 - y0 || 1)) * plotH;

  const chart = svg('svg', {
    width, height: HEIGHT, class: 'num-chart', role: 'img', tabindex: 0,
    'aria-label': `Number went from ${formatNumber(values[0])} to ${formatNumber(values[values.length - 1])} across ${points.length} versions. Use the arrow keys to step through them.`,
  });

  for (const v of ticks) {
    chart.append(
      svg('line', { x1: PAD.left, x2: PAD.left + plotW, y1: y(v), y2: y(v), class: 'grid' }),
      text(PAD.left - 8, y(v) + 4, formatNumber(v), { class: 'tick', 'text-anchor': 'end' }),
    );
  }
  const span = t1 - t0;
  chart.append(
    text(PAD.left, HEIGHT - 6, dateLabel(t0, span), { class: 'tick', 'text-anchor': 'start' }),
    text(PAD.left + plotW, HEIGHT - 6, now >= points[points.length - 1].t ? 'Now' : dateLabel(t1, span), { class: 'tick', 'text-anchor': 'end' }),
  );

  // Step line: each value holds until the next version, the last one until now.
  let d = `M${x(points[0].t)},${y(points[0].value)}`;
  for (let i = 1; i < points.length; i++) d += `H${x(points[i].t)}V${y(points[i].value)}`;
  d += `H${x(t1)}`;
  chart.append(svg('path', { d, class: 'line' }));

  // Change markers when there's room, plus the end value.
  const showDots = points.length <= 40 && plotW / points.length >= 8;
  points.forEach((p, i) => {
    if (showDots || i === points.length - 1) chart.append(svg('circle', { cx: x(p.t), cy: y(p.value), r: 4, class: 'dot' }));
  });
  const last = points[points.length - 1];
  chart.append(text(x(t1) + 6, y(last.value) + 4, formatNumber(last.value), { class: 'end' }));

  // Crosshair + tooltip, snapping to the nearest version.
  const cross = svg('line', { y1: PAD.top, y2: PAD.top + plotH, class: 'cross', visibility: 'hidden' });
  const focusDot = svg('circle', { r: 5, class: 'focus-dot', visibility: 'hidden' });
  const hit = svg('rect', { x: PAD.left, y: PAD.top, width: plotW, height: plotH, class: 'hit' });
  chart.append(cross, focusDot, hit);

  const tip = document.createElement('div');
  tip.className = 'num-tip';
  tip.hidden = true;
  const tipValue = document.createElement('strong');
  const tipDate = document.createElement('span');
  tip.append(tipValue, tipDate);

  let active = -1;
  const show = (i) => {
    active = Math.max(0, Math.min(points.length - 1, i));
    const p = points[active];
    const px = x(p.t);
    const py = y(p.value);
    cross.setAttribute('x1', px);
    cross.setAttribute('x2', px);
    cross.setAttribute('visibility', 'visible');
    focusDot.setAttribute('cx', px);
    focusDot.setAttribute('cy', py);
    focusDot.setAttribute('visibility', 'visible');
    const prev = points[active - 1];
    const delta = prev ? p.value - prev.value : 0;
    tipValue.textContent = formatNumber(p.value) + (prev && delta ? ` (${delta > 0 ? '+' : '−'}${formatNumber(Math.abs(delta))})` : '');
    tipDate.textContent = new Date(p.t).toLocaleString();
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.max(0, px + 10 + w > width ? px - w - 10 : px + 10)}px`;
    tip.style.top = `${Math.max(0, py - tip.offsetHeight - 10)}px`;
  };
  const hide = () => {
    active = -1;
    cross.setAttribute('visibility', 'hidden');
    focusDot.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  };
  const nearest = (clientX) => {
    const box = chart.getBoundingClientRect();
    const t = t0 + ((clientX - box.left - PAD.left) / plotW) * (t1 - t0);
    let best = 0;
    // A value holds until the next change, so the pointer belongs to the
    // latest version at or before it.
    for (let i = 0; i < points.length; i++) if (points[i].t <= t) best = i;
    return best;
  };
  hit.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  hit.addEventListener('pointerleave', hide);
  chart.addEventListener('blur', hide);
  chart.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      show(active < 0 ? points.length - 1 : active + (e.key === 'ArrowRight' ? 1 : -1));
    } else if (e.key === 'Escape') {
      hide();
    }
  });

  container.replaceChildren(chart, tip);
}

function table(points) {
  const rows = points.slice().reverse().map((p, i, arr) => {
    const prev = arr[i + 1];
    const tr = document.createElement('tr');
    const cells = [
      new Date(p.t).toLocaleString(),
      formatNumber(p.value),
      prev ? `${p.value - prev.value >= 0 ? '+' : '−'}${formatNumber(Math.abs(p.value - prev.value))}` : '',
    ];
    for (const c of cells) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.append(td);
    }
    return tr;
  });
  const head = document.createElement('tr');
  for (const h of ['Version saved', 'Number', 'Change']) {
    const th = document.createElement('th');
    th.textContent = h;
    head.append(th);
  }
  const t = document.createElement('table');
  t.className = 'num-table';
  const thead = document.createElement('thead');
  thead.append(head);
  const tbody = document.createElement('tbody');
  tbody.append(...rows);
  t.append(thead, tbody);
  return t;
}

// The whole section: heading, chart, and a table view.
export function numberChart(points, { now = Date.now() } = {}) {
  const section = document.createElement('section');
  section.className = 'num-section';
  const h = document.createElement('h2');
  h.textContent = 'Number history';
  const sub = document.createElement('p');
  sub.className = 'hint';
  sub.textContent = 'The first number in each saved version.';
  const plot = document.createElement('div');
  plot.className = 'num-plot';
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Show as table';
  details.append(summary, table(points));
  section.append(h, sub, plot, details);

  let lastWidth = 0;
  const observer = new ResizeObserver(() => {
    if (!plot.isConnected) return observer.disconnect();
    const width = Math.floor(plot.clientWidth);
    if (width && width !== lastWidth) {
      lastWidth = width;
      draw(plot, points, width, now);
    }
  });
  observer.observe(plot);
  return section;
}
