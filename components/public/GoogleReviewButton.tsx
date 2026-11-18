import React from 'react';

export default function GoogleReviewButton({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <div className="mx-auto my-6 w-full max-w-5xl px-4 text-center sm:px-6">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 sm:w-auto"
      >
        {label}
      </a>
    </div>
  );
}
