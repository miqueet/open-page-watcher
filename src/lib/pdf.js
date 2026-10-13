// Dependency-free PDF text extraction, for watching PDF documents.
//
// Reads classic and stream cross-reference tables (scanning the file when they
// are damaged), object streams, the page tree, Flate/ASCIIHex/ASCII85 filters,
// ToUnicode CMaps, simple font encodings and Form XObjects. Lines and spaces
// come from glyph positions: a move to another baseline starts a new line and
// a horizontal gap starts a new word.
//
// The input is untrusted: every loop and recursion is bounded, decompressed
// data is capped and nothing is evaluated. Only web APIs are used
// (DecompressionStream), so this runs in Node and in the extension alike.

const MAX_DECODED = 50 * 1024 * 1024; // decompressed bytes for the whole file
const MAX_CONTENT_WORK = 100 * 1024 * 1024; // content bytes interpreted, repeated forms included
const MAX_TEXT = 10_000_000; // characters of extracted text
const MAX_OBJECTS = 200_000; // distinct objects loaded
const MAX_TABLE_ENTRIES = 2_000_000; // ToUnicode mappings and glyph widths across all fonts
const MAX_NESTING = 64; // arrays and dictionaries inside each other
const MAX_FORM_DEPTH = 8; // Form XObjects inside each other
const MAX_PAGE_NODES = 100_000;
const KERN_SPACE = 150; // TJ adjustment, in thousandths of an em, that reads as a space

class PdfError extends Error {}
// Resource limits end the whole extraction instead of just one page.
class LimitError extends PdfError {}
const TOO_LARGE = 'PDF is too large: more than 50 MB of decompressed data';
const TOO_COMPLEX = 'PDF content is too large or complex to extract';

// ---- Lexer and object parser ----

const SPACE = 1;
const DELIM = 2;
const CHAR_CLASS = new Uint8Array(256);
for (const c of [0, 9, 10, 12, 13, 32]) CHAR_CLASS[c] = SPACE;
for (const c of '()<>[]{}/%') CHAR_CLASS[c.charCodeAt(0)] = DELIM;

class Name { constructor(name) { this.name = name; } }
class Ref { constructor(num) { this.num = num; } }
class Cmd { constructor(cmd) { this.cmd = cmd; } } // keyword, operator or delimiter

class Stream {
  constructor(dict, raw) {
    this.dict = dict;
    this.raw = raw;
    this.decoded = undefined; // Uint8Array, or null when it cannot be decoded
    this.objects = null; // object number -> offset, for object streams
    this.cmap = undefined; // parsed CMap, for ToUnicode and encoding streams
  }
}

const EOF = new Cmd('');
const IDENTITY = [1, 0, 0, 1, 0, 0];
const isName = (v, name) => v instanceof Name && v.name === name;
const isCmd = (v, cmd) => v instanceof Cmd && v.cmd === cmd;
const nameOf = (v) => (v instanceof Name ? v.name : '');
const num = (v, fallback) => (typeof v === 'number' ? v : fallback);
const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const isDigit = (c) => c >= 0x30 && c <= 0x39;
const isNumeric = (c) => isDigit(c) || c === 0x2b || c === 0x2d || c === 0x2e;

function hexValue(c) {
  if (c >= 0x30 && c <= 0x39) return c - 0x30;
  if (c >= 0x41 && c <= 0x46) return c - 0x37;
  return c >= 0x61 && c <= 0x66 ? c - 0x57 : -1;
}

function latin1(bytes, start, end) {
  let s = '';
  for (let i = start; i < end; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(end, i + 8192)));
  return s;
}

// Hex digits up to '>' or `end`; whitespace and junk are skipped.
function hexDecode(bytes, start, end) {
  const out = new Uint8Array(((end - start) >> 1) + 1);
  let n = 0;
  let hi = -1;
  for (let i = start; i < end && bytes[i] !== 0x3e; i++) {
    const v = hexValue(bytes[i]);
    if (v < 0) continue;
    if (hi < 0) hi = v;
    else {
      out[n++] = (hi << 4) | v;
      hi = -1;
    }
  }
  if (hi >= 0) out[n++] = hi << 4;
  return out.subarray(0, n);
}

class Lexer {
  constructor(bytes, pos = 0) {
    this.bytes = bytes;
    this.pos = pos;
  }

  // Returns a number, Uint8Array (string), Name or Cmd. Always advances unless at EOF.
  next() {
    const b = this.bytes;
    while (this.pos < b.length) { // whitespace and % comments
      if (b[this.pos] === 0x25) {
        while (this.pos < b.length && b[this.pos] !== 10 && b[this.pos] !== 13) this.pos++;
      } else if (CHAR_CLASS[b[this.pos]] === SPACE) this.pos++;
      else break;
    }
    if (this.pos >= b.length) return EOF;
    const c = b[this.pos];
    const start = this.pos;
    if (c === 0x28) return this.literalString();
    if (c === 0x2f) return this.name();
    if ((c === 0x3c || c === 0x3e) && b[this.pos + 1] === c) {
      this.pos += 2;
      return new Cmd(c === 0x3c ? '<<' : '>>');
    }
    if (c === 0x3c) {
      const end = b.indexOf(0x3e, this.pos);
      this.pos = end < 0 ? b.length : end + 1;
      return hexDecode(b, start + 1, end < 0 ? b.length : end);
    }
    if (CHAR_CLASS[c] === DELIM) {
      this.pos++;
      return new Cmd(String.fromCharCode(c));
    }
    if (isNumeric(c)) {
      while (this.pos < b.length && isNumeric(b[this.pos])) this.pos++;
      const n = parseFloat(latin1(b, start, Math.min(this.pos, start + 32)));
      return Number.isFinite(n) ? n : 0;
    }
    while (this.pos < b.length && CHAR_CLASS[b[this.pos]] === 0) this.pos++;
    return new Cmd(latin1(b, start, Math.min(this.pos, start + 64)));
  }

  literalString() {
    const b = this.bytes;
    let end = this.pos; // find the closing parenthesis first, to size the output
    for (let depth = 0; end < b.length; end++) {
      if (b[end] === 0x5c) end++;
      else if (b[end] === 0x28) depth++;
      else if (b[end] === 0x29 && --depth === 0) break;
    }
    end = Math.min(end, b.length);
    const out = new Uint8Array(end - this.pos);
    let n = 0;
    for (let i = this.pos + 1; i < end; i++) {
      let c = b[i];
      if (c === 13) { // a bare line break reads as \n
        out[n++] = 10;
        if (b[i + 1] === 10) i++;
      } else if (c !== 0x5c) out[n++] = c;
      else if ((c = b[++i]) >= 0x30 && c <= 0x37) { // \ddd octal
        let v = c - 0x30;
        for (let k = 0; k < 2 && b[i + 1] >= 0x30 && b[i + 1] <= 0x37; k++) v = v * 8 + b[++i] - 0x30;
        out[n++] = v;
      } else if (c === 13 || c === 10) { // escaped line break: continuation
        if (c === 13 && b[i + 1] === 10) i++;
      } else if (i < end) out[n++] = { 0x6e: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12 }[c] ?? c;
    }
    this.pos = end + 1;
    return out.subarray(0, n);
  }

  name() {
    const b = this.bytes;
    let s = '';
    let i = this.pos + 1;
    while (i < b.length && CHAR_CLASS[b[i]] === 0) {
      let c = b[i++];
      if (c === 0x23 && hexValue(b[i]) >= 0 && hexValue(b[i + 1]) >= 0) {
        c = hexValue(b[i]) * 16 + hexValue(b[i + 1]);
        i += 2;
      }
      if (s.length < 127) s += String.fromCharCode(c);
    }
    this.pos = i;
    return new Name(s);
  }
}

// Parses the object that starts with `tok`. With `refs`, "N G R" becomes a Ref.
function parseValue(lex, tok, refs, depth = 0) {
  if (depth > MAX_NESTING) throw new PdfError('Could not parse PDF: objects are nested too deeply');
  if (isCmd(tok, '[')) {
    const arr = [];
    for (let t = lex.next(); t !== EOF && !isCmd(t, ']'); t = lex.next()) arr.push(parseValue(lex, t, refs, depth + 1));
    return arr;
  }
  if (isCmd(tok, '<<')) {
    const dict = new Map();
    for (let key = lex.next(); key !== EOF && !isCmd(key, '>>'); key = lex.next()) {
      if (!(key instanceof Name)) continue;
      const value = lex.next();
      if (value === EOF || isCmd(value, '>>')) break;
      dict.set(key.name, parseValue(lex, value, refs, depth + 1));
    }
    return dict;
  }
  if (tok instanceof Cmd) return tok.cmd === 'true' ? true : tok.cmd === 'false' ? false : tok.cmd === 'null' ? null : tok;
  if (refs && Number.isInteger(tok) && tok >= 0) {
    const save = lex.pos;
    const gen = lex.next();
    if (Number.isInteger(gen) && gen >= 0 && isCmd(lex.next(), 'R')) return new Ref(tok);
    lex.pos = save;
  }
  return tok;
}

function matchAt(bytes, pos, pattern) {
  for (let k = 0; k < pattern.length; k++) if (bytes[pos + k] !== pattern.charCodeAt(k)) return false;
  return true;
}

function indexOf(bytes, pattern, from = 0, to = bytes.length) {
  const first = pattern.charCodeAt(0);
  for (let i = bytes.indexOf(first, from); i >= 0 && i <= to - pattern.length; i = bytes.indexOf(first, i + 1)) {
    if (matchAt(bytes, i, pattern)) return i;
  }
  return -1;
}

function lastIndexOf(bytes, pattern) {
  for (let i = bytes.length - pattern.length; i >= 0; i--) {
    i = bytes.lastIndexOf(pattern.charCodeAt(0), i);
    if (i < 0 || matchAt(bytes, i, pattern)) return i;
  }
  return -1;
}

function concat(chunks, separator) {
  const extra = separator === undefined ? 0 : 1;
  const out = new Uint8Array(chunks.reduce((size, c) => size + c.length + extra, 0));
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
    if (extra) out[pos++] = separator;
  }
  return out;
}

// ---- Filters ----

function ascii85(data, limit) {
  const size = Math.ceil((data.length * 4) / 5) + data.reduce((z, c) => z + (c === 0x7a ? 4 : 0), 4);
  if (size > limit) throw new LimitError(TOO_LARGE); // "z" expands fourfold
  const out = new Uint8Array(size);
  let n = 0;
  let group = 0;
  let count = 0;
  for (let i = data[0] === 0x3c && data[1] === 0x7e ? 2 : 0; i < data.length && data[i] !== 0x7e; i++) {
    const c = data[i];
    if (c === 0x7a && count === 0) n += 4;
    else if (c >= 0x21 && c <= 0x75) {
      group = group * 85 + (c - 33);
      if (++count < 5) continue;
      for (let k = 0; k < 4; k++) out[n++] = (group >>> (24 - 8 * k)) & 0xff;
      group = count = 0;
    }
  }
  if (count > 1) {
    for (let k = count; k < 5; k++) group = group * 85 + 84;
    for (let k = 0; k < count - 1; k++) out[n++] = (group >>> (24 - 8 * k)) & 0xff;
  }
  return out.subarray(0, n);
}

// Undoes PNG row predictors (DecodeParms /Predictor >= 10), as used by xref streams.
function unpredict(data, parms) {
  const predictor = parms instanceof Map ? num(parms.get('Predictor'), 1) : 1;
  if (predictor < 10) return predictor === 2 ? null : data; // TIFF predictors are not supported
  const clamp = (v, lo, hi, fallback) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
  const colors = clamp(parms.get('Colors'), 1, 32, 1);
  const bits = clamp(parms.get('BitsPerComponent'), 1, 16, 8);
  const bpp = Math.max(1, Math.ceil((colors * bits) / 8));
  const rowLen = Math.ceil((colors * bits * clamp(parms.get('Columns'), 1, 1 << 20, 1)) / 8);
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLen + 1)];
    for (let i = 0, dst = r * rowLen; i < rowLen; i++) {
      const left = i >= bpp ? out[dst + i - bpp] : 0;
      const up = r > 0 ? out[dst + i - rowLen] : 0;
      const upLeft = r > 0 && i >= bpp ? out[dst + i - rowLen - bpp] : 0;
      let v = data[dst + r + 1 + i];
      if (type === 1) v += left;
      else if (type === 2) v += up;
      else if (type === 3) v += (left + up) >> 1;
      else if (type === 4) { // Paeth
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        v += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      out[dst + i] = v;
    }
  }
  return out;
}

// ---- Document structure ----

class PdfDoc {
  constructor(bytes) {
    this.bytes = bytes;
    this.xref = new Map(); // object number -> { offset } or { stm }
    this.trailer = new Map();
    this.cache = new Map();
    this.loading = new Set();
    this.scanned = null; // object number -> offset, from scanning the file
    this.endstreams = null;
    this.fonts = new Map();
    this.decoded = 0;
    this.work = 0;
    this.text = 0;
    this.tableBudget = MAX_TABLE_ENTRIES;
  }

  spend(bytes) {
    if ((this.decoded += bytes) > MAX_DECODED) throw new LimitError(TOO_LARGE);
  }

  async load() {
    if (indexOf(this.bytes, '%PDF-', 0, 1024) < 0) throw new PdfError('Not a PDF file');
    try {
      await this.readXref();
    } catch (err) {
      if (!(err instanceof PdfError) || err instanceof LimitError) throw err;
      this.xref.clear();
    }
    let root = await this.resolve(this.trailer.get('Root'));
    if (!(root instanceof Map) || !root.has('Pages')) {
      await this.reconstruct();
      root = await this.resolve(this.trailer.get('Root'));
    }
    if (this.trailer.has('Encrypt')) throw new PdfError('This PDF is encrypted');
    if (!(root instanceof Map)) throw new PdfError('Could not parse PDF: no document catalog');
    this.root = root;
  }

  // Follows startxref and the /Prev chain; newer sections win.
  async readXref() {
    const at = lastIndexOf(this.bytes, 'startxref');
    if (at < 0) throw new PdfError('No startxref');
    let offset = new Lexer(this.bytes, at + 9).next();
    const seen = new Set();
    while (Number.isInteger(offset) && !seen.has(offset) && seen.size < 64) {
      seen.add(offset);
      let trailer;
      try {
        trailer = await this.readXrefSection(offset);
        const stm = trailer.get('XRefStm'); // hybrid files: the table first, then this stream
        if (Number.isInteger(stm) && !seen.has(stm)) await this.readXrefSection(stm);
      } catch (err) {
        if (seen.size === 1 || !(err instanceof PdfError) || err instanceof LimitError) throw err;
        break; // keep the newer sections of a damaged chain
      }
      for (const [key, value] of trailer) if (!this.trailer.has(key)) this.trailer.set(key, value);
      offset = trailer.get('Prev');
    }
  }

  // Reads one xref table or xref stream and returns its trailer dictionary.
  async readXrefSection(offset) {
    const lex = new Lexer(this.bytes, offset);
    if (isCmd(lex.next(), 'xref')) {
      for (let first = lex.next(); !isCmd(first, 'trailer'); first = lex.next()) {
        const count = lex.next();
        if (!Number.isInteger(first) || !Number.isInteger(count)) throw new PdfError('Broken xref table');
        for (let i = 0; i < count; i++) {
          const [pos, gen, type] = [lex.next(), lex.next(), lex.next()];
          if (!Number.isInteger(pos) || !Number.isInteger(gen) || !(type instanceof Cmd)) throw new PdfError('Broken xref table');
          if (type.cmd === 'n' && !this.xref.has(first + i)) this.xref.set(first + i, { offset: pos });
        }
      }
      const trailer = parseValue(lex, lex.next(), true);
      if (!(trailer instanceof Map)) throw new PdfError('Broken trailer');
      return trailer;
    }
    const stream = await this.parseIndirect(offset);
    const d = stream instanceof Stream && isName(stream.dict.get('Type'), 'XRef') ? stream.dict : null;
    const w = d && d.get('W');
    const data = Array.isArray(w) && w.length === 3 && w.every((x) => Number.isInteger(x) && x >= 0 && x <= 8) ? await this.decode(stream) : null;
    const rowLen = data ? w[0] + w[1] + w[2] : 0;
    if (!rowLen) throw new PdfError('Broken xref stream');
    const field = (pos, len) => data.subarray(pos, pos + len).reduce((v, byte) => v * 256 + byte, 0);
    const index = Array.isArray(d.get('Index')) ? d.get('Index') : [0, num(d.get('Size'), 0)];
    let pos = 0;
    for (let i = 0; i + 1 < index.length; i += 2) {
      for (let j = 0; j < index[i + 1] && pos + rowLen <= data.length; j++, pos += rowLen) {
        const type = w[0] ? field(pos, w[0]) : 1;
        if (this.xref.has(index[i] + j) || (type !== 1 && type !== 2)) continue;
        this.xref.set(index[i] + j, type === 1 ? { offset: field(pos + w[0], w[1]) } : { stm: field(pos + w[0], w[1]) });
      }
    }
    return d;
  }

  // Finds every "N G obj" in the file; later definitions win, as in incremental updates.
  scan() {
    if (this.scanned) return this.scanned;
    const b = this.bytes;
    const back = (j, test, max) => {
      let k = j;
      while (k > 0 && j - k < max && test(b[k - 1])) k--;
      return k;
    };
    const isSpace = (c) => CHAR_CLASS[c] === SPACE;
    this.scanned = new Map();
    for (let i = indexOf(b, 'obj'); i >= 0; i = indexOf(b, 'obj', i + 3)) {
      if (i + 3 < b.length && CHAR_CLASS[b[i + 3]] === 0) continue;
      const genEnd = back(i, isSpace, 16);
      const genStart = back(genEnd, isDigit, 6);
      const numEnd = back(genStart, isSpace, 16);
      const numStart = back(numEnd, isDigit, 11);
      if (genStart === genEnd || numEnd === genStart || numStart === numEnd || isDigit(b[numStart - 1])) continue;
      this.scanned.set(Number(latin1(b, numStart, numEnd)), numStart);
    }
    return this.scanned;
  }

  // Rebuilds the cross-reference data of a damaged file from a scan.
  async reconstruct() {
    const b = this.bytes;
    this.xref.clear();
    this.cache.clear();
    for (const [objNum, offset] of this.scan()) this.xref.set(objNum, { offset });
    let trailer = new Map();
    for (let i = indexOf(b, 'trailer'); i >= 0; i = indexOf(b, 'trailer', i + 7)) {
      const lex = new Lexer(b, i + 7);
      const dict = parseValue(lex, lex.next(), true);
      if (dict instanceof Map && dict.has('Root')) trailer = dict;
    }
    for (const objNum of this.scan().keys()) {
      const obj = await this.getObject(objNum);
      if (!(obj instanceof Stream)) continue;
      if (isName(obj.dict.get('Type'), 'XRef') && obj.dict.has('Root') && !trailer.has('Root')) trailer = obj.dict;
      if (!isName(obj.dict.get('Type'), 'ObjStm')) continue;
      for (const inner of (await this.objStm(obj)).keys()) if (!this.xref.has(inner)) this.xref.set(inner, { stm: objNum });
    }
    for (const objNum of trailer.has('Root') ? [] : this.xref.keys()) {
      if (isName(await this.get(await this.getObject(objNum), 'Type'), 'Catalog')) trailer.set('Root', new Ref(objNum));
    }
    this.trailer = trailer;
  }

  async getObject(objNum) {
    if (this.cache.has(objNum)) return this.cache.get(objNum);
    if (this.loading.has(objNum)) return null; // reference cycle
    if (this.cache.size >= MAX_OBJECTS) throw new LimitError('PDF has too many objects');
    this.loading.add(objNum);
    try {
      const entry = this.xref.get(objNum);
      let value;
      if (entry && entry.stm !== undefined) {
        const stream = await this.getObject(entry.stm);
        const offset = stream instanceof Stream ? (await this.objStm(stream)).get(objNum) : undefined;
        const lex = offset === undefined ? null : new Lexer(stream.decoded, offset);
        if (lex) value = parseValue(lex, lex.next(), true);
      } else if (entry) value = await this.parseIndirect(entry.offset, objNum);
      if (value === undefined && this.scan().has(objNum)) {
        value = await this.parseIndirect(this.scan().get(objNum), objNum); // missing or wrong xref entry
      }
      this.cache.set(objNum, value === undefined ? null : value);
      return this.cache.get(objNum);
    } finally {
      this.loading.delete(objNum);
    }
  }

  // Parses "N G obj ... endobj" at `offset`; undefined when it is not there.
  async parseIndirect(offset, objNum) {
    const b = this.bytes;
    const lex = new Lexer(b, offset);
    const [n, gen, keyword] = [lex.next(), lex.next(), lex.next()];
    if (!Number.isInteger(n) || !Number.isInteger(gen) || !isCmd(keyword, 'obj')) return undefined;
    if (objNum !== undefined && n !== objNum) return undefined;
    const value = parseValue(lex, lex.next(), true);
    if (!(value instanceof Map) || !isCmd(lex.next(), 'stream')) return value;
    let start = lex.pos;
    if (b[start] === 13) start++;
    if (b[start] === 10) start++;
    const length = await this.resolve(value.get('Length'));
    let end = -1;
    if (Number.isInteger(length) && length >= 0 && start + length <= b.length) {
      let p = start + length; // trust /Length only when "endstream" follows it
      while (p < b.length && p - start - length < 4 && CHAR_CLASS[b[p]] === SPACE) p++;
      if (matchAt(b, p, 'endstream')) end = start + length;
    }
    if (end < 0) {
      end = this.endstreamAfter(start);
      if (end > start && b[end - 1] === 10) end--;
      if (end > start && b[end - 1] === 13) end--;
    }
    return new Stream(value, b.subarray(start, end));
  }

  // The first "endstream" at or after `start`. All of them are found in one
  // pass, so a file full of wrong /Length values stays linear.
  endstreamAfter(start) {
    if (!this.endstreams) {
      this.endstreams = [];
      for (let i = indexOf(this.bytes, 'endstream'); i >= 0; i = indexOf(this.bytes, 'endstream', i + 9)) this.endstreams.push(i);
    }
    let [lo, hi] = [0, this.endstreams.length];
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.endstreams[mid] < start) lo = mid + 1;
      else hi = mid;
    }
    return lo < this.endstreams.length ? this.endstreams[lo] : this.bytes.length;
  }

  // Object number -> offset inside a decoded object stream.
  async objStm(stream) {
    if (stream.objects) return stream.objects;
    stream.objects = new Map();
    const data = await this.decode(stream);
    const first = stream.dict.get('First');
    const lex = data && Number.isInteger(first) ? new Lexer(data) : null;
    for (let i = 0; lex && i < stream.dict.get('N'); i++) {
      const [objNum, offset] = [lex.next(), lex.next()];
      if (!Number.isInteger(objNum) || !Number.isInteger(offset)) break;
      if (!stream.objects.has(objNum)) stream.objects.set(objNum, first + offset);
    }
    return stream.objects;
  }

  async resolve(value) {
    for (let i = 0; value instanceof Ref && i < 16; i++) value = await this.getObject(value.num);
    return value instanceof Ref ? null : value;
  }

  async get(dict, key) {
    if (dict instanceof Stream) dict = dict.dict;
    return dict instanceof Map ? this.resolve(dict.get(key)) : undefined;
  }

  async decode(stream) {
    if (stream.decoded !== undefined) return stream.decoded;
    stream.decoded = null;
    const filters = asArray(await this.get(stream, 'Filter'));
    const parms = asArray(await this.get(stream, 'DecodeParms'));
    let data = filters.length <= 4 ? stream.raw : null;
    for (let i = 0; i < filters.length && data; i++) {
      const filter = nameOf(filters[i]);
      if (filter === 'FlateDecode' || filter === 'Fl') {
        data = unpredict(await this.inflate(data), await this.resolve(parms[i])); // inflate spends its own budget
        continue;
      }
      if (filter === 'ASCIIHexDecode' || filter === 'AHx') data = hexDecode(data, 0, data.length);
      else if (filter === 'ASCII85Decode' || filter === 'A85') data = ascii85(data, MAX_DECODED - this.decoded);
      else data = null; // images and other filters carry no text
      if (data) this.spend(data.length);
    }
    stream.decoded = data;
    return data;
  }

  async inflate(data) {
    const zlib = data.length > 1 && (data[0] & 0x0f) === 8 && ((data[0] << 8) | data[1]) % 31 === 0;
    const { out, ok } = await this.inflateWith(data, zlib ? 'deflate' : 'deflate-raw');
    if (ok || !zlib) return out;
    // Bad checksum or framing: raw deflate after the zlib header tolerates both.
    const retry = await this.inflateWith(data.subarray(2), 'deflate-raw');
    return retry.out.length > out.length ? retry.out : out;
  }

  // Inflates with a streaming size check, so a zip bomb stops at the budget.
  // Corrupt data keeps whatever was inflated before the error.
  async inflateWith(data, format) {
    const ds = new DecompressionStream(format);
    const writer = ds.writable.getWriter();
    writer.write(data).catch(() => {});
    writer.close().catch(() => {});
    const reader = ds.readable.getReader();
    const chunks = [];
    try {
      for (let r = await reader.read(); !r.done; r = await reader.read()) {
        this.spend(r.value.length);
        chunks.push(r.value);
      }
      return { out: concat(chunks), ok: true };
    } catch (err) {
      if (!(err instanceof LimitError)) return { out: concat(chunks), ok: false };
      reader.cancel().catch(() => {});
      throw err;
    }
  }

  // Leaf pages in document order, with their inherited /Resources.
  async pages(limit) {
    const pages = [];
    const stack = [{ node: this.root.get('Pages'), resources: undefined }];
    const seen = new Set();
    while (stack.length && pages.length < limit && seen.size < MAX_PAGE_NODES) {
      const item = stack.pop();
      const node = await this.resolve(item.node);
      if (!(node instanceof Map) || seen.has(node)) continue;
      seen.add(node);
      const resources = node.has('Resources') ? node.get('Resources') : item.resources;
      const kids = await this.resolve(node.get('Kids'));
      if (Array.isArray(kids) && !isName(node.get('Type'), 'Page')) {
        for (let i = kids.length - 1; i >= 0; i--) stack.push({ node: kids[i], resources });
      } else if (!isName(node.get('Type'), 'Pages')) pages.push({ dict: node, resources });
    }
    return pages;
  }

  // Parsed once per stream, however many fonts share it.
  async cmap(stream) {
    if (stream.cmap === undefined) {
      const data = await this.decode(stream);
      stream.cmap = data ? parseCMap(data, this.tableBudget) : null;
      if (stream.cmap) this.tableBudget -= stream.cmap.used;
    }
    return stream.cmap;
  }
}

// ---- Fonts ----

const chars = (from, to) => String.fromCharCode(...Array.from({ length: to - from + 1 }, (_, i) => from + i));

// Code -> text for a simple font: ASCII, then `high` from code `from` ('\0' = undefined).
function encodingTable(high, from) {
  const table = new Array(256).fill('');
  for (let c = 32; c < 127; c++) table[c] = String.fromCharCode(c);
  for (let i = 0; i < high.length; i++) table[from + i] = high[i] === '\0' ? '' : high[i];
  return table;
}

// WinAnsi maps its unused codes to a bullet, as viewers do.
const WIN_ANSI = encodingTable('•€•‚ƒ„…†‡ˆ‰Š‹Œ•Ž••‘’“”•–—˜™š›œ•žŸ ' + chars(0xa1, 0xac) + '-' + chars(0xae, 0xff), 0x7f);
const STANDARD = encodingTable('¡¢£⁄¥ƒ§¤\'“«‹›ﬁﬂ\0–†‡·\0¶•‚„”»…‰\0¿\0`´ˆ˜¯˘˙¨\0˚¸\0˝˛ˇ—\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0Æ\0ª\0\0\0\0ŁØŒº\0\0\0\0\0æ\0\0\0ı\0\0łøœß', 0xa1);
STANDARD[0x27] = '’';
STANDARD[0x60] = '‘';
const MAC_ROMAN = encodingTable('ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄¤‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔ\0ÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ', 0x80);
const ENCODINGS = new Map([['WinAnsiEncoding', WIN_ANSI], ['StandardEncoding', STANDARD], ['MacRomanEncoding', MAC_ROMAN]]);

// Glyph name -> text. The WinAnsi names below cover most Latin text, and
// accented letters ("Eacute", "scaron") are composed in glyphText().
const GLYPHS = new Map(Object.entries({
  fi: 'fi', fl: 'fl', ff: 'ff', ffi: 'ffi', ffl: 'ffl', AE: 'Æ', ae: 'æ', OE: 'Œ', oe: 'œ', Eth: 'Ð', eth: 'ð',
  Oslash: 'Ø', oslash: 'ø', Thorn: 'Þ', thorn: 'þ', germandbls: 'ß', dotlessi: 'ı', Lslash: 'Ł', lslash: 'ł',
  multiply: '×', divide: '÷', minus: '−', fraction: '⁄', breve: '˘', dotaccent: '˙', ring: '˚', hungarumlaut: '˝',
  ogonek: '˛', caron: 'ˇ', nonbreakingspace: ' ', figuredash: '‒', Delta: '∆', Omega: 'Ω', pi: 'π', notequal: '≠',
  infinity: '∞', lessequal: '≤', greaterequal: '≥', partialdiff: '∂', summation: '∑', product: '∏', integral: '∫',
  radical: '√', approxequal: '≈', lozenge: '◊', arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓',
  arrowboth: '↔', checkmark: '✓',
}));
for (const [start, names] of [
  [0x20, 'space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at'],
  [0x5b, 'bracketleft backslash bracketright asciicircum underscore grave'],
  [0x7b, 'braceleft bar braceright asciitilde'],
  [0x80, 'Euro bullet quotesinglbase florin quotedblbase ellipsis dagger daggerdbl circumflex perthousand Scaron guilsinglleft OE bullet Zcaron bullet bullet quoteleft quoteright quotedblleft quotedblright bullet endash emdash tilde trademark scaron guilsinglright oe bullet zcaron Ydieresis'],
  [0xa0, 'nbspace exclamdown cent sterling currency yen brokenbar section dieresis copyright ordfeminine guillemotleft logicalnot sfthyphen registered macron degree plusminus twosuperior threesuperior acute mu paragraph periodcentered cedilla onesuperior ordmasculine guillemotright onequarter onehalf threequarters questiondown'],
]) {
  names.split(' ').forEach((name, i) => GLYPHS.set(name, WIN_ANSI[start + i]));
}
// Combining marks (U+0300...) for accent names.
const ACCENTS = new Map(Object.entries({
  grave: 0x300, acute: 0x301, circumflex: 0x302, tilde: 0x303, macron: 0x304, breve: 0x306, dotaccent: 0x307,
  dieresis: 0x308, ring: 0x30a, hungarumlaut: 0x30b, caron: 0x30c, commaaccent: 0x326, cedilla: 0x327, ogonek: 0x328,
}));

function glyphText(name) {
  if (GLYPHS.has(name)) return GLYPHS.get(name);
  const base = name.split('.')[0]; // "a.sc", "one.oldstyle"
  if (base !== name) return base ? glyphText(base) : '';
  if (name.includes('_')) return name.split('_').map((part) => (part ? glyphText(part) : '')).join(''); // "f_f_i"
  if (/^[A-Za-z]$/.test(name)) return name;
  let m = /^uni((?:[0-9A-F]{4})+)$/.exec(name);
  if (m) return String.fromCharCode(...m[1].match(/.{4}/g).map((h) => parseInt(h, 16)));
  m = /^u([0-9A-F]{4,6})$/.exec(name);
  const cp = m ? parseInt(m[1], 16) : -1;
  if (m) return cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff) ? String.fromCodePoint(cp) : '';
  m = /^([A-Za-z])([a-z]+)$/.exec(name);
  return m && ACCENTS.has(m[2]) ? (m[1] + String.fromCharCode(ACCENTS.get(m[2]))).normalize('NFC') : '';
}

// Widths of ASCII 32-126, for standard fonts that come without /Widths.
const HELVETICA = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const TIMES = [250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444, 921, 722, 667, 667, 722, 611, 556, 722, 722, 333, 389, 722, 611, 889, 722, 722, 556, 722, 667, 556, 611, 722, 722, 944, 722, 722, 611, 333, 278, 333, 469, 500, 333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500, 500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541];

class Font {
  constructor() {
    this.multiByte = false; // Type0: codes of one or more bytes
    this.ranges = null; // codespace ranges, shortest first
    this.ucs2 = false; // codes are UCS-2 (predefined Uni*-UCS2/UTF16 CMaps)
    this.toUnicode = null; // code -> text from a ToUnicode CMap
    this.encoding = WIN_ANSI; // code -> text for simple fonts
    this.widths = new Map(); // code -> width in thousandths of an em
    this.missing = 0; // width of codes without an entry
    this.scale = 1; // Type3 glyph space to thousandths of an em
  }

  codeLength(bytes, i) {
    if (!this.multiByte) return 1;
    if (!this.ranges) return 2;
    const fits = ({ len, lo, hi }) => i + len <= bytes.length && lo.every((l, k) => bytes[i + k] >= l && bytes[i + k] <= hi[k]);
    return this.ranges.find(fits)?.len ?? 1;
  }

  unicode(code) {
    const mapped = this.toUnicode && this.toUnicode.get(code);
    if (mapped !== undefined && mapped !== null) return mapped;
    if (this.multiByte) return this.ucs2 ? String.fromCharCode(code) : '';
    return this.encoding[code] || '';
  }

  width(code) {
    return (this.widths.get(code) ?? this.missing) * this.scale;
  }

  // Standard 14 fonts may omit /Widths: estimate them from Helvetica or Times
  // metrics (Courier is monospaced), so that word gaps are still measured.
  useStandardWidths(baseFont) {
    const table = /Times|Serif|Roman/i.test(baseFont) ? TIMES : HELVETICA;
    const mono = /Courier|Mono/i.test(baseFont);
    this.missing = mono ? 600 : 500;
    this.encoding.forEach((text, code) => {
      const c = text.normalize('NFD').charCodeAt(0); // "é" measures like "e"
      if (c >= 32 && c < 127) this.widths.set(code, mono ? 600 : table[c - 32]);
    });
  }
}

const DEFAULT_FONT = new Font();
DEFAULT_FONT.useStandardWidths('Helvetica');

async function loadFont(doc, dict) {
  const font = new Font();
  const subtype = nameOf(await doc.get(dict, 'Subtype'));
  const toUnicode = await doc.get(dict, 'ToUnicode');
  const cmap = toUnicode instanceof Stream ? await doc.cmap(toUnicode) : null;
  const encoding = await doc.get(dict, 'Encoding');
  if (subtype === 'Type0') {
    font.multiByte = true;
    if (encoding instanceof Stream) font.ranges = (await doc.cmap(encoding))?.ranges;
    else if (/UCS2|UTF16/.test(nameOf(encoding))) font.ucs2 = true;
    else if (!nameOf(encoding).startsWith('Identity')) font.ranges = cmap?.ranges; // best guess
    if (!font.ranges?.length) font.ranges = null;
    const descendant = await doc.resolve(asArray(await doc.get(dict, 'DescendantFonts'))[0]);
    font.missing = num(await doc.get(descendant, 'DW'), 1000);
    const w = await doc.get(descendant, 'W'); // [c [w1 w2 ...]] or [cFirst cLast w]
    for (let i = 0; Array.isArray(w) && i + 1 < w.length && Number.isInteger(w[i]) && doc.tableBudget > 0; ) {
      const next = await doc.resolve(w[i + 1]);
      if (Array.isArray(next)) {
        for (let k = 0; k < next.length && doc.tableBudget-- > 0; k++) font.widths.set(w[i] + k, num(next[k], font.missing));
      } else {
        for (let c = w[i]; c <= next && c - w[i] < 65536 && doc.tableBudget-- > 0; c++) font.widths.set(c, num(w[i + 2], font.missing));
      }
      i += Array.isArray(next) ? 2 : 3;
    }
  } else {
    font.encoding = await simpleEncoding(doc, encoding, subtype === 'TrueType' ? WIN_ANSI : STANDARD);
    font.missing = num(await doc.get(await doc.get(dict, 'FontDescriptor'), 'MissingWidth'), 0);
    const first = num(await doc.get(dict, 'FirstChar'), 0);
    const widths = await doc.get(dict, 'Widths');
    if (!Array.isArray(widths)) font.useStandardWidths(nameOf(await doc.get(dict, 'BaseFont')));
    for (let i = 0; Array.isArray(widths) && i < widths.length && doc.tableBudget-- > 0; i++) font.widths.set(first + i, num(widths[i], 0));
    const matrix = await doc.get(dict, 'FontMatrix');
    if (subtype === 'Type3' && Array.isArray(matrix) && typeof matrix[0] === 'number') font.scale = matrix[0] * 1000;
  }
  if (cmap) font.toUnicode = cmap.map;
  return font;
}

async function simpleEncoding(doc, encoding, base) {
  let differences = null;
  if (encoding instanceof Map) {
    differences = await doc.resolve(encoding.get('Differences'));
    encoding = await doc.resolve(encoding.get('BaseEncoding'));
  }
  const table = (ENCODINGS.get(nameOf(encoding)) || base).slice();
  let code = 0;
  for (const item of asArray(differences)) { // [code /name /name code /name ...]
    if (Number.isInteger(item)) code = item;
    else if (item instanceof Name && code >= 0 && code < 256) table[code++] = glyphText(item.name);
  }
  return table;
}

const codeOf = (bytes) => bytes.subarray(0, 4).reduce((code, b) => code * 256 + b, 0);

// Decodes a UTF-16BE CMap destination, adding `inc` to its last code unit.
function utf16(value, inc = 0) {
  if (value instanceof Name) return glyphText(value.name);
  if (!(value instanceof Uint8Array) || !value.length) return '';
  if (value.length === 1) return String.fromCharCode(value[0] + inc);
  const units = [];
  for (let i = 0; i + 1 < value.length && units.length < 32; i += 2) units.push((value[i] << 8) | value[i + 1]);
  units[units.length - 1] += inc;
  return String.fromCharCode(...units);
}

// Reads codespace ranges and bfchar/bfrange mappings, adding at most `budget` entries.
function parseCMap(data, budget) {
  const map = new Map();
  const ranges = [];
  const lex = new Lexer(data);
  let left = Math.max(0, budget);
  const pair = () => {
    const lo = lex.next();
    const hi = lo instanceof Uint8Array ? lex.next() : null;
    return hi instanceof Uint8Array ? [lo, hi] : null;
  };
  for (let tok = lex.next(); tok !== EOF; tok = lex.next()) {
    if (isCmd(tok, 'begincodespacerange')) {
      for (let p = pair(); p; p = pair()) {
        if (p[0].length && p[0].length === p[1].length && p[0].length <= 4 && ranges.length < 64) ranges.push({ len: p[0].length, lo: [...p[0]], hi: p[1] });
      }
    } else if (isCmd(tok, 'beginbfchar')) {
      for (let src = lex.next(); src instanceof Uint8Array; src = lex.next()) {
        const dst = parseValue(lex, lex.next(), false);
        if (left-- > 0) map.set(codeOf(src), utf16(dst));
      }
    } else if (isCmd(tok, 'beginbfrange')) {
      for (let p = pair(); p; p = pair()) {
        const dst = parseValue(lex, lex.next(), false); // <start> or [<a> <b> ...]
        const start = codeOf(p[0]);
        const end = Math.min(codeOf(p[1]), start + 0xffff, Array.isArray(dst) ? start + dst.length - 1 : Infinity);
        for (let code = start; code <= end && left > 0; code++, left--) {
          map.set(code, Array.isArray(dst) ? utf16(dst[code - start]) : utf16(dst, code - start));
        }
      }
    }
  }
  ranges.sort((a, b) => a.len - b.len);
  return { map, ranges, used: Math.max(0, budget) - Math.max(0, left) };
}

// ---- Content streams ----

const mul = (m, n) => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];
const translate = (tx, ty, m) => mul([1, 0, 0, 1, tx, ty], m);

// The last `n` operands, when they are all numbers.
function nums(args, n) {
  const out = args.length < n ? [] : args.slice(args.length - n);
  return out.length && out.every((v) => typeof v === 'number') ? out : null;
}

function skipInlineImage(lex) {
  for (let tok = lex.next(); tok !== EOF && !isCmd(tok, 'ID'); tok = lex.next());
  const b = lex.bytes;
  let i = lex.pos + 1; // binary data runs to "EI" between whitespace
  while (i + 1 < b.length && !(b[i] === 0x45 && b[i + 1] === 0x49 && CHAR_CLASS[b[i - 1]] === SPACE && CHAR_CLASS[b[i + 2] ?? 32] !== 0)) i++;
  lex.pos = i + 2;
}

const LIGATURES = ['ff', 'fi', 'fl', 'ffi', 'ffl', 'st', 'st']; // U+FB00-FB06

function cleanLine(line) {
  return line
    .replace(/[\uFB00-\uFB06]/g, (c) => LIGATURES[c.charCodeAt(0) - 0xfb00])
    .replace(/[\u0000-\u0008\u000e-\u001f\u007f\uFFFD]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

class PageReader {
  constructor(doc) {
    this.doc = doc;
    this.parts = [];
    this.last = null; // where the previous text ended, in device space
    this.active = new Set(); // forms being run, to stop self-reference
  }

  async read(page) {
    const doc = this.doc;
    try {
      const streams = [];
      let size = 0;
      for (const item of asArray(await doc.get(page.dict, 'Contents'))) {
        const stream = await doc.resolve(item);
        const data = stream instanceof Stream ? await doc.decode(stream) : null;
        if (data && (size += data.length) + doc.work > MAX_CONTENT_WORK) throw new LimitError(TOO_COMPLEX);
        if (data) streams.push(data);
      }
      const state = { ctm: IDENTITY, font: null, size: 0, tc: 0, tw: 0, th: 1, tl: 0 };
      await this.run(concat(streams, 10), page.resources, state, 0);
    } catch (err) {
      // A damaged page keeps the text read before the damage.
      if (!(err instanceof PdfError) || err instanceof LimitError) throw err;
    }
    return this.parts.join('').split('\n').map(cleanLine).filter(Boolean).join('\n');
  }

  async run(data, resources, gs, depth) {
    const doc = this.doc;
    doc.work += data.length + 1024; // a fixed cost per run bounds tiny repeated forms
    if (doc.work > MAX_CONTENT_WORK) throw new LimitError(TOO_COMPLEX);
    resources = await doc.resolve(resources);
    const fonts = await doc.get(resources, 'Font');
    const xobjects = await doc.get(resources, 'XObject');
    const lex = new Lexer(data);
    const saved = [];
    let args = [];
    let tm = IDENTITY;
    let tlm = IDENTITY;
    let v;
    for (let tok = lex.next(); tok !== EOF; tok = lex.next()) {
      if (!(tok instanceof Cmd) || tok.cmd === '[' || tok.cmd === '<<') {
        if (args.length >= 32) args = args.slice(-16);
        args.push(parseValue(lex, tok, false));
        continue;
      }
      const a = args;
      const last = a[a.length - 1];
      args = [];
      switch (tok.cmd) {
        case 'q': if (saved.length < 256) saved.push({ ...gs }); break;
        case 'Q': if (saved.length) gs = saved.pop(); break;
        case 'cm': if ((v = nums(a, 6))) gs.ctm = mul(v, gs.ctm); break;
        case 'BT': tm = tlm = IDENTITY; break;
        case 'Tc': if ((v = nums(a, 1))) gs.tc = v[0]; break;
        case 'Tw': if ((v = nums(a, 1))) gs.tw = v[0]; break;
        case 'Tz': if ((v = nums(a, 1))) gs.th = v[0] / 100; break;
        case 'TL': if ((v = nums(a, 1))) gs.tl = v[0]; break;
        case 'Tf': gs.font = await this.font(fonts, a[a.length - 2]); gs.size = num(last, gs.size); break;
        case 'TD': if ((v = nums(a, 2))) gs.tl = -v[1]; // falls through
        case 'Td': if ((v = nums(a, 2))) tm = tlm = translate(v[0], v[1], tlm); break;
        case 'Tm': if ((v = nums(a, 6))) tm = tlm = v; break;
        case 'T*': tm = tlm = translate(0, -gs.tl, tlm); break;
        case 'Tj': tm = this.show(last, tm, gs); break;
        case '"': if ((v = nums(a.slice(0, -1), 2))) [gs.tw, gs.tc] = v; // falls through
        case "'": tm = this.show(last, (tlm = translate(0, -gs.tl, tlm)), gs); break;
        case 'TJ': tm = this.showArray(last, tm, gs); break;
        case 'Do': await this.form(last, xobjects, resources, gs, depth); break;
        case 'BI': skipInlineImage(lex); break;
      }
    }
  }

  async font(fonts, name) {
    const doc = this.doc;
    const dict = name instanceof Name && fonts instanceof Map ? await doc.resolve(fonts.get(name.name)) : null;
    if (!(dict instanceof Map)) return null;
    if (!doc.fonts.has(dict)) doc.fonts.set(dict, await loadFont(doc, dict));
    return doc.fonts.get(dict);
  }

  async form(name, xobjects, resources, gs, depth) {
    const doc = this.doc;
    if (!(name instanceof Name) || !(xobjects instanceof Map) || depth >= MAX_FORM_DEPTH) return;
    const xobj = await doc.resolve(xobjects.get(name.name));
    if (!(xobj instanceof Stream) || this.active.has(xobj) || !isName(await doc.get(xobj, 'Subtype'), 'Form')) return;
    const data = await doc.decode(xobj);
    const matrix = nums(asArray(await doc.get(xobj, 'Matrix')), 6);
    if (!data) return;
    this.active.add(xobj);
    try {
      const inner = { ...gs, ctm: matrix ? mul(matrix, gs.ctm) : gs.ctm };
      await this.run(data, (await doc.get(xobj, 'Resources')) || resources, inner, depth + 1);
    } finally {
      this.active.delete(xobj);
    }
  }

  // Appends one string operand and returns the text matrix advanced past it.
  // `spaced` comes from TJ kerning; otherwise positions decide the separator.
  show(str, tm, gs, spaced) {
    if (!(str instanceof Uint8Array) || !str.length) return tm;
    const font = gs.font || DEFAULT_FONT;
    const start = mul(tm, gs.ctm);
    const height = Math.abs(gs.size) * Math.hypot(start[2], start[3]);
    if (spaced === undefined) this.separate(start, height);
    else if (spaced) this.parts.push(' ');
    let text = '';
    let advance = 0;
    for (let i = 0; i < str.length; ) {
      const len = font.codeLength(str, i);
      let code = 0;
      for (let k = 0; k < len; k++) code = code * 256 + (str[i + k] || 0);
      i += len;
      text += font.unicode(code);
      advance += (font.width(code) / 1000) * gs.size + gs.tc + (len === 1 && code === 32 ? gs.tw : 0);
    }
    this.parts.push(text);
    if ((this.doc.text += text.length) > MAX_TEXT) throw new LimitError(TOO_COMPLEX);
    const next = translate(advance * gs.th, 0, tm);
    const end = mul(next, gs.ctm);
    this.last = { x: end[4], y: end[5], height };
    return next;
  }

  showArray(arr, tm, gs) {
    let kern = 0;
    let first = true;
    for (const item of asArray(arr)) {
      if (typeof item === 'number') {
        tm = translate((-item / 1000) * gs.size * gs.th, 0, tm);
        kern += item;
      } else if (item instanceof Uint8Array && item.length) {
        tm = this.show(item, tm, gs, first ? undefined : kern < -KERN_SPACE);
        first = false;
        kern = 0;
      }
    }
    return tm;
  }

  // Starts a new line when text moves off the previous baseline, or a new
  // word when it jumps along it.
  separate(m, height) {
    if (!this.last) return;
    const scale = Math.hypot(m[0], m[1]) || 1;
    const [ux, uy] = [m[0] / scale, m[1] / scale]; // text direction
    const [dx, dy] = [m[4] - this.last.x, m[5] - this.last.y];
    const along = dx * ux + dy * uy;
    const lineHeight = Math.max(height, this.last.height);
    if (Math.abs(dy * ux - dx * uy) > lineHeight * 0.5) this.parts.push('\n');
    else if (along > height * 0.15 || along < -lineHeight) this.parts.push(' ');
  }
}

// bytes: Uint8Array (or ArrayBuffer) of a PDF file. Resolves to the text:
// pages separated by "\n\n", lines by "\n", whitespace collapsed within lines.
// Rejects with a readable Error for encrypted, damaged or oversized files.
export async function pdfToText(bytes, { maxPages = 500 } = {}) {
  if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes);
  if (!(bytes instanceof Uint8Array)) throw new Error('Expected the PDF as a Uint8Array');
  const limit = Number.isFinite(maxPages) ? Math.max(0, Math.floor(maxPages)) : 500;
  try {
    const doc = new PdfDoc(bytes);
    await doc.load();
    const texts = [];
    for (const page of await doc.pages(limit)) texts.push(await new PageReader(doc).read(page));
    return texts.filter(Boolean).join('\n\n');
  } catch (err) {
    if (err instanceof PdfError) throw err;
    throw new Error(`Could not read PDF: ${err instanceof Error ? err.message : 'unknown error'}`);
  }
}
