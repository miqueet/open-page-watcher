// Live mode observer. Injected only into tabs showing a page that has a watch
// with live mode on (and only when the extension has access to that site).
// It reports "something changed" at most every few seconds; the service worker
// decides whether to re-read the page.
(() => {
  if (window.__openPageWatcherLive) return;
  window.__openPageWatcherLive = true;
  const QUIET_MS = 2000;
  let timer = null;
  const observer = new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      chrome.runtime.sendMessage({ type: 'live:changed' }).catch(() => observer.disconnect());
    }, QUIET_MS);
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
})();
