// A small, safe subset of JSONPath for watching parts of a JSON response:
//   $.data.items[0].price   items[*].name   $['odd key'][-1]   $.*.id
// Paths are parsed, never evaluated as code. Filters and scripts ([?()],
// (@.x)) are not supported on purpose.

const MAX_RESULTS = 1000;
const MAX_SEGMENTS = 50;

// Parses a path into segments: { key }, { index }, or { wildcard: true }.
// Throws a readable error for anything outside the subset.
export function parseJsonPath(path) {
  let p = String(path).trim();
  if (p.startsWith('$')) p = p.slice(1);
  const segments = [];
  let i = 0;
  const fail = (why) => {
    throw new Error(`JSON path "${path}": ${why}`);
  };
  while (i < p.length) {
    if (segments.length >= MAX_SEGMENTS) fail('too many parts');
    const c = p[i];
    if (c === '.') {
      if (p[i + 1] === '.') fail('".." (search at any depth) is not supported');
      i++;
      if (p[i] === '*') {
        segments.push({ wildcard: true });
        i++;
        continue;
      }
      const m = /^[^.[\]\s]+/.exec(p.slice(i));
      if (!m) fail('expected a name after "."');
      segments.push({ key: m[0] });
      i += m[0].length;
    } else if (c === '[') {
      const rest = p.slice(i);
      let m;
      if ((m = /^\[\s*\*\s*\]/.exec(rest))) segments.push({ wildcard: true });
      else if ((m = /^\[\s*(-?\d{1,9})\s*\]/.exec(rest))) segments.push({ index: Number(m[1]) });
      else if ((m = /^\[\s*'((?:[^'\\]|\\.)*)'\s*\]/.exec(rest)) || (m = /^\[\s*"((?:[^"\\]|\\.)*)"\s*\]/.exec(rest))) {
        segments.push({ key: m[1].replace(/\\(.)/g, '$1') });
      } else fail('only [number], [*] and [\'name\'] are supported inside brackets');
      i += m[0].length;
    } else if (segments.length === 0 && i === 0) {
      // Allow a leading bare name: "data.items" means "$.data.items".
      const m = /^[^.[\]\s]+/.exec(p);
      segments.push({ key: m[0] });
      i += m[0].length;
    } else {
      fail(`unexpected "${c}"`);
    }
  }
  return segments;
}

// Returns the values the path points at (an empty list if none).
export function selectJson(data, path) {
  let current = [data];
  for (const seg of parseJsonPath(path)) {
    const next = [];
    for (const v of current) {
      if (v === null || typeof v !== 'object') continue;
      if (seg.wildcard) next.push(...(Array.isArray(v) ? v : Object.values(v)));
      else if (seg.index !== undefined) {
        if (!Array.isArray(v)) continue;
        const at = seg.index < 0 ? v.length + seg.index : seg.index;
        if (at >= 0 && at < v.length) next.push(v[at]);
      } else if (Object.hasOwn(v, seg.key)) next.push(v[seg.key]);
      if (next.length > MAX_RESULTS) break;
    }
    current = next.slice(0, MAX_RESULTS);
  }
  return current;
}

// Text for the selected values: plain values as they are, objects and lists
// pretty-printed. One value per line (or block).
export function jsonValuesText(values) {
  return values.map((v) => (v !== null && typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v))).join('\n');
}
