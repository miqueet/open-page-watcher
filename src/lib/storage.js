// All persistent state lives in chrome.storage.local.
//   watches            -> { [id]: watch }
//   history:<id>       -> [{ t, text }] oldest first
//   settings           -> { soundVolume }
//
// Writes are serialized so concurrent checks can't overwrite each other.

let queue = Promise.resolve();

export function serialize(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

export async function getWatches() {
  const { watches } = await chrome.storage.local.get('watches');
  return watches || {};
}

export async function getWatch(id) {
  return (await getWatches())[id] || null;
}

export function updateWatches(mutator) {
  return serialize(async () => {
    const watches = await getWatches();
    const result = await mutator(watches);
    await chrome.storage.local.set({ watches });
    return result;
  });
}

export async function getHistory(id) {
  const key = `history:${id}`;
  return (await chrome.storage.local.get(key))[key] || [];
}

export function appendHistory(id, entry, limit) {
  return serialize(async () => {
    const key = `history:${id}`;
    const history = (await chrome.storage.local.get(key))[key] || [];
    history.push(entry);
    while (history.length > limit) history.shift();
    await chrome.storage.local.set({ [key]: history });
    return history;
  });
}

export function deleteHistory(id) {
  return serialize(() => chrome.storage.local.remove(`history:${id}`));
}
