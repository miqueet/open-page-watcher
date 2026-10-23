import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOUNDS, DEFAULT_SOUND, playSound } from '../src/lib/sounds.js';

// Records what would be played, standing in for a real AudioContext.
function fakeContext() {
  const played = [];
  const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  return {
    played,
    currentTime: 0,
    destination: {},
    createGain: () => ({ gain: param, connect: (d) => d }),
    createOscillator() {
      const osc = { frequency: {}, connect: (g) => g, start: (t) => played.push({ type: osc.type, freq: osc.frequency.value, t }), stop() {} };
      return osc;
    },
  };
}

test('every sound is short and audible', () => {
  assert.ok(SOUNDS[DEFAULT_SOUND]);
  for (const [id, { label, notes }] of Object.entries(SOUNDS)) {
    assert.ok(label, id);
    assert.ok(notes.length > 0, id);
    for (const n of notes) {
      assert.ok(n.freq >= 200 && n.freq <= 4000, id);
      assert.ok(n.volume > 0 && n.volume <= 0.4, id);
      assert.ok(n.at + n.length <= 2, `${id} is under two seconds`);
    }
  }
});

test('plays the chosen sound, or the default for an unknown name', async () => {
  const ctx = fakeContext();
  await playSound(ctx, 'rising');
  assert.deepEqual(ctx.played.map((p) => p.freq), [523, 659, 784, 1047]);
  const other = fakeContext();
  await playSound(other, 'nope');
  assert.deepEqual(other.played.map((p) => p.freq), SOUNDS[DEFAULT_SOUND].notes.map((n) => n.freq));
});
