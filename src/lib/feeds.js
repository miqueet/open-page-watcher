// Turns RSS / Atom feeds and XML sitemaps into one line per entry, so changes
// read as "entries added / removed". Works on XML Documents from DOMParser.

const MAX_ENTRIES = 5000;

function childText(el, ...names) {
  for (const name of names) {
    for (const c of el.children) {
      if (c.localName === name) return c.textContent.replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

function atomLink(entry) {
  let fallback = '';
  for (const c of entry.children) {
    if (c.localName !== 'link') continue;
    const rel = c.getAttribute('rel') || 'alternate';
    if (rel === 'alternate') return c.getAttribute('href') || '';
    fallback ||= c.getAttribute('href') || '';
  }
  return fallback;
}

function byLocalName(doc, name) {
  return Array.from(doc.getElementsByTagNameNS('*', name)).slice(0, MAX_ENTRIES);
}

// Returns { kind: 'feed' | 'sitemap', text } or null if the document is neither.
export function readFeedOrSitemap(doc) {
  const root = doc.documentElement;
  if (!root) return null;
  const name = root.localName;

  if (name === 'rss' || name === 'RDF') {
    const lines = byLocalName(doc, 'item').map((item) => {
      const title = childText(item, 'title') || '(untitled)';
      const link = childText(item, 'link', 'guid');
      return link ? `${title} — ${link}` : title;
    });
    return { kind: 'feed', text: lines.join('\n') };
  }
  if (name === 'feed') {
    const lines = byLocalName(doc, 'entry').map((entry) => {
      const title = childText(entry, 'title') || '(untitled)';
      const link = atomLink(entry);
      return link ? `${title} — ${link}` : title;
    });
    return { kind: 'feed', text: lines.join('\n') };
  }
  if (name === 'urlset' || name === 'sitemapindex') {
    const lines = byLocalName(doc, 'loc').map((loc) => loc.textContent.trim()).filter(Boolean);
    return { kind: 'sitemap', text: lines.join('\n') };
  }
  return null;
}
