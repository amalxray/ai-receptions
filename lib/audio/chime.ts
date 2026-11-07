// A quiet, four-second notification chime synthesized with the Web Audio API.
// No external audio asset is needed; the mute preference remains in localStorage.

const CHIME_MUTED_STORAGE_KEY = 'clinic_notifications_chime_muted';
const CHIME_DURATION_SECONDS = 4;
const NOTE_INTERVAL_SECONDS = 0.76;
const NOTE_DURATION_SECONDS = 0.9;
const MELODY = [659.25, 783.99, 987.77, 783.99, 659.25];

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

  let context: AudioContext | null = null;
  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    context = audioContext;
    const now = audioContext.currentTime;

    MELODY.forEach((frequency, index) => {
      const start = now + index * NOTE_INTERVAL_SECONDS;
      const fundamental = audioContext.createOscillator();
      const overtone = audioContext.createOscillator();
      const gain = audioContext.createGain();

      fundamental.type = 'sine';
      fundamental.frequency.setValueAtTime(frequency, start);
      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(frequency * 2, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.035, start + 0.06);
      gain.gain.setValueAtTime(0.02, start + 0.3);
      gain.gain.setValueAtTime(0.012, start + NOTE_DURATION_SECONDS - 0.12);
      gain.gain.linearRampToValueAtTime(0.001, start + NOTE_DURATION_SECONDS);

      fundamental.connect(gain);
      overtone.connect(gain);
      gain.connect(audioContext.destination);

      fundamental.start(start);
      overtone.start(start);
      fundamental.stop(start + NOTE_DURATION_SECONDS);
      overtone.stop(start + NOTE_DURATION_SECONDS);
    });

    const closeContext = () => {
      if (audioContext.state !== 'closed') void audioContext.close().catch(() => {});
    };
    window.setTimeout(closeContext, CHIME_DURATION_SECONDS * 1000 + 250);
    if (audioContext.state === 'suspended') void audioContext.resume().catch(closeContext);
  } catch {
    // AudioContext may be unavailable or blocked by browser autoplay policies.
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }
}
