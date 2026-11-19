import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import GoogleReviewButton from '@/components/public/GoogleReviewButton';
import ReviewsPageClient from '@/app/[slug]/reviews/ReviewsPageClient';
import { shouldShowGoogleReviewButton, supportsGoogleReviewSettings } from '@/lib/services/googleReviewSettings';

const AMAL_REVIEW_URL = 'https://g.page/r/CXCE9MGSfk0qEAE/review';

describe('Google review button', () => {
  it('supports clinics and imaging centers but not dental labs', () => {
    expect(supportsGoogleReviewSettings('clinic')).toBe(true);
    expect(supportsGoogleReviewSettings('imaging_center')).toBe(true);
    expect(supportsGoogleReviewSettings('dental_lab')).toBe(false);
  });

  it('renders the exact Google link in a protected new tab and adapts to mobile', () => {
    const html = renderToStaticMarkup(
      <GoogleReviewButton href={AMAL_REVIEW_URL} label="قيّمنا على Google" />,
    );
    expect(html).toContain(`href="${AMAL_REVIEW_URL}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('قيّمنا على Google');
    expect(html).toContain('w-full');
    expect(html).toContain('sm:w-auto');
  });

  it('places the Google action in the internal reviews action group exactly once', () => {
    const html = renderToStaticMarkup(
      <ReviewsPageClient
        clinicSlug="amal-x-ray-center"
        googleReviewUrl={AMAL_REVIEW_URL}
        googleReviewLabel="قيّمنا على Google"
      />,
    );
    const internalActionIndex = html.indexOf('⭐ قيّمنا');
    const copyActionIndex = html.indexOf('🔗 انسخ رابط التقييم');
    const googleActionIndex = html.indexOf('قيّمنا على Google');

    expect(internalActionIndex).toBeGreaterThanOrEqual(0);
    expect(copyActionIndex).toBeGreaterThan(internalActionIndex);
    expect(googleActionIndex).toBeGreaterThan(copyActionIndex);
    expect(html.match(new RegExp(`href="${AMAL_REVIEW_URL}"`, 'g'))).toHaveLength(1);
    expect(html).toContain('flex w-full flex-col gap-3 sm:w-auto');
  });

  it('shows only enabled clinics or imaging centers with a configured URL', () => {
    expect(shouldShowGoogleReviewButton('imaging_center', true, AMAL_REVIEW_URL)).toBe(true);
    expect(shouldShowGoogleReviewButton('clinic', true, AMAL_REVIEW_URL)).toBe(true);
    expect(shouldShowGoogleReviewButton('imaging_center', false, AMAL_REVIEW_URL)).toBe(false);
    expect(shouldShowGoogleReviewButton('imaging_center', true, null)).toBe(false);
    expect(shouldShowGoogleReviewButton('dental_lab', true, AMAL_REVIEW_URL)).toBe(false);
  });
});
