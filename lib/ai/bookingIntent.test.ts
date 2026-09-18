/**
 * UNIFIED SAVE PATH — deterministic entity extraction (no LLM).
 *
 * These are the EXACT live phrases that broke the chat path for an imaging
 * center (Amal X-Ray Center, 2026-09-18): «بدي اتصور بانوراما يوم الاحد الساعة 2»
 * was classified `unknown` with every appointment entity null, so no service or
 * slot was ever resolved, the booking gate never opened and nothing was saved —
 * while the model still replied «تم تثبيت موعدك».
 */
import { describe, expect, it } from 'vitest';
import { detectConversationIntelligence } from '@/lib/ai/intelligence';
import { extractRequestedServiceFromText } from '@/lib/ai/intentClassifier';

describe('detectConversationIntelligence (imaging-center bookings)', () => {
  it('classifies an imaging request as a booking, not `unknown`', () => {
    const result = detectConversationIntelligence('بدي اتصور بانوراما يوم الاحد الساعة 2');
    expect(result.intent).toBe('appointment_booking');
    expect(result.appointment.requestedService).toBe('بانوراما');
  });

  it('still classifies pricing questions as pricing, not as a booking', () => {
    expect(detectConversationIntelligence('قديش سعر البانوراما؟').intent).toBe('pricing_inquiry');
    expect(detectConversationIntelligence('كم سعر التصوير؟').intent).toBe('pricing_inquiry');
  });

  it('keeps the dental phrasings working', () => {
    expect(detectConversationIntelligence('بدي احجز موعد عند الدكتور').intent).toBe('appointment_booking');
  });

  it('extracts the name the patient actually gave («باسم طلال ابو جميل»)', () => {
    expect(detectConversationIntelligence('نعم باسم طلال ابو جميل').appointment.patientName).toBe('طلال ابو جميل');
  });

  it('never stores a request phrase as a patient name', () => {
    expect(detectConversationIntelligence('نعم أنا بدي احجز').appointment.patientName).toBeNull();
  });
});

describe('extractRequestedServiceFromText (deterministic service hint)', () => {
  it('extracts the service from an imaging request', () => {
    expect(extractRequestedServiceFromText('بدي اتصور بانوراما يوم الاحد الساعة 2')).toBe('بانوراما');
    expect(extractRequestedServiceFromText('بدي أعمل أشعة أسنان')).toBe('أشعة');
  });

  it('extracts multi-word service names', () => {
    expect(extractRequestedServiceFromText('بدي علاج عصب')).toBe('علاج عصب');
  });

  it('ignores bare mentions that are not booking desires', () => {
    expect(extractRequestedServiceFromText('هل الأشعة خطيرة؟')).toBeNull();
    expect(extractRequestedServiceFromText('مرحبا شو اخبارك')).toBeNull();
  });
});