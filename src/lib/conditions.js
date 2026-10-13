import { addedText } from './diff.js';

export const CONDITION_TYPES = {
  any: { label: 'Any change', needsValue: false },
  contains: { label: 'New text contains', needsValue: true },
  notContains: { label: "New text doesn't contain", needsValue: true },
  addedContains: { label: 'Added text contains', needsValue: true },
  regex: { label: 'New text matches regex', needsValue: true },
  numberBelow: { label: 'Number drops below', needsValue: true },
  numberAbove: { label: 'Number rises above', needsValue: true },
  numberDecreased: { label: 'Number decreased', needsValue: false },
  numberIncreased: { label: 'Number increased', needsValue: false },
};

// Finds the first number in the text, tolerating thousands separators and
// currency symbols, e.g. "$1,299.99" -> 1299.99.
export function firstNumber(text) {
  const match = /-?\d[\d,]*(?:\.\d+)?/.exec(text || '');
  if (!match) return null;
  const n = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Decides whether a detected change should alert the user.
export function conditionMet(condition, oldText, newText) {
  const type = condition?.type || 'any';
  const value = condition?.value ?? '';
  const lower = (s) => s.toLowerCase();
  switch (type) {
    case 'any':
      return true;
    case 'contains':
      return lower(newText).includes(lower(value));
    case 'notContains':
      return !lower(newText).includes(lower(value));
    case 'addedContains':
      return lower(addedText(oldText, newText)).includes(lower(value));
    case 'regex':
      try {
        return new RegExp(value, 'i').test(newText);
      } catch {
        return false;
      }
    case 'numberBelow': {
      const n = firstNumber(newText);
      return n !== null && n < Number(value);
    }
    case 'numberAbove': {
      const n = firstNumber(newText);
      return n !== null && n > Number(value);
    }
    case 'numberDecreased': {
      const before = firstNumber(oldText);
      const after = firstNumber(newText);
      return before !== null && after !== null && after < before;
    }
    case 'numberIncreased': {
      const before = firstNumber(oldText);
      const after = firstNumber(newText);
      return before !== null && after !== null && after > before;
    }
    default:
      return true;
  }
}
