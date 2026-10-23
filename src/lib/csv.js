import { firstNumber } from './conditions.js';

// One CSV cell. Cells a spreadsheet would read as a formula (starting with
// = + - @ or a tab/return) get a leading apostrophe so opening the file never
// runs anything from the watched page. Plain numbers such as -5 stay numbers.
export function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^-\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Saved versions as CSV: when, the first number in the text (handy for
// prices and counts), and the text itself.
export function historyCsv(history) {
  const rows = [['Saved at', 'First number', 'Text']];
  for (const h of history) {
    const n = firstNumber(h.text);
    rows.push([new Date(h.t).toISOString(), n === null ? '' : String(n), h.text]);
  }
  // CRLF line ends and a byte-order mark so spreadsheet apps read UTF-8 text.
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
