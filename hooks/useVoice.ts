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

export function useSpeechRecognition({ lang = 'ar-SA', onResult }: UseSpeechRecognitionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const armSilenceTimer = useCallback(
    (stop: () => void) => {
      clearSilenceTimer();
      silenceTimerRef.current = setTimeout(stop, SILENCE_TIMEOUT_MS);
    },
    [clearSilenceTimer],
  );

  const stop = useCallback(() => {
    clearSilenceTimer();
    try {
      recognitionRef.current?.stop();
    } catch {
      // already stopped
    }
  }, [clearSilenceTimer]);

  const start = useCallback(() => {
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
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      setTranscript('');
      armSilenceTimer(() => recognition.stop());
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0]?.transcript ?? '';
        if (event.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      const visible = (finalText || interim).trim();
      if (visible) setTranscript(visible);
      if (visible) {
        onResultRef.current?.(visible, Boolean(finalText));
        // إعادة ضبط مؤقت الصمت عند أي كلام — 10s صمت توقف تلقائياً
        armSilenceTimer(() => recognition.stop());
      }
    };

    recognition.onerror = (event: any) => {
      const code = String(event?.error ?? '');
      // "no-speech"/"aborted" توقف طبيعي — ليس فشلاً يُعرض للمريض.
      if (code && code !== 'no-speech' && code !== 'aborted' && code !== 'not-allowed') {
        setError(
          code === 'audio-capture'
            ? 'تعذّر الوصول إلى الميكروفون. تحقق من إذن المتصفح.'
            : 'حدث خطأ أثناء التسجيل الصوتي. حاول مرة أخرى.',
        );
      }
      setIsListening(false);
      clearSilenceTimer();
    };

    recognition.onend = () => {
      setIsListening(false);
      clearSilenceTimer();
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setError('تعذّر بدء التسجيل. حاول مرة أخرى.');
      setIsListening(false);
    }
  }, [armSilenceTimer, clearSilenceTimer, lang]);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  // إيقاف تلقائي عند unmount
  useEffect(() => {
    return () => {
      clearSilenceTimer();
      try {
        recognitionRef.current?.abort();
      } catch {
        // ignore
      }
    };
  }, [clearSilenceTimer]);

  return { isListening, transcript, error, start, stop, toggle, supported: isRecognitionSupported() };
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
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    // أفضل صوت عربي متاح في المتصفح (queue: محادثة واحدة في كل مرة)
    const arabicVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang?.toLowerCase().startsWith('ar'));
    if (arabicVoice) utterance.voice = arabicVoice;
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