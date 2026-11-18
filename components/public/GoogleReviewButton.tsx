import React from 'react';

export default function GoogleReviewButton({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-2xl bg-blue-600 px-5 py-3 text-center font-semibold text-white transition hover:bg-blue-700 sm:w-auto"
    >
      {label}
    </a>
  );
}
