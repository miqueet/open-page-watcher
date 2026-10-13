#!/usr/bin/env python3
"""Regenerates the PDF fixtures used by test/pdf.test.js.

Needs reportlab, pypdf and poppler's pdftotext (for the expected .txt files).
Run from the repository root:

    python3 test/fixtures/make-pdf-fixtures.py
"""
import io
import os
import subprocess
import zlib

from pypdf import PdfReader
from pypdf.generic import StreamObject
from reportlab.lib import pdfencrypt
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
SIZE = (420, 595)


def path(name):
    return os.path.join(HERE, name)


def standard(out):
    """Three pages in the standard 14 fonts (WinAnsiEncoding, no /Widths)."""
    c = canvas.Canvas(out, pagesize=SIZE, invariant=1)
    c.setFont('Helvetica-Bold', 18)
    c.drawString(40, 540, 'Quarterly Report')
    t = c.beginText(40, 510)
    t.setFont('Helvetica', 11)
    for line in [
        'The quick brown fox jumps over the lazy dog.',
        'Prices rose 4.5% in the third quarter (see table).',
        'Second paragraph line with punctuation: a, b; c!',
    ]:
        t.textLine(line)
    c.drawText(t)
    c.setFont('Times-Roman', 12)
    c.drawString(40, 440, 'Café, naïve façade — “quoted” • €5 ‘single’')
    c.setFont('Courier-Bold', 10)
    c.drawString(40, 420, 'code: x = 42; y = x * 2')
    c.showPage()
    c.setFont('Helvetica', 12)
    c.drawString(40, 540, 'Table')
    for i, (name, value) in enumerate([('Apples', '3'), ('Bananas', '12'), ('Cherries', '7')]):
        c.drawString(40, 510 - 20 * i, name)
        c.drawString(200, 510 - 20 * i, value)
    c.showPage()
    c.setFont('Times-Italic', 14)
    c.drawString(40, 540, 'Page three ends here.')
    c.save()


def truetype(out):
    """An embedded TrueType subset with a ToUnicode CMap."""
    pdfmetrics.registerFont(TTFont('DejaVu', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
    c = canvas.Canvas(out, pagesize=SIZE, invariant=1)
    c.setFont('DejaVu', 14)
    for i, line in enumerate([
        'Grüße aus Köln',
        'Ελληνικά κείμενο',
        'Русский текст',
        'Symbols ✓ → ∞ ≠ €',
    ]):
        c.drawString(40, 540 - 24 * i, line)
    c.save()


def encrypted(out):
    """Encrypted with an empty user password."""
    enc = pdfencrypt.StandardEncryption('', ownerPassword='owner', canPrint=1)
    c = canvas.Canvas(out, pagesize=SIZE, invariant=1, encrypt=enc)
    c.setFont('Helvetica', 12)
    c.drawString(40, 540, 'Secret text')
    c.save()


def object_streams(src, out):
    """Rewrites `src` with every non-stream object inside one object stream and a
    cross-reference stream using the PNG Up predictor (what qpdf and most modern
    writers produce)."""
    reader = PdfReader(src)
    nums = sorted(reader.xref[0].keys())

    def ser(obj):
        buf = io.BytesIO()
        obj.write_to_stream(buf)
        return buf.getvalue()

    data = bytearray(b'%PDF-1.5\n%\xe2\xe3\xcf\xd3\n')
    offsets, packed, body, pairs = {}, {}, b'', []
    for n in nums:
        obj = reader.get_object(n)
        if isinstance(obj, StreamObject):
            offsets[n] = len(data)
            data += b'%d 0 obj\n' % n + ser(obj) + b'\nendobj\n'
        else:
            packed[n] = len(pairs)
            pairs.append(b'%d %d' % (n, len(body)))
            body += ser(obj) + b'\n'
    stm = max(nums) + 1
    xref = stm + 1
    head = b' '.join(pairs) + b'\n'
    compressed = zlib.compress(head + body)
    offsets[stm] = len(data)
    data += (b'%d 0 obj\n<< /Type /ObjStm /N %d /First %d /Filter /FlateDecode /Length %d >>\nstream\n'
             % (stm, len(pairs), len(head), len(compressed)) + compressed + b'\nendstream\nendobj\n')
    offsets[xref] = len(data)
    rows, prev = b'', bytes(6)
    for i in range(xref + 1):
        if i in offsets:
            row = bytes([1]) + offsets[i].to_bytes(3, 'big') + bytes(2)
        elif i in packed:
            row = bytes([2]) + stm.to_bytes(3, 'big') + packed[i].to_bytes(2, 'big')
        else:
            row = bytes([0, 0, 0, 0, 0xff, 0xff] if i == 0 else 6)
        rows += bytes([2]) + bytes((a - b) & 0xff for a, b in zip(row, prev))
        prev = row
    compressed = zlib.compress(rows)
    root = reader.trailer.raw_get('/Root').idnum
    data += (b'%d 0 obj\n<< /Type /XRef /Size %d /W [1 3 2] /Root %d 0 R /Filter /FlateDecode '
             b'/DecodeParms << /Predictor 12 /Columns 6 >> /Length %d >>\nstream\n'
             % (xref, xref + 1, root, len(compressed)) + compressed
             + b'\nendstream\nendobj\nstartxref\n%d\n%%%%EOF\n' % offsets[xref])
    with open(out, 'wb') as f:
        f.write(data)


def expected_text(pdf):
    subprocess.run(['pdftotext', '-enc', 'UTF-8', pdf, pdf[:-4] + '.txt'], check=True)


if __name__ == '__main__':
    standard(path('standard.pdf'))
    truetype(path('truetype.pdf'))
    encrypted(path('encrypted.pdf'))
    tmp = path('objstm-source.pdf')
    c = canvas.Canvas(tmp, pagesize=SIZE, invariant=1)
    c.setFont('Helvetica', 12)
    for page in range(1, 3):
        c.drawString(40, 540, 'Object streams page %d' % page)
        c.drawString(40, 520, 'Cross-reference stream with PNG predictor')
        c.showPage()
    c.save()
    object_streams(tmp, path('objstm.pdf'))
    os.remove(tmp)
    for name in ('standard', 'truetype', 'objstm'):
        expected_text(path(name + '.pdf'))
