import { changedText } from './conditions.js';
import { readNumber } from './numbers.js';
import { inWindow } from './watch.js';

// Alert wording and delivery timing (quiet hours, combined summaries).
// Pure functions; the service worker does the storage and notifications.

function oneLine(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function withoutFirstNumber(text, found) {
  return String(text || '').replace(found.raw, '#').replace(/\s+/g, ' ').trim();
}

// A short, plain description of what changed, e.g.
//   "Went down from $1,299.99 to $1,199 (−7.8%)"
//   "Went down from $1,299 to $1,199 (−7.7%), now below $1,200"
//   "Added: In stock"
// `focus` (from numberFocus) says which number the watch's rules look at and
// the limits they set, so the wording matches what the user asked for.
export function summarizeChange(oldText, newText, max = 300, focus = {}) {
  const find = focus.find || '';
  const before = readNumber(oldText, find);
  const after = readNumber(newText, find);
  // Lead with the number when it's what changed: the rules point at it, the
  // text is short (a price, a count), or nothing else changed.
  const numberStory = before && after && before.value !== after.value
    && (find || String(newText).length <= 300
      || withoutFirstNumber(oldText, before) === withoutFirstNumber(newText, after));
  if (numberStory) {
    const b = before.value;
    const a = after.value;
    const pct = b !== 0 ? ` (${a > b ? '+' : '−'}${Math.abs(((a - b) / b) * 100).toFixed(1)}%)` : '';
    const limit = (focus.limits || []).find((l) => (l.below ? a < l.n : a > l.n));
    const note = limit ? `, now ${limit.below ? 'below' : 'above'} ${limit.label}` : '';
    return oneLine(`${a > b ? 'Went up' : 'Went down'} from ${before.raw} to ${after.raw}${pct}${note}`, max);
  }
  if (!before && after && find) return oneLine(`Now ${after.raw}`, max);
  const { added, deleted } = changedText(oldText, newText);
  if (added && deleted) return oneLine(`Now: ${added} · Was: ${deleted}`, max);
  if (added) return oneLine(`Added: ${added}`, max);
  if (deleted) return oneLine(`Removed: ${deleted}`, max);
  return 'The content was rearranged.';
}

export function inQuietHours(settings, date) {
  const quiet = settings?.quietHours;
  return Boolean(quiet?.enabled) && inWindow({ window: quiet }, date);
}

// Whether a new alert should wait in the queue instead of going out now.
export function shouldHold(settings, now) {
  return inQuietHours(settings, new Date(now)) || settings?.delivery?.mode === 'digest';
}

// Whether the queued alerts should go out now.
export function readyToFlush(settings, pending, lastDigestAt, now) {
  if (!pending.length || inQuietHours(settings, new Date(now))) return false;
  if (settings?.delivery?.mode !== 'digest') return true;
  return now - (lastDigestAt || 0) >= settings.delivery.digestEveryMinutes * 60_000;
}

// Adds an alert to the queue, one entry per watch (the latest summary wins).
export function queueAlert(pending, alert, limit = 200) {
  const existing = pending.find((p) => p.id === alert.id);
  const rest = pending.filter((p) => p.id !== alert.id);
  const entry = { ...alert, count: (existing?.count || 0) + 1, since: existing?.since || alert.t };
  return [...rest, entry].slice(-limit);
}

// The notification for a batch of queued alerts.
export function digestMessage(pending) {
  const changes = pending.reduce((n, p) => n + p.count, 0);
  const title = pending.length === 1
    ? `Changed: ${pending[0].name}`
    : `${pending.length} watches changed`;
  const lines = pending
    .slice()
    .sort((a, b) => b.t - a.t)
    .map((p) => (pending.length === 1 ? p.summary : `${p.name}: ${p.summary}`))
    .map((l) => oneLine(l, 120));
  const extra = pending.length === 1 && changes > 1 ? ` (${changes} changes)` : '';
  let message = lines.join('\n');
  if (message.length > 300) message = `${message.slice(0, 299).trimEnd()}…`;
  return { title: oneLine(title + extra, 120), message };
}
