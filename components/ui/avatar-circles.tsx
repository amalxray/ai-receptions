'use client';

import { cn } from '@/lib/utils';

interface AvatarCirclesProps {
  numPeople?: number;
  className?: string;
  avatarUrls: string[];
}

/** AvatarCircles — stacked avatars + a "+N" counter (Magic UI style). */
export function AvatarCircles({ numPeople, className, avatarUrls }: AvatarCirclesProps) {
  return (
    <div className={cn('z-10 flex -space-x-5 rtl:space-x-reverse', className)}>
      {avatarUrls.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={url}
          alt={`طبيب ${i + 1}`}
          height={40}
          width={40}
          className="h-10 w-10 rounded-full border-2 border-white bg-slate-700 object-cover shadow"
        />
      ))}
      {numPeople > avatarUrls.length && (
        <div className="grid h-10 w-10 place-items-center rounded-full border-2 border-white bg-slate-900 text-center text-xs font-medium text-white shadow">
          +{numPeople - avatarUrls.length}
        </div>
      )}
    </div>
  );
}
