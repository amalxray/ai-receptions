'use client';

import { createContext, useContext } from 'react';
import { landingCopy } from '@/lib/landing/landing-copy';

/**
 * Landing content context — `app/page.tsx` (server) merges the DB CMS
 * overrides over the static `landingCopy` and passes the result here.
 * Every landing section component reads via `useLandingCopy()` so the
 * owner's CMS edits flow through without prop drilling. Falls back to the
 * static copy whenever no provider is mounted.
 */
export type LandingCopy = Record<string, any>;

const LandingContentContext = createContext<LandingCopy | null>(null);

function hexToRgbChannels(value: unknown, fallback: string): string {
  const hex = typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value.slice(1) : fallback.slice(1);
  return `${parseInt(hex.slice(0, 2), 16)} ${parseInt(hex.slice(2, 4), 16)} ${parseInt(hex.slice(4, 6), 16)}`;
}

export function LandingContentProvider({
  copy,
  children,
}: {
  children: React.ReactNode;
  copy: LandingCopy;
}) {
  const colors = (copy.colors ?? {}) as { primary?: string; secondary?: string; cta?: string };
  const style = {
    '--landing-primary': colors.primary || '#8B5CF6',
    '--landing-secondary': colors.secondary || '#22D3EE',
    '--landing-cta': colors.cta || '#0F172A',
    '--landing-primary-rgb': hexToRgbChannels(colors.primary, '#8B5CF6'),
    '--landing-secondary-rgb': hexToRgbChannels(colors.secondary, '#22D3EE'),
  } as React.CSSProperties;

  return <LandingContentContext.Provider value={copy}><div className="contents" style={style}>{children}</div></LandingContentContext.Provider>;
}

export function useLandingCopy(): LandingCopy {
  return useContext(LandingContentContext) ?? (landingCopy as LandingCopy);
}
