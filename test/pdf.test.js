import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateRawSync, deflateSync } from 'node:zlib';
import { pdfToText } from '../src/lib/pdf.js';

// Fixtures come from test/fixtures/make-pdf-fixtures.py (reportlab), with the
// matching pdftotext output saved next to each one.
const fixture = (name) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const pdftotext = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const words = (s) => s.split(/\s+/).filter(Boolean);
const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');

// Builds a PDF with a correct classic xref table. Object 1 must be the catalog.
function buildPdf(objects, { trailer = '', prefix = '' } = {}) {
  const chunks = [];
  let length = 0;
  const push = (part) => {
    const buf = Buffer.isBuffer(part) ? part : Buffer.from(part, 'latin1');
    chunks.push(buf);
    length += buf.length;
  };
  push(`${prefix}%PDF-1.4\n`);
  const offsets = objects.map((body, i) => {
    const offset = length - prefix.length;
    push(`${i + 1} 0 obj\n`);
    push(body);
    push('\nendobj\n');
    return offset;
  });
  const xref = length - prefix.length;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  push(offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join(''));
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailer} >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Uint8Array(Buffer.concat(chunks));
}

function stream(content, dict = '') {
  const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'latin1');
  return Buffer.concat([Buffer.from(`<< /Length ${data.length} ${dict} >>\nstream\n`), data, Buffer.from('\nendstream')]);
}

const HELVETICA = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

// One page: 1 catalog, 2 page tree, 3 page, 4 contents, 5 Helvetica as /F1, then `extra` from 6.
// `content` is content-stream text, or a ready stream object (a Buffer starting with "<<").
function onePage(content, { resources = '/Font << /F1 5 0 R >>', extra = [], trailer, prefix, contents = '4 0 R' } = {}) {
  return buildPdf(
    [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contents} /Resources << ${resources} >> >>`,
      Buffer.isBuffer(content) && content.subarray(0, 2).toString() === '<<' ? content : stream(content),
      HELVETICA,
      ...extra,
    ],
    { trailer, prefix },
  );
}

function ascii85(buf) {
  let out = '';
  for (let i = 0; i < buf.length; i += 4) {
    const n = Math.min(4, buf.length - i);
    const chunk = Buffer.alloc(4);
    buf.copy(chunk, 0, i, i + n);
    let v = chunk.readUInt32BE(0);
    if (v === 0 && n === 4) {
      out += 'z';
      continue;
    }
    const digits = [];
    for (let k = 0; k < 5; k++) {
      digits.unshift(String.fromCharCode(33 + (v % 85)));
      v = Math.floor(v / 85);
    }
    out += digits.slice(0, n + 1).join('');
  }
  return `${out}~>`;
}

function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Resolves to text or rejects with an Error, never anything else.
async function settle(bytes) {
  let text;
  try {
    text = await pdfToText(bytes);
  } catch (err) {
    assert.ok(err instanceof Error, `rejected with a non-Error: ${err}`);
    assert.ok(err.message.length > 0);
    return err;
  }
  assert.equal(typeof text, 'string');
  return text;
}

test('reportlab standard fonts: pages, lines and words match pdftotext', async () => {
  const text = await pdfToText(fixture('standard.pdf'));
  assert.deepEqual(words(text), words(pdftotext('standard.txt')));
  const pages = text.split('\n\n');
  assert.equal(pages.length, 3);
  assert.deepEqual(pages[0].split('\n'), [
    'Quarterly Report',
    'The quick brown fox jumps over the lazy dog.',
    'Prices rose 4.5% in the third quarter (see table).',
    'Second paragraph line with punctuation: a, b; c!',
    'Café, naïve façade — “quoted” • €5 ‘single’',
    'code: x = 42; y = x * 2',
  ]);
  // Cells on one baseline join with spaces.
  assert.equal(pages[1], 'Table\nApples 3\nBananas 12\nCherries 7');
  assert.equal(pages[2], 'Page three ends here.');
});

test('embedded TrueType subset with ToUnicode matches pdftotext', async () => {
  const text = await pdfToText(fixture('truetype.pdf'));
  assert.deepEqual(words(text), words(pdftotext('truetype.txt')));
  assert.equal(text, 'Grüße aus Köln\nΕλληνικά κείμενο\nРусский текст\nSymbols ✓ → ∞ ≠ €');
});

test('cross-reference stream with PNG predictor and object streams', async () => {
  const bytes = fixture('objstm.pdf');
  assert.ok(!latin1(bytes).includes('\nxref'), 'fixture has no classic xref table');
  const text = await pdfToText(bytes);
  assert.deepEqual(words(text), words(pdftotext('objstm.txt')));
  assert.equal(text, 'Object streams page 1\nCross-reference stream with PNG predictor\n\nObject streams page 2\nCross-reference stream with PNG predictor');
});

test('encrypted PDFs are refused with a readable error', async () => {
  await assert.rejects(pdfToText(fixture('encrypted.pdf')), { message: 'This PDF is encrypted' });
  const handMade = onePage('BT /F1 12 Tf 72 700 Td (x) Tj ET', {
    extra: ['<< /Filter /Standard /V 1 /R 2 /O <00> /U <00> /P -4 >>'],
    trailer: '/Encrypt 6 0 R',
  });
  await assert.rejects(pdfToText(handMade), { message: 'This PDF is encrypted' });
});

test('text operators: Tj, TJ kerning, Td, TD, T*, quote operators, Tm and gaps', async () => {
  const content = [
    'BT /F1 12 Tf 72 700 Td (Hello) Tj ( world) Tj',
    '0 -14 Td [(Ke) 30 (rned) -250 (wor) -50 (ds)] TJ',
    '0 -14 TD (After TD) Tj T* (After T-star) Tj',
    '(Quote op) \'',
    '2 1 (Double quote) "',
    '1 0 0 1 72 600 Tm (Gap) Tj 60 0 Td (here) Tj',
    '1 0 0 1 72 580 Tm (Tight) Tj 1 0 0 1 400 580 Tm (cell) Tj ET',
  ].join('\n');
  assert.equal(
    await pdfToText(onePage(content)),
    'Hello world\nKerned words\nAfter TD\nAfter T-star\nQuote op\nDouble quote\nGap here\nTight cell',
  );
});

test('glyph-by-glyph placement, scaling with cm and rotated text', async () => {
  // Helvetica 10pt: H = 7.22, i = 2.22 wide. "Hi" then "yo" after a gap.
  const perGlyph = 'BT /F1 10 Tf 1 0 0 1 100 500 Tm (H) Tj 1 0 0 1 107.22 500 Tm (i) Tj 1 0 0 1 115 500 Tm (y) Tj 1 0 0 1 120 500 Tm (o) Tj ET';
  assert.equal(await pdfToText(onePage(perGlyph)), 'Hi yo');
  const scaled = 'q 0.1 0 0 0.1 0 0 cm BT /F1 120 Tf 720 7000 Td (Scaled) Tj 0 -150 Td (text) Tj ET Q';
  assert.equal(await pdfToText(onePage(scaled)), 'Scaled\ntext');
  const rotated = 'q 0 1 -1 0 300 100 cm BT /F1 12 Tf 0 0 Td (Rotated) Tj 60 0 Td (text) Tj 0 -20 Td (next line) Tj ET Q';
  assert.equal(await pdfToText(onePage(rotated)), 'Rotated text\nnext line');
  // Superscripts by text rise or by a small baseline shift stay on the line.
  const rise = 'BT /F1 12 Tf 72 700 Td (E = mc) Tj 4 Ts /F1 7 Tf (2) Tj 0 Ts /F1 12 Tf ( is famous) Tj ET';
  assert.equal(await pdfToText(onePage(rise)), 'E = mc2 is famous');
  const shift = 'BT /F1 12 Tf 72 700 Td (E = mc) Tj 37.68 4 Td /F1 7 Tf (2) Tj 3.89 -4 Td /F1 12 Tf ( is famous) Tj ET';
  assert.equal(await pdfToText(onePage(shift)), 'E = mc2 is famous');
});

test('Type0 fonts: ToUnicode bfchar/bfrange (incl. arrays, ligatures), UCS-2 and mixed-width codespaces', async () => {
  const cmap = [
    '/CIDInit /ProcSet findresource begin 12 dict begin begincmap',
    '/CMapName /Test def /CMapType 2 def',
    '1 begincodespacerange <0000> <FFFF> endcodespacerange',
    '3 beginbfchar <0001> <0048> <0002> <00660069> <0003> <0020> endbfchar',
    '2 beginbfrange <0010> <0029> <0061>',
    '<0030> <0032> [<03A9> <00E9> <D83DDE00>] endbfrange',
    'endcmap CMapName currentdict /CMap defineresource pop end end',
  ].join('\n');
  const font = '<< /Type /Font /Subtype /Type0 /BaseFont /Test /Encoding /Identity-H /DescendantFonts [7 0 R] /ToUnicode 8 0 R >>';
  const cid = '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Test /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 500 /W [1 [700 600] 16 41 500] >>';
  // A predefined UCS-2 CMap needs no ToUnicode; an embedded encoding CMap mixes 1- and 2-byte codes.
  const ucs2 = '<< /Type /Font /Subtype /Type0 /BaseFont /STSong /Encoding /UniGB-UCS2-H /DescendantFonts [7 0 R] >>';
  const mixed = '<< /Type /Font /Subtype /Type0 /BaseFont /Mixed /Encoding 11 0 R /DescendantFonts [7 0 R] /ToUnicode 12 0 R >>';
  const codespace = stream('begincmap 2 begincodespacerange <00> <7F> <8000> <FFFF> endcodespacerange endcmap');
  const mixedMap = stream('2 begincodespacerange <00> <7F> <8000> <FFFF> endcodespacerange 3 beginbfchar <41> <0041> <42> <0042> <8001> <0416> endbfchar');
  const content = [
    'BT /F2 12 Tf 72 700 Td <0001001800030002001D00140003003000310032> Tj',
    '/F3 12 Tf 0 -20 Td <4F60597D> Tj',
    '/F4 12 Tf 0 -20 Td <41800142> Tj ET',
  ].join('\n');
  const pdf = onePage(content, {
    resources: '/Font << /F1 5 0 R /F2 6 0 R /F3 9 0 R /F4 10 0 R >>',
    extra: [font, cid, stream(cmap), ucs2, mixed, codespace, mixedMap],
  });
  assert.equal(await pdfToText(pdf), 'Hi fine Ωé😀\n你好\nAЖB');
});

test('simple font encodings: Differences with glyph names, Standard and MacRoman', async () => {
  const differences = '[128 /Eacute /fi /uni2014 /quotedblleft /quotedblright /T_h /zero.osf /scaron /Lslash /u1F600 /g42 /Ccaron]';
  const fonts = [
    `<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences ${differences} >> >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /StandardEncoding >>',
    '<< /Type /Font /Subtype /TrueType /BaseFont /Arial /Encoding /MacRomanEncoding /FirstChar 32 /Widths [278] >>',
  ];
  const content = [
    'BT /F2 12 Tf 72 700 Td (\\200cole \\201ne \\202 \\203x\\204 \\205e \\206 \\207 \\210 \\211 \\212 \\213) Tj',
    '/F3 12 Tf 0 -20 Td (it\\047s \\140quoted\\047 \\256) Tj',
    '/F4 12 Tf 0 -20 Td (\\216t\\216 \\245) Tj',
    '/F1 12 Tf 0 -20 Td (WinAnsi \\200 \\225 \\227 \\351) Tj ET',
  ].join('\n');
  const pdf = onePage(content, { resources: '/Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R /F4 8 0 R >>', extra: fonts });
  // StandardEncoding 0xAE is the fi ligature, which comes out as two letters.
  assert.equal(await pdfToText(pdf), 'École fine — “x” The 0 š Ł 😀 Č\nit’s ‘quoted’ fi\nété •\nWinAnsi € • — é');
});

test('Form XObjects are followed; self-reference, depth and image XObjects are bounded', async () => {
  const content = 'BT /F1 12 Tf 72 700 Td (Before form) Tj ET /X1 Do /Im Do BT /F1 12 Tf 72 500 Td (After form) Tj ET';
  const form = stream('BT /F9 12 Tf 72 700 Td (Inside form) Tj ET /Self Do /Inner Do', '/Type /XObject /Subtype /Form /BBox [0 0 612 792] /Matrix [1 0 0 1 0 -100] /Resources << /Font << /F9 5 0 R >> /XObject << /Self 6 0 R /Inner 7 0 R >> >>');
  const inner = stream('BT /F9 12 Tf 72 650 Td (Nested form) Tj ET /Self Do', '/Type /XObject /Subtype /Form /BBox [0 0 612 792]');
  const image = stream(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), '/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode');
  const pdf = onePage(content, { resources: '/Font << /F1 5 0 R >> /XObject << /X1 6 0 R /Im 8 0 R >>', extra: [form, inner, image] });
  assert.equal(await pdfToText(pdf), 'Before form\nInside form\nNested form\nAfter form');

  // A chain of 20 forms, each one drawing a line and calling the next.
  const chain = Array.from({ length: 20 }, (_, i) =>
    stream(`BT /F1 12 Tf 72 ${700 - 20 * i} Td (Level ${i + 1}) Tj ET /Next Do`, `/Subtype /Form /BBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /XObject << /Next ${i + 7} 0 R >> >>`),
  );
  const text = await pdfToText(onePage('/Next Do', { resources: '/XObject << /Next 6 0 R >>', extra: chain }));
  assert.ok(text.startsWith('Level 1\nLevel 2'));
  assert.ok(!text.includes('Level 20'));
});

test('filters: ASCIIHex, ASCII85 over Flate, raw deflate, bad checksums, unsupported filters', async () => {
  const hex = Buffer.from('BT /F1 12 Tf 72 700 Td (Hex encoded) Tj ET').toString('hex') + '>';
  const a85 = ascii85(deflateSync(Buffer.from('BT /F1 12 Tf 72 680 Td (Ascii85 over flate) Tj ET')));
  const raw = deflateRawSync(Buffer.from('BT /F1 12 Tf 72 660 Td (Raw deflate) Tj ET'));
  const badSum = deflateSync(Buffer.from('BT /F1 12 Tf 72 640 Td (Bad checksum) Tj ET'));
  badSum[badSum.length - 1] ^= 0xff;
  const pdf = onePage(stream(hex, '/Filter /ASCIIHexDecode'), {
    contents: '[4 0 R 6 0 R 7 0 R 8 0 R 9 0 R]',
    extra: [
      stream(a85, '/Filter [/ASCII85Decode /FlateDecode]'),
      stream(raw, '/Filter /FlateDecode'),
      stream(badSum, '/Filter /Fl'),
      stream('BT /F1 12 Tf 72 620 Td (LZW is skipped) Tj ET', '/Filter /LZWDecode'),
    ],
  });
  assert.equal(await pdfToText(pdf), 'Hex encoded\nAscii85 over flate\nRaw deflate\nBad checksum');
});

test('damaged files: bad startxref, missing xref, shifted offsets, wrong /Length', async () => {
  const good = onePage('BT /F1 12 Tf 72 700 Td (Still readable) Tj ET');
  const source = latin1(good);
  const variants = {
    badStartxref: source.replace(/startxref\n\d+/, 'startxref\n999999'),
    noXref: source.slice(0, source.indexOf('xref\n0 ')) + '%%EOF\n',
    shifted: latin1(onePage('BT /F1 12 Tf 72 700 Td (Still readable) Tj ET', { prefix: 'junk before the header\n' })),
    wrongLength: source.replace(/\/Length \d+/, '/Length 5'),
  };
  for (const [name, text] of Object.entries(variants)) {
    assert.equal(await pdfToText(new Uint8Array(Buffer.from(text, 'latin1'))), 'Still readable', name);
  }
});

test('incremental updates: the newest xref section wins through /Prev', async () => {
  const base = onePage('BT /F1 12 Tf 72 700 Td (Original text) Tj ET');
  const prev = Number(/startxref\n(\d+)/.exec(latin1(base))[1]);
  const object = Buffer.concat([Buffer.from('4 0 obj\n'), stream('BT /F1 12 Tf 72 700 Td (Updated text) Tj ET'), Buffer.from('\nendobj\n')]);
  const xref = base.length + object.length;
  const tail = `xref\n4 1\n${String(base.length).padStart(10, '0')} 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R /Prev ${prev} >>\nstartxref\n${xref}\n%%EOF\n`;
  const updated = new Uint8Array(Buffer.concat([base, object, Buffer.from(tail)]));
  assert.equal(await pdfToText(updated), 'Updated text');
});

test('page tree: nesting, inherited resources, cycles and maxPages', async () => {
  const pdf = buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>',
    stream('BT /F1 12 Tf 72 700 Td (Page one) Tj ET'),
    HELVETICA,
    '<< /Type /Pages /Parent 2 0 R /Kids [7 0 R 2 0 R 6 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 6 0 R /Contents [8 0 R 9 0 R] >>',
    stream('BT /F1 12 Tf 72 700 Td (Page two) Tj ET'),
    '[9 0 R]',
  ]);
  assert.equal(await pdfToText(pdf), 'Page one\n\nPage two');
  assert.equal(await pdfToText(pdf, { maxPages: 1 }), 'Page one');
  assert.equal(await pdfToText(pdf, { maxPages: 0 }), '');
  assert.equal(await pdfToText(pdf.buffer), 'Page one\n\nPage two');
});

test('inline images and reference cycles are skipped', async () => {
  const content = Buffer.concat([
    Buffer.from('BT /F1 12 Tf 72 700 Td (Before image) Tj ET\nq BI /W 4 /H 1 /BPC 8 /CS /G ID '),
    Buffer.from([0x00, 0x28, 0x54, 0x6a, 0x29, 0x20, 0x45, 0x54, 0xff]),
    Buffer.from(' EI Q\nBT /F1 12 Tf 72 680 Td (After image) Tj ET'),
  ]);
  assert.equal(await pdfToText(onePage(content)), 'Before image\nAfter image');
  // /Length points at its own object, and 6 and 7 refer to each other.
  const selfLength = onePage(Buffer.from('<< /Length 4 0 R >>\nstream\nBT /F2 12 Tf 72 700 Td (Cycles) Tj ET\nendstream'), {
    resources: '/Font << /F1 5 0 R /F2 6 0 R >>',
    extra: ['7 0 R', '6 0 R'],
  });
  assert.equal(await pdfToText(selfLength), 'Cycles');
});

test('garbage input rejects with an Error', async () => {
  const rand = random(1);
  const noise = new Uint8Array(4096).map(() => Math.floor(rand() * 256));
  await assert.rejects(pdfToText(noise), { message: 'Not a PDF file' });
  await assert.rejects(pdfToText(new Uint8Array(0)), { message: 'Not a PDF file' });
  await assert.rejects(pdfToText(new Uint8Array(Buffer.from('%PDF-1.7\n'))), Error);
  await assert.rejects(pdfToText(new Uint8Array(Buffer.concat([Buffer.from('%PDF-1.7\n'), noise]))), Error);
  await assert.rejects(pdfToText('%PDF-1.4'), Error);
  await assert.rejects(pdfToText(null), Error);
});

test('deeply nested input fails cleanly instead of overflowing the stack', async () => {
  const deepContent = 'BT /F1 12 Tf 72 700 Td (Kept) Tj ET ' + '['.repeat(200_000);
  assert.equal(await pdfToText(onePage(deepContent)), 'Kept');
  const deepCatalog = buildPdf([`<< /Type /Catalog /Pages 2 0 R /Junk ${'['.repeat(100_000)} >>`, '<< /Type /Pages /Kids [] /Count 0 >>']);
  const result = await settle(deepCatalog);
  assert.ok(result instanceof Error && /nested too deeply/.test(result.message));
});

test('decompression is capped at 50 MB in total (zip bombs)', async () => {
  const bomb = deflateSync(Buffer.alloc(12 * 1024 * 1024, 0x20), { level: 9 });
  const extra = Array.from({ length: 5 }, () => stream(bomb, '/Filter /FlateDecode'));
  const pdf = onePage('BT /F1 12 Tf 72 700 Td (x) Tj ET', { contents: '[4 0 R 6 0 R 7 0 R 8 0 R 9 0 R 10 0 R]', extra });
  assert.ok(pdf.length < 200_000);
  const started = Date.now();
  await assert.rejects(pdfToText(pdf), /more than 50 MB/);
  assert.ok(Date.now() - started < 10_000);
});

test('randomly corrupted and truncated files resolve to text or reject with an Error', async () => {
  const sources = ['standard.pdf', 'objstm.pdf', 'truetype.pdf'].map(fixture);
  const rand = random(42);
  for (let i = 0; i < 150; i++) {
    const source = sources[i % sources.length];
    const bytes = source.slice();
    for (let k = 1 + Math.floor(rand() * 8); k > 0; k--) bytes[Math.floor(rand() * bytes.length)] = Math.floor(rand() * 256);
    await settle(bytes);
    await settle(source.subarray(0, Math.floor(rand() * source.length)));
  }
});
