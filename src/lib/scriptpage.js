// Spotting a downloaded page that only shows its real content once its
// scripts run (single-page apps, "your browser is not supported" notices), so
// that it is reported instead of being saved as a version, and the user is
// asked whether to read it in a hidden tab.

export const SCRIPTS_MESSAGE = 'The page needs its scripts to run to show its content';

// Placeholders that apps put in the HTML for browsers that can't run them.
// Only short texts are tested, so an article that mentions these is fine.
const PLACEHOLDER = [
  /\b(?:internet explorer|ie ?\d{1,2}|this browser|your browser|your current browser|the browser you(?:'| a)re using)\b[^.\n]{0,40}?\b(?:is|are)\s+(?:not|no longer)\s+(?:supported|compatible)/i,
  /\b(?:browser|browser version)\s+(?:is\s+)?(?:not supported|unsupported|out of date|outdated|too old)\b/i,
  /\b(?:enable|turn on|activate|allow)\s+javascript\b/i,
  /\bjavascript\s+(?:is\s+)?(?:required|disabled|turned off|must be enabled|needs to be enabled|is needed)\b/i,
  /\b(?:requires|needs)\s+javascript\b/i,
  /\b(?:please\s+)?(?:upgrade|update)\s+your\s+browser\b/i,
  /\bplease\s+(?:use|switch to|upgrade to)\s+(?:a\s+|an\s+)?(?:another|different|modern|supported|newer|the latest)\b[^.\n]{0,20}\bbrowser/i,
];
const PLACEHOLDER_MAX_CHARS = 2000;
// A page with scripts and less visible text than this is an empty shell
// ("Loading…"); so is a short page whose app mount point (#root, #app...)
// is still empty.
const EMPTY_CHARS = 12;
const SHELL_CHARS = 300;

function visible(text) {
  return String(text || '').replace(/\s+/g, '').length;
}

export function isPlaceholder(text) {
  const t = String(text || '');
  return t.length <= PLACEHOLDER_MAX_CHARS && PLACEHOLDER.some((re) => re.test(t));
}

// Whether a page downloaded without running scripts is unusable, and why:
//   'placeholder': the page says the browser isn't supported or needs JavaScript
//   'empty':       the whole page is an empty shell with scripts
//   'missing':     the selected parts aren't there and the page is an empty shell with scripts
// Returns '' when the page looks usable.
//   text:     the extracted text (the selected parts, or the whole page)
//   pageText: the whole page's text, when the selected parts weren't found
//   scripts:  how many <script> elements the page has
//   emptyRoot: the page has an empty app mount point (#root, #app...)
//   selected: the watch selects parts of the page
//   found:    those parts were found
export function scriptsNeeded({ text = '', pageText = '', scripts = 0, emptyRoot = false, selected = false, found = true }) {
  const missing = selected && !found;
  const page = missing ? pageText : text;
  if (isPlaceholder(page)) return 'placeholder';
  if (!scripts || (selected && found)) return '';
  const chars = visible(page);
  if (chars >= EMPTY_CHARS && !(emptyRoot && chars < SHELL_CHARS)) return '';
  return missing ? 'missing' : 'empty';
}

// The start of what the page said, for messages.
export function excerpt(text, max = 100) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export function scriptsError(reason, text) {
  const said = excerpt(text);
  const detail = reason === 'missing'
    ? 'the selected parts only appear once they run'
    : said ? `downloading it only gave “${said}”` : 'downloading it gave an empty page';
  const e = new Error(`${SCRIPTS_MESSAGE}: ${detail}.`);
  e.scriptsNeeded = reason;
  return e;
}
