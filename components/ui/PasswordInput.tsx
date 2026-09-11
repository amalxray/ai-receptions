'use client';
import { useState } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  name?: string;
  required?: boolean;
  className?: string;
  autoComplete?: string;
  id?: string;
  minLength?: number;
}

/**
 * Password field with a visibility toggle (👁/🙈). Replaces every raw
 * `type="password"` input so users can verify what they typed.
 */
export default function PasswordInput({
  value,
  onChange,
  placeholder = 'كلمة المرور',
  name,
  required,
  className = '',
  autoComplete = 'current-password',
  id,
  minLength,
}: Props) {
  const [show, setShow] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        name={name}
        id={id}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="w-full rounded-3xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
        dir="ltr"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-slate-400 transition hover:text-slate-200"
        aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        tabIndex={-1}
      >
        {show ? '🙈' : '👁'}
      </button>
    </div>
  );
}