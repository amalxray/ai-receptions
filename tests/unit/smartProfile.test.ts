import { describe, expect, it } from 'vitest';
import {
  parsePatientMetadata,
  serializePatientMetadata,
  calculateProfileCompletion,
  deriveCriticalAlerts,
  buildReminderMessage,
  buildInvoiceMessage,
  buildSmartTimeline,
  matchesProfileSearch,
  isAfter6Pm,
  lifestyleChip,
  appendQuickNote,
  formatMoneyAr,
  generateInvoiceStatementHtml,
  type QuickNote,
} from '@/components/dashboard/patients/smartProfile';

describe('Smart Patient Profile — N15 Helpers & Business Rules', () => {
  it('parses legacy and nested metadata defensively', () => {
    const raw = {
      date_of_birth: '1990-05-15',
      allergies: ['البنسلين'],
      smoking: 'نعم',
      blood_type: 'O+',
      quick_notes: [{ text: 'ملاحظة قديمة', date: '2025-01-01' }],
    };
    const parsed = parsePatientMetadata(raw);
    expect(parsed.date_of_birth).toBe('1990-05-15');
    expect(parsed.basic_info.blood_type).toBe('O+');
    expect(parsed.medical_history.allergies).toContain('البنسلين');
    expect(parsed.medical_history.smoking).toBe('نعم');
    expect(parsed.quick_notes).toHaveLength(1);
  });

  it('serializes metadata cleanly while preserving top-level date_of_birth for back-compat', () => {
    const meta = parsePatientMetadata({
      basic_info: { blood_type: 'A+', gender: 'ذكر' },
      date_of_birth: '1985-10-20',
    });
    const serialized = serializePatientMetadata(meta);
    expect(serialized.date_of_birth).toBe('1985-10-20');
    expect(serialized.basic_info.blood_type).toBe('A+');
  });

  it('calculates profile completion accurately (0 to 100)', () => {
    const empty = calculateProfileCompletion({ name: 'مريض تجريبي' });
    expect(empty.percent).toBeGreaterThanOrEqual(10);
    expect(empty.percent).toBeLessThan(50);

    const full = calculateProfileCompletion({
      name: 'أحمد محمد',
      phone: '0501234567',
      email: 'ahmed@example.com',
      metadata: {
        date_of_birth: '1990-01-01',
        basic_info: { blood_type: 'O+', gender: 'ذكر', address: 'الرياض' },
        medical_history: {
          allergies: ['البنسلين'],
          medications: ['بنادول'],
          chronic: ['الضغط'],
          surgeries: ['الزائدة'],
          smoking: 'لا',
          alcohol: 'لا',
          pregnancy: 'غير مطبّق',
        },
        insurance: { provider: 'بوبا', card_number: '123456' },
        emergency_contact: { name: 'سارة', phone: '0509876543' },
      },
    });
    expect(full.percent).toBe(100);
  });

  it('derives critical alerts from medical history, pregnancy, and explicit alerts', () => {
    const alerts = deriveCriticalAlerts({
      metadata: {
        critical_alert: 'حساسية مفرطة من التخدير العام',
        alerts: ['مريض يعاني من نزاف'],
        medical_history: {
          allergies: ['بنسلين'],
          pregnancy: 'نعم',
        },
      },
    });
    expect(alerts.criticalAlert).toBe('حساسية مفرطة من التخدير العام');
    expect(alerts.badges.length).toBeGreaterThanOrEqual(3);
    expect(alerts.badges.some((b) => b.text.includes('بنسلين'))).toBe(true);
    expect(alerts.badges.some((b) => b.text.includes('حامل'))).toBe(true);
  });

  it('builds reminder messages for WhatsApp / SMS / Email accurately', () => {
    const msg = buildReminderMessage({
      patientName: 'سارة خالد',
      service: 'تنظيف أسنان',
      date: '2026-05-10',
      time: '14:30',
      clinicName: 'عيادة النور',
    });
    expect(msg).toContain('سارة خالد');
    expect(msg).toContain('تنظيف أسنان');
    expect(msg).toContain('14:30');
    expect(msg).toContain('عيادة النور');
  });

  it('builds balance & invoice notification messages', () => {
    const msg = buildInvoiceMessage({
      patientName: 'خالد عبد الله',
      balance: { invoiced: 1500, paid: 1000, due: 500 },
      clinicName: 'مجمع الأمل',
    });
    expect(msg).toContain('خالد عبد الله');
    expect(msg).toContain('500');
    expect(msg).toContain('1,000');
  });

  it('constructs timeline items merging appointments and quick notes sorted newest first', () => {
    const appointments = [
      {
        id: 'a1',
        service: 'فحص دوري',
        appointment_date: '2026-01-10',
        appointment_time: '10:00',
        status: 'completed',
      },
      {
        id: 'a2',
        service: 'حشوة تجميلية',
        appointment_date: '2026-03-01',
        status: 'confirmed',
      },
    ];
    const quickNotes: QuickNote[] = [
      { text: 'تم فحص الأشعة المقطعية', date: '2026-02-15T09:00:00Z', by: 'د. خالد' },
    ];

    const timeline = buildSmartTimeline({ appointments, quickNotes });
    expect(timeline).toHaveLength(3);
    // Newest is 2026-03-01, then note 2026-02-15, then 2026-01-10
    expect(timeline[0].title).toBe('حشوة تجميلية');
    expect(timeline[1].title).toBe('ملاحظة طبية');
    expect(timeline[2].title).toBe('فحص دوري');
  });

  it('performs comprehensive search across patient profile fields', () => {
    const patient = {
      id: 'p1',
      name: 'فاطمة الزهراء',
      phone: '0551122334',
      metadata: {
        medical_history: { allergies: ['سلفا'], chronic: ['ربو شعبى'] },
        quick_notes: [{ text: 'استجابة جيدة للعلاج', date: '2026-01-01' }],
      },
    };
    expect(matchesProfileSearch('فاطمة', patient)).toBe(true);
    expect(matchesProfileSearch('05511', patient)).toBe(true);
    expect(matchesProfileSearch('سلفا', patient)).toBe(true);
    expect(matchesProfileSearch('ربو', patient)).toBe(true);
    expect(matchesProfileSearch('استجابة', patient)).toBe(true);
    expect(matchesProfileSearch('مجهول', patient)).toBe(false);
  });

  it('handles automatic dark mode determination after 6 PM (18:00)', () => {
    expect(isAfter6Pm(new Date(2026, 4, 15, 17, 59))).toBe(false);
    expect(isAfter6Pm(new Date(2026, 4, 15, 18, 0))).toBe(true);
    expect(isAfter6Pm(new Date(2026, 4, 15, 22, 30))).toBe(true);
    expect(isAfter6Pm(new Date(2026, 4, 15, 5, 0))).toBe(false);
  });

  it('chips lifestyle tags with sensible warn / ok tones', () => {
    expect(lifestyleChip('لا').tone).toBe('ok');
    expect(lifestyleChip('نعم').tone).toBe('warn');
    expect(lifestyleChip('').tone).toBe('muted');
  });

  it('appends quick notes without duplicating and caps history', () => {
    const updated = appendQuickNote(null, { text: 'ملاحظة 1', date: '2026-01-01' });
    expect(updated.quick_notes).toHaveLength(1);
    expect(updated.quick_notes[0].text).toBe('ملاحظة 1');

    const next = appendQuickNote(updated, { text: 'ملاحظة 2', date: '2026-01-02' });
    expect(next.quick_notes).toHaveLength(2);
    expect(next.quick_notes[0].text).toBe('ملاحظة 2');
  });

  it('generates HTML invoice statement for printing / saving to PDF', () => {
    const html = generateInvoiceStatementHtml({
      patientName: 'عمر ياسين',
      clinicName: 'مجمع الحياة',
      balance: { invoiced: 2000, paid: 1500, due: 500 },
      invoices: [
        { id: 'inv-1', invoice_number: 'INV-001', issued_at: '2026-01-01', total: 2000, status: 'issued' },
      ],
    });
    expect(html).toContain('عمر ياسين');
    expect(html).toContain('INV-001');
    expect(html).toContain('بيان حساب المريض');
  });
});
