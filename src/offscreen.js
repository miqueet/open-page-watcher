import { extractText } from './lib/extract.js';

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
      const doc = parser.parseFromString(String(message.html), message.mime === 'application/xml' ? 'application/xml' : 'text/html');
      sendResponse(extractText(message.spec, doc));
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
    return false;
  }
  if (message.type === 'beep') {
    beep().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  return false;
});

async function beep() {
  const ctx = new AudioContext();
  const notes = [880, 1175];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + i * 0.18;
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.17);
  });
  await new Promise((r) => setTimeout(r, 450));
  await ctx.close();
}
