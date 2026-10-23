import { extractText } from './lib/extract.js';
import { readFeedOrSitemap } from './lib/feeds.js';
import { playSound } from './lib/sounds.js';

// DOMParser builds an inert document: scripts don't run and subresources
// (images, stylesheets, iframes) aren't loaded.
const parser = new DOMParser();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.target !== 'offscreen') return false;
  if (message.type === 'ping') {
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === 'extract') {
    try {
      const xml = message.mime === 'application/xml';
      const doc = parser.parseFromString(String(message.html), xml ? 'application/xml' : 'text/html');
      if (xml && !message.spec?.selectors?.length) {
        const feed = readFeedOrSitemap(doc);
        if (feed) {
          sendResponse({ ok: true, text: feed.text, kind: feed.kind });
          return false;
        }
      }
      sendResponse(extractText(message.spec, doc));
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
    return false;
  }
  if (message.type === 'beep') {
    beep(message.sound).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  return false;
});

async function beep(name) {
  const ctx = new AudioContext();
  await playSound(ctx, name);
  await ctx.close();
}
