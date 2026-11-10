// Web Audio API lightweight chime generator
// Crystal-clear dual-tone frequency (800Hz -> 1200Hz) with smooth exponential decay.
// No external mp3 assets needed. Respects mute toggle in localStorage.

const CHIME_MUTED_STORAGE_KEY = 'clinic_notifications_chime_muted';
const CHIME_TYPE_STORAGE_KEY = 'clinic_notifications_chime_type';
const CHIME_PREFERENCE_CHANGE_EVENT = 'clinic-notification-chime-change';

export type NotificationChimeType = 'classic' | 'soft' | 'alert' | 'none';

const CHIME_TYPES: NotificationChimeType[] = ['classic', 'soft', 'alert', 'none'];

type ChimeNote = {
  frequency: number;
  endFrequency?: number;
  delay: number;
  duration: number;
  waveform: OscillatorType;
};

const CHIME_PRESETS: Record<
  Exclude<NotificationChimeType, 'none'>,
  { volume: number; notes: ChimeNote[] }
> = {
  classic: {
    volume: 0.2,
    notes: [
      { frequency: 880, endFrequency: 1200, delay: 0, duration: 0.45, waveform: 'sine' },
      { frequency: 1320, endFrequency: 1760, delay: 0.04, duration: 0.41, waveform: 'triangle' },
    ],
  },
  soft: {
    volume: 0.12,
    notes: [
      { frequency: 523, endFrequency: 587, delay: 0, duration: 0.55, waveform: 'sine' },
      { frequency: 659, endFrequency: 698, delay: 0.14, duration: 0.55, waveform: 'sine' },
    ],
  },
  alert: {
    volume: 0.14,
    notes: [
      { frequency: 880, delay: 0, duration: 0.12, waveform: 'square' },
      { frequency: 880, delay: 0.18, duration: 0.12, waveform: 'square' },
      { frequency: 1175, delay: 0.36, duration: 0.24, waveform: 'square' },
    ],
  },
};

function notifyPreferenceChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CHIME_PREFERENCE_CHANGE_EVENT));
  }
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

  try {
    const AudioContextClass =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const preset = CHIME_PRESETS[type];
    const scheduleChime = () => {
      let notesRemaining = preset.notes.length;
      for (const note of preset.notes) {
        const startAt = ctx.currentTime + note.delay;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        const attackDuration = Math.min(0.02, note.duration / 2);

        oscillator.type = note.waveform;
        oscillator.frequency.setValueAtTime(note.frequency, startAt);
        if (note.endFrequency) {
          oscillator.frequency.exponentialRampToValueAtTime(
            note.endFrequency,
            startAt + Math.min(0.12, note.duration / 2)
          );
        }

        gainNode.gain.setValueAtTime(0.001, startAt);
        gainNode.gain.exponentialRampToValueAtTime(preset.volume, startAt + attackDuration);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startAt + note.duration);
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.onended = () => {
          notesRemaining -= 1;
          if (notesRemaining === 0) void ctx.close().catch(() => {});
        };
        oscillator.start(startAt);
        oscillator.stop(startAt + note.duration);
      }
    };

    if (ctx.state === 'suspended') {
      void ctx.resume().then(scheduleChime).catch(() => {
        void ctx.close().catch(() => {});
      });
    } else {
      scheduleChime();
    }
  } catch {
    // AudioContext may be blocked by autoplay policies until a user gesture.
  }
}
