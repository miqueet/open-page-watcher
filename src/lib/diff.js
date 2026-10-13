const MAX_EDIT_DISTANCE = 2000;
const MAX_TRACE_CELLS = 16_000_000;

// Myers O(ND) diff over arrays of strings.
// Returns a list of { op: 'eq' | 'add' | 'del', value } entries.
// Common prefix and suffix are trimmed first; if the remaining edit distance is
// too large to compute cheaply, the middle is reported as a block replacement.
export function diffArrays(a, b) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const head = a.slice(0, start).map((value) => ({ op: 'eq', value }));
  const tail = a.slice(endA).map((value) => ({ op: 'eq', value }));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const mid = myers(midA, midB) || [
    ...midA.map((value) => ({ op: 'del', value })),
    ...midB.map((value) => ({ op: 'add', value })),
  ];
  return head.concat(mid, tail);
}

function myers(a, b) {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  const trace = [];

  outer: for (let d = 0; d <= max; d++) {
    if (d > MAX_EDIT_DISTANCE || (d + 1) * v.length > MAX_TRACE_CELLS) return null;
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1];
      } else {
        x = v[offset + k - 1] + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) break outer;
    }
  }

  // Walk the trace backwards to recover the edit script.
  const out = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d];
    const k = x - y;
    let prevK;
    if (k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = vd[offset + prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      out.push({ op: 'eq', value: a[x - 1] });
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) out.push({ op: 'add', value: b[y - 1] });
      else out.push({ op: 'del', value: a[x - 1] });
    }
    x = prevX;
    y = prevY;
  }
  return out.reverse();
}

export function splitWords(text) {
  return text.match(/\s+|[^\s]+/g) || [];
}

// Line diff, refined to word diff where a run of deleted lines is
// immediately replaced by a run of added lines.
// Returns lines: [{ type: 'eq'|'add'|'del'|'mod', text?, parts? }]
// where parts is [{ op, value }] for 'mod' lines.
export function diffText(oldText, newText) {
  const a = oldText === '' ? [] : oldText.split('\n');
  const b = newText === '' ? [] : newText.split('\n');
  const ops = diffArrays(a, b);
  const lines = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].op === 'eq') {
      lines.push({ type: 'eq', text: ops[i].value });
      i++;
      continue;
    }
    const dels = [];
    const adds = [];
    while (i < ops.length && ops[i].op !== 'eq') {
      (ops[i].op === 'del' ? dels : adds).push(ops[i].value);
      i++;
    }
    const pairs = Math.min(dels.length, adds.length);
    for (let p = 0; p < pairs; p++) {
      const parts = diffArrays(splitWords(dels[p]), splitWords(adds[p]));
      lines.push({ type: 'mod', parts: mergeParts(parts) });
    }
    for (let p = pairs; p < dels.length; p++) lines.push({ type: 'del', text: dels[p] });
    for (let p = pairs; p < adds.length; p++) lines.push({ type: 'add', text: adds[p] });
  }
  return lines;
}

function mergeParts(parts) {
  const out = [];
  for (const part of parts) {
    const last = out[out.length - 1];
    if (last && last.op === part.op) last.value += part.value;
    else out.push({ ...part });
  }
  return out;
}

// Text that is present in newText but not oldText, used by conditions.
export function addedText(oldText, newText) {
  const added = [];
  for (const line of diffText(oldText, newText)) {
    if (line.type === 'add') added.push(line.text);
    else if (line.type === 'mod') {
      added.push(line.parts.filter((p) => p.op === 'add').map((p) => p.value).join(''));
    }
  }
  return added.join('\n');
}
