import { describe, expect, it } from 'vitest';
import { appointmentStatusAr, communicationTypeAr } from '@/lib/dashboard/labels-ar';

describe('Arabic dashboard labels', () => {
  it('normalizes alias variants for appointment status labels', () => {
    expect(appointmentStatusAr('Cancelled')).toBe('ملغى');
    expect(appointmentStatusAr('cancelled')).toBe('ملغى');
  });

  it('normalizes alias variants for communication types', () => {
    expect(communicationTypeAr('appointment_confirmation')).toBe('تأكيد الموعد');
    expect(communicationTypeAr('appointment-confirmation')).toBe('تأكيد الموعد');
    expect(communicationTypeAr('appointment confirmation')).toBe('تأكيد الموعد');
  });
});
