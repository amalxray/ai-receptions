type SkeletonProps = {
  className?: string;
};

export default function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={`relative isolate overflow-hidden rounded-3xl bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 shadow-[0_0_18px_rgba(148,163,184,0.12)] animate-pulse ${className ?? ''}`}
    />
  );
}
