'use client';

let sharedAudio: HTMLAudioElement | null = null;
let mp3Failed = false;

/**
 * Bright multi-tone alert. Prefers /sounds/new-order.mp3, falls back to a
 * synthesized 3-tone chime so we don't depend on a binary asset shipping.
 */
export function playNewOrderSound() {
  if (typeof window === 'undefined') return;
  if (!mp3Failed) {
    try {
      if (!sharedAudio) {
        sharedAudio = new Audio('/sounds/new-order.mp3');
        sharedAudio.preload = 'auto';
        sharedAudio.addEventListener('error', () => {
          mp3Failed = true;
        });
      }
      sharedAudio.currentTime = 0;
      const played = sharedAudio.play();
      if (played && typeof played.catch === 'function') {
        void played.catch(() => playSynthChime());
      }
      return;
    } catch {
      mp3Failed = true;
    }
  }
  playSynthChime();
}

let sharedCtx: AudioContext | null = null;

function playSynthChime() {
  try {
    const Ctx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!sharedCtx) sharedCtx = new Ctx();
    if (sharedCtx.state === 'suspended') void sharedCtx.resume().catch(() => {});
    const ctx = sharedCtx;
    const now = ctx.currentTime;
    [880, 1175, 1568].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.16;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.32, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.6);
    });
  } catch {
    /* nothing else we can do without a user gesture / audio ctx */
  }
}
