// Reading numbers out of page text: prices, counts, scores.
//
//   readNumber('Now $1,299.99!')           -> { value: 1299.99, raw: '$1,299.99' }
//   readNumber('Prix : 1.299,00 €')        -> { value: 1299, raw: '1.299,00' }
//   readNumber('12,50 €')                  -> { value: 12.5, raw: '12,50' }
//   readNumber('1.2K followers')           -> { value: 1200, raw: '1.2K' }
//   readNumber('Stock: 4 · Price: $99', 'Price:\\s*(\\S+)') -> { value: 99, raw: '$99' }
//
// Pure functions, no page access.

// A number with an optional currency symbol, sign, separators and a K/M/B
// suffix. A sign only counts when it isn't glued to a word or another number
// ("A-5", "2026-11-11" don't make -5 or -11).
const NUMBER = /(?:(?<![\p{L}\d])[-−])?(?:[$€£¥₹]\s?[-−]?)?\d(?:[\d,.]*\d)?(?:(?:bn|[kKMB])(?![\p{L}]))?/u;

const SUFFIX = { k: 1e3, K: 1e3, M: 1e6, B: 1e9, bn: 1e9 };

// The digits of one number, with its separators, as a plain JS number.
//   "1,299.99" and "1.299,99" -> 1299.99, "12,50" -> 12.5, "1,299" -> 1299,
//   "1.299.000" -> 1299000, "1.2.3" (a version) -> 1.2
function digitsValue(d) {
  const lastComma = d.lastIndexOf(',');
  const lastDot = d.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // Both: whichever comes last is the decimal point.
    return lastComma > lastDot
      ? Number(d.replace(/\./g, '').replace(',', '.'))
      : Number(d.replace(/,/g, ''));
  }
  if (lastComma >= 0) {
    const groups = d.split(',');
    // One comma not followed by exactly three digits is a decimal comma.
    if (groups.length === 2 && groups[1].length !== 3) return Number(`${groups[0]}.${groups[1]}`);
    return Number(d.replace(/,/g, ''));
  }
  if (lastDot >= 0) {
    const groups = d.split('.');
    if (groups.length > 2) {
      return groups.slice(1).every((g) => g.length === 3)
        ? Number(groups.join(''))
        : Number(`${groups[0]}.${groups[1]}`);
    }
  }
  return Number(d);
}

function parseToken(raw) {
  const negative = /^[-−]|[$€£¥₹]\s?[-−]/.test(raw);
  const suffix = /(bn|[kKMB])$/.exec(raw)?.[1];
  const digits = /\d(?:[\d,.]*\d)?/.exec(raw)[0];
  let value = digitsValue(digits);
  if (suffix) value *= SUFFIX[suffix];
  if (negative) value = -value;
  return Number.isFinite(value) ? value : null;
}

// The first number in `text`, or null.
// `find` is an optional regular expression saying where the number is: the
// first capture group (or the whole match if it has none) is read. It lets a
// rule pick "the price", not just the first number on the page.
export function readNumber(text, find = '') {
  let source = String(text ?? '');
  // A currency sign just outside the regex's group, as in "\$(\S+)", is
  // still shown in alerts: "$1,199", not "1,199".
  let currency = '';
  if (find) {
    let re;
    try {
      re = new RegExp(find, 'im');
    } catch {
      return null;
    }
    const m = re.exec(source);
    if (!m) return null;
    if (m[1] != null) {
      const at = m.index + m[0].indexOf(m[1]);
      currency = /[$€£¥₹]\s?$/.exec(source.slice(Math.max(0, at - 2), at))?.[0] || '';
    }
    source = m[1] ?? m[0];
  }
  const match = NUMBER.exec(source);
  if (!match) return null;
  const value = parseToken(match[0]);
  if (value === null) return null;
  const raw = match[0].trim();
  return { value, raw: currency && !/[$€£¥₹]/.test(raw) ? `${currency.trim()}${raw}` : raw };
}

// Just the value, or null.
export function numberIn(text, find = '') {
  return readNumber(text, find)?.value ?? null;
}

// A number the user typed as a rule's value: "1200", "$1,200",
// "1200 dollars", "1.2k". NaN when there's no number in it.
export function parseThreshold(value) {
  return readNumber(value)?.value ?? NaN;
}
