'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** 10s صمت — المريض يفكر في جمل طويلة دون قطع (بدل 5s). */
const SILENCE_TIMEOUT_MS = 10000;
const TTS_STORAGE_KEY = 'dentalai_chat_tts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type SpeechRecognitionLike = any;

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export function isSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/* ─────────────────────────── Recognition ─────────────────────────── */

type UseSpeechRecognitionOptions = {
  lang?: string;
  onResult?: (text: string, isFinal: boolean) => void;
};

/** iOS Safari لا يدعم Recognition بشكل مستقر — يُكتشف بعد mount فقط. */
export function isIOSSafari(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua);
}

/**
 * جسر داخلي بين STT و TTS داخل نفس الملف: القراءة الصوتية توقف الاستماع
 * مؤقتاً ثم تعيده — دون أي تعديل على المكوّنات المستخدمة (ChatInterfaceV2).
 */
type SttBridge = { pauseForTts: () => void; resumeAfterTts: () => void } | null;
let sttBridge: SttBridge = null;

export function useSpeechRecognition({ lang = 'ar-SA', onResult }: UseSpeechRecognitionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** النص النهائي المُجمَّع — لا يضيع عند إعادة التشغيل التلقائية (Safari). */
  const finalTranscriptRef = useRef('');
  /** يمنع auto-restart عند الإيقاف اليدوي/الصمت/TTS. */
  const manuallyStoppedRef = useRef(false);
  const listeningRef = useRef(false);
  const pausedByTtsRef = useRef(false);
  const mountedRef = useRef(true);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const startRef = useRef<(preserveTranscript?: boolean) => void>(() => {});
  const stopRef = useRef<() => void>(() => {});

  const armSilenceTimer = useCallback((stopFn: () => void) => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(stopFn, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer]);

  const start = useCallback(
    (preserveTranscript = false) => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        setError('المتصفح لا يدعم الإدخال الصوتي. استخدم Chrome أو Edge للحصول على الميزة.');
        return;
      }
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
      clearRestartTimer();
      manuallyStoppedRef.current = false;
      if (!preserveTranscript) {
        finalTranscriptRef.current = '';
        setTranscript('');
      }
      const recognition = new Ctor();
      recognition.lang = lang;
      // iOS Safari: continuous=false (يقطع الجلسات الطويلة)؛ Android/Desktop: true.
      recognition.continuous = !isIOSSafari();
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        if (!mountedRef.current) return;
        listeningRef.current = true;
        setIsListening(true);
        setError(null);
        armSilenceTimer(() => stopRef.current());
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let finalChunk = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const chunk = event.results[i][0]?.transcript ?? '';
          if (event.results[i].isFinal) finalChunk += chunk;
          else interim += chunk;
        }
        // تجميع: finals السابقة (حتى بعد restart) + الجديد + interim الحي
        if (finalChunk) finalTranscriptRef.current += finalChunk;
        const combined = `${finalTranscriptRef.current}${interim}`.trim();
        if (!combined) return;
        setTranscript(combined);
        onResultRef.current?.(combined, Boolean(finalChunk));
        armSilenceTimer(() => stopRef.current());
      };

      recognition.onerror = (event: any) => {
        if (!mountedRef.current) return;
        const code = String(event?.error ?? '');
        if (code === 'no-speech') {
          // Safari يرسل no-speech قبل القطع — نبقي الاستماع ليعيد التشغيل onend.
          clearSilenceTimer();
          return;
        }
        if (code && code !== 'aborted' && code !== 'not-allowed') {
          setError(
            code === 'audio-capture'
              ? 'تعذّر الوصول إلى الميكروفون. تحقق من إذن المتصفح.'
              : 'حدث خطأ أثناء التسجيل الصوتي. حاول مرة أخرى.',
          );
        }
        listeningRef.current = false;
        setIsListening(false);
        clearSilenceTimer();
      };

      recognition.onend = () => {
        if (!mountedRef.current) return;
        clearSilenceTimer();
        // قطع تلقائي (Safari) والمستخدم ما زال يتحدث → إعادة تشغيل بعد 100ms
        // مع الحفاظ على النص المُجمَّع — لا يضيع ما سُمع قبل القطع.
        if (listeningRef.current && !manuallyStoppedRef.current) {
          restartTimerRef.current = setTimeout(() => {
            if (mountedRef.current && !manuallyStoppedRef.current) startRef.current(true);
          }, 100);
          return;
        }
        listeningRef.current = false;
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        setError('تعذّر بدء التسجيل. حاول مرة أخرى.');
        listeningRef.current = false;
        setIsListening(false);
      }
    },
    [armSilenceTimer, clearRestartTimer, clearSilenceTimer, lang],
  );
  startRef.current = start;

  const stop = useCallback(() => {
    manuallyStoppedRef.current = true;
    listeningRef.current = false;
    clearSilenceTimer();
    clearRestartTimer();
    try {
      recognitionRef.current?.stop();
    } catch {
      // already stopped
    }
    setIsListening(false);
  }, [clearRestartTimer, clearSilenceTimer]);
  stopRef.current = stop;

  // جسر TTS→STT: القراءة توقف الاستماع ثم تعيده إن كان نشطاً
  useEffect(() => {
    sttBridge = {
      pauseForTts: () => {
        if (!listeningRef.current) return;
        pausedByTtsRef.current = true;
        manuallyStoppedRef.current = true;
        listeningRef.current = false;
        clearSilenceTimer();
        clearRestartTimer();
        try {
          recognitionRef.current?.stop();
        } catch {
          // ignore
        }
        setIsListening(false);
      },
      resumeAfterTts: () => {
        if (!pausedByTtsRef.current) return;
        pausedByTtsRef.current = false;
        startRef.current(true);
      },
    };
    return () => {
      sttBridge = null;
    };
  }, [clearRestartTimer, clearSilenceTimer]);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  // إيقاف تلقائي عند unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      manuallyStoppedRef.current = true;
      clearSilenceTimer();
      clearRestartTimer();
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
    };
  }, [clearRestartTimer, clearSilenceTimer]);

  return { isListening, transcript, error, start: () => start(), stop, toggle, supported: isRecognitionSupported() };
}

/* ──────────────────────────── Synthesis ───────────────────────────── */

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const stop = useCallback(() => {
    if (!isSynthesisSupported()) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (!isSynthesisSupported() || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.rate = 1.0;
    // تعارض TTS/STT: أوقف الاستماع أثناء القراءة ثم أعده بعد الانتهاء
    const finish = () => {
      setIsSpeaking(false);
      sttBridge?.resumeAfterTts();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    // أفضل صوت عربي متاح في المتصفح (queue: محادثة واحدة في كل مرة)
    const arabicVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang?.toLowerCase().startsWith('ar'));
    if (arabicVoice) utterance.voice = arabicVoice;
    sttBridge?.pauseForTts();
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, []);

  useEffect(() => {
    return () => {
      if (isSynthesisSupported()) window.speechSynthesis.cancel();
    };
  }, []);

  return { speak, stop, isSpeaking, supported: isSynthesisSupported() };
}

/* ──────────────────────── TTS preference ──────────────────────────── */

/** OFF افتراضياً — المريض يفعّل بنفسه، والتفضيل محفوظ في localStorage. */
export function useTtsPreference() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    try {
      setEnabled(localStorage.getItem(TTS_STORAGE_KEY) === '1');
    } catch {
      // storage unavailable — remains OFF
    }
  }, []);

  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current;
      try {
        localStorage.setItem(TTS_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      if (!next && isSynthesisSupported()) window.speechSynthesis.cancel();
      return next;
    });
  }, []);

  return { enabled, toggle };
}