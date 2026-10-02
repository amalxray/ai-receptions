import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ClinicCard, { type SuggestedClinic } from '@/components/ask/ClinicCard';
import { DoctorCard } from '@/components/ask/DoctorCard';
import { prioritizeAskClinics } from '@/lib/services/askClinicDirectory';
import { clinicMapsUrl } from '@/lib/services/clinicMapsUrl';

const clinic: SuggestedClinic = {
  id: 'clinic-1',
  name: 'مركز أمل لتصوير الأسنان والفكين',
  slug: 'amal-x-ray-center',
  type: 'imaging_center',
  city: 'نابلس',
  address: 'شارع المثال',
  latitude: 32.2211,
  longitude: 35.2549,
  google_maps_url: null,
  phone: null,
  distance_km: 1.2,
  booking_url: '/amal-x-ray-center',
};

describe('/ask clinic location data', () => {
  it('prioritizes the canonical Amal imaging-center record without mutating input', () => {
    const rows = [{ slug: 'z-demo' }, { slug: 'amal-x-ray-center' }, { slug: 'a-demo' }];
    expect(prioritizeAskClinics(rows, 2).map((row) => row.slug)).toEqual([
      'amal-x-ray-center',
      'a-demo',
    ]);
    expect(rows[0].slug).toBe('z-demo');
  });

  it('uses the matched clinic coordinates before a potentially stale saved URL', () => {
    expect(clinicMapsUrl({ ...clinic, google_maps_url: 'https://maps.example/old' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=32.2211%2C35.2549'
    );
  });

  it('uses the full clinic name and location when coordinates are unavailable', () => {
    const url = clinicMapsUrl({ ...clinic, latitude: null, longitude: null });
    expect(url).toContain(encodeURIComponent('مركز أمل لتصوير الأسنان والفكين'));
    expect(url).toContain(encodeURIComponent('شارع المثال'));
    expect(url).toContain(encodeURIComponent('نابلس'));
  });

  it('renders the directory card location and exact coordinate map link', () => {
    const html = renderToStaticMarkup(
      React.createElement(DoctorCard, {
        clinic: {
          id: clinic.id,
          name: clinic.name,
          slug: clinic.slug,
          city: clinic.city,
          address_detail: clinic.address,
          latitude: clinic.latitude,
          longitude: clinic.longitude,
          google_maps_url: clinic.google_maps_url,
          activity_type: clinic.type,
          booking_url: clinic.booking_url,
        },
      })
    );
    expect(html).toContain('نابلس');
    expect(html).toContain('شارع المثال');
    expect(html).toContain('query=32.2211%2C35.2549');
  });

  it('shows a neutral location state and no map link for incomplete chat suggestions', () => {
    const html = renderToStaticMarkup(
      React.createElement(ClinicCard, {
        clinic: { ...clinic, city: '  ', address: ' ', latitude: null, longitude: null },
      })
    );
    expect(html).toContain('الموقع قيد التحديد');
    expect(html).not.toContain('نابلس');
    expect(html).not.toContain('افتح الموقع');
  });

  it('shows a neutral location state in the static directory for incomplete records', () => {
    const html = renderToStaticMarkup(
      React.createElement(DoctorCard, {
        clinic: {
          id: 'demo-1',
          name: 'عيادة تجريبية',
          slug: 'demo-1',
          city: ' ',
          address_detail: ' ',
          latitude: null,
          longitude: null,
          google_maps_url: null,
          activity_type: 'clinic',
          booking_url: '/demo-1',
        },
      })
    );
    expect(html).toContain('الموقع قيد التحديد');
    expect(html).not.toContain('افتح الموقع');
  });
});