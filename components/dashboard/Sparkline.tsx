type SparklineProps = {
  values: number[];
  /**
   * 'top' (default, backwards compatible) normalises 0…max — the historical
   * behaviour. 'zero' draws a real zero baseline so LOSS months (negative net)
   * fall below the middle of the box instead of being clipped away.
   */
  baseline?: 'top' | 'zero';
  stroke?: 'gradient' | 'profit' | 'loss';
};

const STROKES: Record<NonNullable<SparklineProps['stroke']>, string> = {
  gradient: 'url(#spark-gradient)',
  profit: '#34d399',
  loss: '#fb7185',
};

export default function Sparkline({ values, baseline = 'top', stroke = 'gradient' }: SparklineProps) {
  const max = Math.max(...values, 1);
  const min = baseline === 'zero' ? Math.min(...values, 0) : 0;
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - ((value - min) / span) * 100;
      return `${x},${y}`;
    })
    .join(' ');
  const zeroY = baseline === 'zero' ? 100 - ((0 - min) / span) * 100 : null;

  return (
    <div className="h-24 w-full overflow-hidden rounded-[1.25rem] border border-slate-800 bg-slate-950/70 p-3">
      <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="spark-gradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        {zeroY !== null && (
          <line x1="0" x2="100" y1={zeroY} y2={zeroY} stroke="rgba(148,163,184,0.35)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
        <polyline fill="none" stroke={STROKES[stroke]} strokeWidth="4" points={points} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
