// A quiet, four-second notification chime synthesized with the Web Audio API.
// No external audio asset is needed; the mute preference remains in localStorage.

const CHIME_MUTED_STORAGE_KEY = 'clinic_notifications_chime_muted';
const CHIME_DURATION_SECONDS = 4;
const NOTE_INTERVAL_SECONDS = 0.76;
const NOTE_DURATION_SECONDS = 0.9;
const MELODY = [659.25, 783.99, 987.77, 783.99, 659.25];
const CHIME_TYPE_STORAGE_KEY = 'clinic_notifications_chime_type';
const CHIME_PREFERENCE_CHANGE_EVENT = 'clinic-notification-chime-change';

export type NotificationChimeType =
  | 'classic'
  | 'soft'
  | 'alert'
  | 'strong-ring'
  | 'extended-bell'
  | 'repeating-alert'
  | 'none';

const CHIME_TYPES: NotificationChimeType[] = [
  'classic',
  'soft',
  'alert',
  'strong-ring',
  'extended-bell',
  'repeating-alert',
  'none',
];

const CHIME_PRESETS: Record<
  'soft' | 'alert',
  { frequencies: number[]; interval: number; duration: number; waveform: OscillatorType; volume: number }
> = {
  soft: {
    frequencies: [523, 659],
    interval: 0.16,
    duration: 0.65,
    waveform: 'sine',
    volume: 0.1,
  },
  alert: {
    frequencies: [880, 880, 1175],
    interval: 0.18,
    duration: 0.12,
    waveform: 'square',
    volume: 0.1,
  },
};

function notifyPreferenceChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CHIME_PREFERENCE_CHANGE_EVENT));
  }
}

function scheduleTone(
  audioContext: AudioContext,
  start: number,
  duration: number,
  frequency: number,
  volume: number,
  options: { frequencyEnd?: number; fadeStart?: number; waveform?: OscillatorType } = {}
): void {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const attack = Math.min(0.02, duration / 4);

  oscillator.type = options.waveform ?? 'sine';
  oscillator.frequency.setValueAtTime(frequency, start);
  if (options.frequencyEnd !== undefined) {
    oscillator.frequency.linearRampToValueAtTime(options.frequencyEnd, start + duration);
  }

  gain.gain.setValueAtTime(0.001, start);
  gain.gain.linearRampToValueAtTime(volume, start + attack);
  if (options.fadeStart !== undefined) {
    gain.gain.setValueAtTime(volume, start + options.fadeStart);
  }
  gain.gain.linearRampToValueAtTime(0.001, start + duration);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

export function getNotificationChimeType(): NotificationChimeType {
  if (typeof window === 'undefined') return 'classic';
  try {
    const storedType = localStorage.getItem(CHIME_TYPE_STORAGE_KEY);
    return CHIME_TYPES.includes(storedType as NotificationChimeType)
      ? (storedType as NotificationChimeType)
      : 'classic';
  } catch {
    return 'classic';
  }
}

export function setNotificationChimeType(type: NotificationChimeType): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHIME_TYPE_STORAGE_KEY, type);
  } catch {
    // Keep the in-memory UI usable when browser storage is restricted.
  }
  notifyPreferenceChange();
}

export function isChimeMuted(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return (
      localStorage.getItem(CHIME_MUTED_STORAGE_KEY) === 'true' ||
      getNotificationChimeType() === 'none'
    );
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
  notifyPreferenceChange();
}

export function playNotificationChime(
  type: NotificationChimeType = getNotificationChimeType()
): void {
  if (typeof window === 'undefined') return;
  if (type === 'none' || isChimeMuted()) return;

  let context: AudioContext | null = null;
  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    context = audioContext;
    const now = audioContext.currentTime;

    let duration: number;

    if (type === 'classic') {
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
      duration = CHIME_DURATION_SECONDS;
    } else if (type === 'strong-ring') {
      const ringDuration = 0.8;
      const ringGap = 0.15;
      for (let index = 0; index < 3; index += 1) {
        scheduleTone(
          audioContext,
          now + index * (ringDuration + ringGap),
          ringDuration,
          880,
          0.25,
          { frequencyEnd: 1200, fadeStart: ringDuration - 0.08, waveform: 'triangle' }
        );
      }
      duration = 3 * ringDuration + 2 * ringGap;
    } else if (type === 'extended-bell') {
      duration = 4;
      scheduleTone(audioContext, now, duration, 1046, 0.12, { fadeStart: 0.04 });
      scheduleTone(audioContext, now, duration, 2092, 0.03, { fadeStart: 0.04 });
    } else if (type === 'repeating-alert') {
      const toneDuration = 0.15;
      const gap = 0.5;
      for (let index = 0; index < 3; index += 1) {
        scheduleTone(
          audioContext,
          now + index * (toneDuration + gap),
          toneDuration,
          880,
          0.2,
          { fadeStart: toneDuration - 0.04, waveform: 'square' }
        );
      }
      duration = 3 * toneDuration + 2 * gap;
    } else {
      const preset = CHIME_PRESETS[type];
      preset.frequencies.forEach((frequency, index) => {
        const start = now + index * preset.interval;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = preset.waveform;
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(preset.volume, start + 0.02);
        gain.gain.linearRampToValueAtTime(0.001, start + preset.duration);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + preset.duration);
      });
      duration =
        (preset.frequencies.length - 1) * preset.interval + preset.duration;
    }

    const closeContext = () => {
      if (audioContext.state !== 'closed') void audioContext.close().catch(() => {});
    };
    window.setTimeout(closeContext, duration * 1000 + 250);
    if (audioContext.state === 'suspended') void audioContext.resume().catch(closeContext);
  } catch {
    // AudioContext may be unavailable or blocked by browser autoplay policies.
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }
}
