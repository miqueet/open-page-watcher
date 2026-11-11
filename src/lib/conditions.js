import { diffText } from './diff.js';
import { numberIn, parseThreshold } from './numbers.js';

// Rule types. `value` says what the value input means ('text', 'number',
// 'regex' or false for none); `numeric` rules read the first number found,
// or the number a rule's optional `find` regex points at.
export const RULE_TYPES = {
  any: { label: 'Anything changed', value: false },
  contains: { label: 'Contains', value: 'text' },
  notContains: { label: "Doesn't contain", value: 'text' },
  startsWith: { label: 'Starts with', value: 'text' },
  endsWith: { label: 'Ends with', value: 'text' },
  empty: { label: 'Is empty', value: false },
  notEmpty: { label: 'Is not empty', value: false },
  lengthBelow: { label: 'Length is less than', value: 'number' },
  lengthAbove: { label: 'Length is more than', value: 'number' },
  regex: { label: 'Matches regex', value: 'regex' },
  notRegex: { label: "Doesn't match regex", value: 'regex' },
  neverSeen: { label: "Doesn't match any earlier version", value: false },
  changedLinesAbove: { label: 'Lines changed is more than', value: 'number', size: true },
  changedPctAbove: { label: 'Lines changed is more than %', value: 'number', size: true },
  numberBelow: { label: 'Number is less than', value: 'number', numeric: true },
  numberAbove: { label: 'Number is more than', value: 'number', numeric: true },
  numberCrossedBelow: { label: 'Number dropped below', value: 'number', numeric: true, compares: true },
  numberCrossedAbove: { label: 'Number rose above', value: 'number', numeric: true, compares: true },
  numberIncreased: { label: 'Number increased', value: false, numeric: true, compares: true },
  numberDecreased: { label: 'Number decreased', value: false, numeric: true, compares: true },
  numberIncreasedBy: { label: 'Number increased by more than', value: 'number', numeric: true, compares: true },
  numberDecreasedBy: { label: 'Number decreased by more than', value: 'number', numeric: true, compares: true },
  numberIncreasedPct: { label: 'Number increased by more than %', value: 'number', numeric: true, compares: true },
  numberDecreasedPct: { label: 'Number decreased by more than %', value: 'number', numeric: true, compares: true },
};

// Which text a rule looks at.
export const RULE_SOURCES = {
  text: 'New text',
  added: 'Added text',
  deleted: 'Deleted text',
  previous: 'Previous text',
};

// The first number in the text, tolerating thousands separators, decimal
// commas and currency symbols, e.g. "$1,299.99" -> 1299.99. See numbers.js.
export function firstNumber(text) {
  return numberIn(text);
}

// Runs of changed words in a modified line. A run carries on across spaces
// but stops at an unchanged word: "Price is 10 dollars today" -> "Price is
// 12 dollars now" added "12" and "now", not "12now".
function changedRuns(parts, op) {
  const runs = [];
  let run = null;
  for (const p of parts) {
    if (p.op === op) {
      run = (run ?? '') + p.value;
    } else if (p.op === 'eq') {
      if (run !== null && /^\s*$/.test(p.value)) run += p.value;
      else if (run !== null) {
        runs.push(run.trim());
        run = null;
      }
    }
  }
  if (run !== null) runs.push(run.trim());
  return runs.filter(Boolean);
}

// Added and deleted text between two versions, one fragment per line.
export function changedText(oldText, newText) {
  const added = [];
  const deleted = [];
  for (const line of diffText(oldText, newText)) {
    if (line.type === 'add') added.push(line.text);
    else if (line.type === 'del') deleted.push(line.text);
    else if (line.type === 'mod') {
      added.push(...changedRuns(line.parts, 'add'));
      deleted.push(...changedRuns(line.parts, 'del'));
    }
  }
  return { added: added.filter(Boolean).join('\n'), deleted: deleted.filter(Boolean).join('\n') };
}

// How big a change is: lines added, removed or edited, and that count as a
// percentage of the longer version's lines.
export function changeSize(oldText, newText) {
  let changed = 0;
  for (const line of diffText(oldText, newText)) if (line.type !== 'eq') changed++;
  const lines = Math.max(oldText ? oldText.split('\n').length : 0, newText ? newText.split('\n').length : 0, 1);
  return { lines: changed, pct: (changed / lines) * 100 };
}

// Converts the v0.1 single condition ({ type, value }) into the rule-list form.
export function normalizeCondition(condition) {
  if (condition && Array.isArray(condition.rules)) {
    return {
      match: condition.match === 'any' ? 'any' : 'all',
      rules: condition.rules
        .filter((r) => r && RULE_TYPES[r.type])
        .slice(0, 20)
        .map((r) => {
          const rule = {
            type: r.type,
            value: typeof r.value === 'string' ? r.value.slice(0, 2000) : '',
            on: RULE_SOURCES[r.on] ? r.on : 'text',
          };
          if (RULE_TYPES[r.type].numeric && typeof r.find === 'string' && r.find.trim()) rule.find = r.find.slice(0, 500);
          return rule;
        }),
    };
  }
  const type = condition?.type;
  if (type === 'addedContains') {
    return { match: 'all', rules: [{ type: 'contains', value: String(condition.value ?? ''), on: 'added' }] };
  }
  if (type && RULE_TYPES[type] && type !== 'any') {
    return { match: 'all', rules: [{ type, value: String(condition.value ?? ''), on: 'text' }] };
  }
  return { match: 'all', rules: [] };
}

// A rule's number value. Empty counts as 0, as it always has.
function limitOf(value) {
  return String(value ?? '').trim() === '' ? 0 : parseThreshold(value);
}

function ruleMet(rule, ctx) {
  const lower = (s) => s.toLowerCase();
  const value = rule.value ?? '';
  const text = rule.on === 'added' ? ctx.added()
    : rule.on === 'deleted' ? ctx.deleted()
      : rule.on === 'previous' ? ctx.oldText
        : ctx.newText;
  switch (rule.type) {
    case 'any': return true;
    case 'contains': return lower(text).includes(lower(value));
    case 'notContains': return !lower(text).includes(lower(value));
    case 'startsWith': return lower(text.trim()).startsWith(lower(value));
    case 'endsWith': return lower(text.trim()).endsWith(lower(value));
    case 'empty': return text.trim() === '';
    case 'notEmpty': return text.trim() !== '';
    case 'lengthBelow': return text.length < limitOf(value);
    case 'lengthAbove': return text.length > limitOf(value);
    case 'regex':
    case 'notRegex': {
      let re;
      try {
        re = new RegExp(value, 'im');
      } catch {
        return false;
      }
      return re.test(text) === (rule.type === 'regex');
    }
    case 'neverSeen': return !ctx.earlierTexts.includes(ctx.newText);
    case 'changedLinesAbove': return ctx.size().lines > limitOf(value);
    case 'changedPctAbove': return ctx.size().pct > limitOf(value);
    default: break;
  }

  // "Number is less/more than" reads the number in the chosen text. The
  // other number rules compare the previous version's number with the new
  // version's. The value can be typed as "1200", "$1,200" or "1200 dollars".
  const n = limitOf(value);
  const find = rule.find || '';
  if (rule.type === 'numberBelow' || rule.type === 'numberAbove') {
    const x = numberIn(text, find);
    if (x === null || Number.isNaN(n)) return false;
    return rule.type === 'numberBelow' ? x < n : x > n;
  }
  const before = numberIn(ctx.oldText, find);
  const after = numberIn(ctx.newText, find);
  if (after === null) return false;
  // Crossing a limit: alerts once when the number goes past it, not on
  // every change while it stays there. A number that just appeared counts.
  if (rule.type === 'numberCrossedBelow') return !Number.isNaN(n) && after < n && (before === null || before >= n);
  if (rule.type === 'numberCrossedAbove') return !Number.isNaN(n) && after > n && (before === null || before <= n);
  if (before === null) return false;
  switch (rule.type) {
    case 'numberIncreased': return after > before;
    case 'numberDecreased': return after < before;
    case 'numberIncreasedBy': return after - before > n;
    case 'numberDecreasedBy': return before - after > n;
    case 'numberIncreasedPct': return before !== 0 && ((after - before) / Math.abs(before)) * 100 > n;
    case 'numberDecreasedPct': return before !== 0 && ((before - after) / Math.abs(before)) * 100 > n;
    default: return false;
  }
}

// What a watch's number rules point at, for alert wording and the chart:
// the `find` regex of the first number rule that has one, and the limits
// ("below $1,200") its rules set.
export function numberFocus(condition) {
  const rules = normalizeCondition(condition).rules.filter((r) => RULE_TYPES[r.type]?.numeric);
  const limits = [];
  for (const r of rules) {
    const n = parseThreshold(r.value);
    if (Number.isNaN(n)) continue;
    if (r.type === 'numberBelow' || r.type === 'numberCrossedBelow') limits.push({ below: true, n, label: r.value.trim() });
    if (r.type === 'numberAbove' || r.type === 'numberCrossedAbove') limits.push({ below: false, n, label: r.value.trim() });
  }
  return { find: rules.find((r) => r.find)?.find || '', limits, numeric: rules.length > 0 };
}

// Decides whether a detected change should alert the user.
// earlierTexts: all stored versions before the new one (for 'neverSeen').
export function conditionMet(condition, oldText, newText, earlierTexts = [oldText]) {
  const { match, rules } = normalizeCondition(condition);
  if (rules.length === 0) return true;
  let diff;
  let size;
  const ctx = {
    size: () => (size ||= changeSize(oldText, newText)),
    oldText,
    newText,
    earlierTexts,
    added: () => (diff ||= changedText(oldText, newText)).added,
    deleted: () => (diff ||= changedText(oldText, newText)).deleted,
  };
  return match === 'any' ? rules.some((r) => ruleMet(r, ctx)) : rules.every((r) => ruleMet(r, ctx));
}
