import { call, getWatches, requestAccess, timeAgo, el } from './api.js';
import { isHttpUrl } from '../lib/watch.js';
import { getPolicy, checkSiteAllowed } from '../lib/policy.js';

const inboxUrl = (hash = '') => chrome.runtime.getURL(`src/ui/inbox.html${hash}`);
const $ = (id) => document.getElementById(id);

function openInbox(hash) {
  chrome.tabs.create({ url: inboxUrl(hash) });
  window.close();
}

function showError(e) {
  $('page-error').hidden = false;
  $('page-error').textContent = e?.message || String(e);
}

async function init() {
  $('open-inbox').addEventListener('click', () => openInbox());
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';
  $('page-title').textContent = tab?.title || 'This tab';
  $('page-url').textContent = url;

  const watches = await getWatches();
  if (!isHttpUrl(url)) {
    $('page-status').textContent = 'Only http and https pages can be watched.';
    $('watch-page').disabled = true;
    $('pick-parts').disabled = true;
  } else {
    const existing = watches.filter((w) => w.url === url);
    if (existing.length) {
      $('page-status').textContent = `You already have ${existing.length} watch${existing.length > 1 ? 'es' : ''} on this page.`;
    }
  }

  // Watch is created first, then access is requested, so that if the popup
  // closes while Chrome shows the permission prompt the watch still exists and
  // the inbox can ask again.
  $('watch-page').addEventListener('click', async () => {
    try {
      const { id } = await call('createWatch', { watch: { url, name: tab.title || '' } });
      const granted = await requestAccess([url]);
      if (granted) await call('checkNow', { id }).catch(() => {});
      openInbox(`#/w/${id}`);
    } catch (e) {
      showError(e);
    }
  });

  $('pick-parts').addEventListener('click', async () => {
    try {
      checkSiteAllowed(await getPolicy(), url);
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/picker.js'] });
      await requestAccess([url]);
      window.close();
    } catch (e) {
      showError(e);
    }
  });

  const unread = watches.filter((w) => w.unread).sort((a, b) => b.lastChangedAt - a.lastChangedAt);
  $('recent-empty').hidden = unread.length > 0;
  $('recent').replaceChildren(...unread.slice(0, 8).map((w) => el('li', {},
    el('button', { onclick: () => openInbox(`#/w/${w.id}`) },
      el('span', { class: 'dot' }),
      el('span', { class: 'name' }, w.name),
      el('span', { class: 'muted' }, timeAgo(w.lastChangedAt))))));
}

init().catch(showError);
