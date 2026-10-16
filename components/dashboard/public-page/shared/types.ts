import type React from 'react';

/** Shared domain types for the public-page dashboard (moved verbatim). */

export type PublicServiceItem = { id: string; name: string };
export type PublicProviderItem = { id: string; name: string; title: string | null; specialty: string | null };

export type PublicContactField = 'whatsapp' | 'facebook' | 'instagram' | 'website' | 'email';

export const SOCIAL_FIELD_KEYS = ['whatsapp', 'facebook', 'instagram', 'website', 'email'] as const;

export type DisplaySettings = {
  image_size: 'small' | 'medium' | 'large';
  video_size: 'small' | 'medium' | 'large';
  gallery_spacing: 'compact' | 'normal' | 'roomy';
  body_text: 'small' | 'medium' | 'large';
  heading: 'small' | 'medium' | 'large';
  section_title: 'small' | 'medium' | 'large';
  cover_blur: number;
  cover_position: 'center' | 'top' | 'bottom' | 'left' | 'right';
  cover_offset_y: number;
  cover_height: number;
  cover_fit: 'cover' | 'contain';
  news_height: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  news_font: 'sm' | 'base' | 'lg' | 'xl' | '2xl';
};

export type PageConfig = {
  slug: string;
  public_id: string | null;
  email?: string | null;
  pageUrl: string;
  canonicalUrl: string;
  subdomainReady?: boolean;
  subdomainStatus?: 'active' | 'failed' | 'unknown';
  subdomainError?: string | null;
  description?: string;
  tagline?: string;
  about?: string;
  cover_url?: string;
  logo?: string;
  show_phone: boolean;
  show_prices: boolean;
  show_providers: boolean;
  discovery_enabled: boolean;
  social_links: { facebook?: string; instagram?: string; whatsapp?: string; website?: string; email?: string };
  sections: Record<string, boolean>;
  hidden_services: string[];
  hidden_providers: string[];
  services: PublicServiceItem[];
  providers: PublicProviderItem[];
  hasAds?: boolean;
  display: DisplaySettings;
  news_ticker_text?: string | null;
};

export type InfoFormState = {
  description: string;
  tagline: string;
  about: string;
  cover_url: string;
  logo: string;
  show_providers: boolean;
  discovery_enabled: boolean;
};

export type UpdatePatch = Record<string, unknown>;
export type UpdateFn = (patch: UpdatePatch) => Promise<unknown>;
export type ReloadFn = () => Promise<void>;
