// Web Audio API lightweight chime generator
// Crystal-clear dual-tone frequency (800Hz -> 1200Hz) with smooth exponential decay.
// No external mp3 assets needed. Respects mute toggle in localStorage.

const CHIME_MUTED_STORAGE_KEY = 'clinic_notifications_chime_muted';

export function isChimeMuted(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(CHIME_MUTED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setChimeMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHIME_MUTED_STORAGE_KEY, muted ? 'true' : 'false');
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export function playNotificationChime(): void {
  if (typeof window === 'undefined') return;
  if (isChimeMuted()) return;

  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Create a crystal dual-bell chime: Tone 1 (880Hz, A5) + Tone 2 (1320Hz, E6)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1200, now + 0.08);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1320, now + 0.04);
    osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.12);

    // Smooth envelope: quick attack, gentle exponential decay
    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.04);

    osc1.stop(now + 0.45);
    osc2.stop(now + 0.45);

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 600);
  } catch {
    // AudioContext may be blocked by autoplay policies until a user gesture.
  }
}
