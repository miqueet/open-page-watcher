// Alert sounds, made on the fly with Web Audio. Nothing is downloaded: each
// sound is a short list of notes played by an oscillator.

const note = (freq, at, length, wave = 'sine', volume = 0.3) => ({ freq, at, length, wave, volume });

export const SOUNDS = {
  chime: { label: 'Chime', notes: [note(880, 0, 0.16), note(1175, 0.18, 0.16)] },
  bell: { label: 'Bell', notes: [note(1320, 0, 1.2, 'sine', 0.25), note(2640, 0, 0.6, 'sine', 0.08)] },
  doorbell: { label: 'Doorbell', notes: [note(659, 0, 0.45, 'triangle', 0.35), note(523, 0.42, 0.7, 'triangle', 0.35)] },
  beeps: { label: 'Three beeps', notes: [0, 0.16, 0.32].map((at) => note(1000, at, 0.09, 'square', 0.08)) },
  rising: { label: 'Rising', notes: [523, 659, 784, 1047].map((f, i) => note(f, i * 0.11, 0.2, 'triangle', 0.3)) },
  alarm: { label: 'Alarm', notes: [0, 1, 2, 3, 4, 5].map((i) => note(i % 2 ? 660 : 880, i * 0.2, 0.18, 'sawtooth', 0.08)) },
};

export const DEFAULT_SOUND = 'chime';

export function soundName(name) {
  return Object.hasOwn(SOUNDS, name) ? name : DEFAULT_SOUND;
}

// Plays a sound on an AudioContext and resolves once it has finished.
export function playSound(ctx, name) {
  const { notes } = SOUNDS[soundName(name)];
  let end = 0;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + n.at;
    osc.type = n.wave;
    osc.frequency.value = n.freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(n.volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + n.length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + n.length + 0.01);
    end = Math.max(end, n.at + n.length);
  }
  return new Promise((r) => setTimeout(r, end * 1000 + 100));
}
