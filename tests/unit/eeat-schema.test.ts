import { describe, it, expect } from 'vitest';
import { buildDoctorJsonLd } from '@/lib/services/doctorJsonLd';
import type { DoctorPublicProfile } from '@/lib/services/doctorPublicProfile';

const profile: DoctorPublicProfile = {
  slug: 'dr-ahmad',
  name: 'Dr. Ahmad',
  title: 'دكتور أسنان',
  specialty: null,
  bio: null,
  photo_url: null,
  visibility: 'indexable',
  updated_at: '2026-10-02T12:34:56.000Z',
  clinic: {
    name: 'Demo Dental Clinic',
    slug: 'demo-dental-clinic',
    city: 'عمّان',
    area: 'وسط المدينة',
    address: 'شارع الملكة رania',
    phone: '+970-555-0001',
    pageUrl: 'https://clinics.example.com/c/demo-dental-clinic',
  },
  services: [{
    name: 'فحص أسنان',
    description: 'فحص روتيني',
    duration_minutes: 30,
    price: 120,
    price_min: null,
    price_max: null,
  }],
  workingHours: [{ weekday: 1, start_time: '09:00', end_time: '17:00' }],
  bookingUrl: '/book?slug=demo-dental-clinic',
  chatUrl: '/chat?clinic=demo-dental-clinic',
  pageUrl: 'https://clinics.example.com/d/dr-ahmad',
};

describe('E-E-A-T schema signals', () => {
  it('uses the actual doctor title for medicalSpecialty and real updated_at for dateModified', () => {
    const ld = buildDoctorJsonLd(profile);
    const graph = ld['@graph'] as any[];
    const physician = graph.find((node) => node['@type'] === 'Physician');

    expect(physician).toBeTruthy();
    expect(physician.medicalSpecialty).toBe('دكتور أسنان');
    expect(physician.dateModified).toBe('2026-10-02T12:34:56.000Z');
  });

  it('links the doctor to the clinic as publisher without fake claims', () => {
    const ld = buildDoctorJsonLd(profile);
    const graph = ld['@graph'] as any[];
    const physician = graph.find((node) => node['@type'] === 'Physician');

    expect(physician.publisher).toMatchObject({
      '@type': 'MedicalBusiness',
      name: 'Demo Dental Clinic',
    });
    expect(JSON.stringify(ld)).not.toMatch(/1000|مريض|شهادة|تقييم|جائزة/i);
  });
});
