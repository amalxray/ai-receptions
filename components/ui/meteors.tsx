'use client';

import { useEffect, useState } from 'react';

interface Meteor {
  id: number;
  left: string;
  top: string;
  delay: string;
  duration: string;
}

export function Meteors({ number = 12 }: { number?: number }) {
  const [meteors, setMeteors] = useState<Meteor[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    setMeteors(
      Array.from({ length: number }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 40}%`,
        delay: `${(Math.random() * 4).toFixed(2)}s`,
        duration: `${(3 + Math.random() * 4).toFixed(2)}s`,
      }))
    );
  }, [number]);
  if (!mounted) return null;

  return (
    <>
      <style>{`.meteor-span{position:absolute;width:2px;height:2px;border-radius:9999px;background:rgba(255,255,255,.8);box-shadow:0 0 0 1px rgba(255,255,255,.1);animation:meteor-fly linear infinite}.meteor-span::before{content:'';position:absolute;top:50%;transform:translateY(-50%);width:60px;height:1px;background:linear-gradient(to left,rgba(255,255,255,.6),transparent)}@keyframes meteor-fly{0%{transform:translateX(0) translateY(0);opacity:1}70%{opacity:.6}100%{transform:translateX(-420px) translateY(240px);opacity:0}}`}</style>
      {meteors.map((m) => (
        <span key={m.id} className="meteor-span pointer-events-none" style={{ left: m.left, top: m.top, animationDelay: m.delay, animationDuration: m.duration }} />
      ))}
    </>
  );
}
