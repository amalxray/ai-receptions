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

export function LandingContentProvider({
  copy,
  children,
}: {
  copy: LandingCopy;
  children: React.ReactNode;
}) {
  return <LandingContentContext.Provider value={copy}>{children}</LandingContentContext.Provider>;
}

export function useLandingCopy(): LandingCopy {
  return useContext(LandingContentContext) ?? (landingCopy as LandingCopy);
}
