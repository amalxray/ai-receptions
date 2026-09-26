import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CLARIFICATION_MARKER,
  REFERRAL_BODY_MAX,
  REFERRAL_NOTES_MAX,
  REFERRAL_NOTIFICATION_EVENTS,
  REFERRAL_STATUS_LABELS,
  REFERRAL_TITLE_MAX,
  appendClarificationNote,
  buildReferralNotification,
  clip,
  eventForStatusTransition,
  imagingTypeLabel,
  isClarificationNote,
  isReferralNotificationEvent,
  isReferralTerminal,
  referralDirection,
  referralPriorityLabel,
  referralStatusLabel,
  referralStatusTone,
} from '@/lib/services/referralWorkflow';
import { InAppNotificationEvent } from '@/lib/notifications/inAppNotifier';

/**
 * B20 — the referral model is PURE, so every rule the UI and the routes depend
 * on is asserted here directly: direction resolution, the notification wording
 * (built from the RECIPIENT's point of view), the clarification note composer
 * and its hard 2000-char cap. The wiring of the routes/pages is asserted on
 * SOURCE (a wrong import or a forgotten notification fails immediately).
 */

const projectRoot = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(projectRoot, rel), 'utf8');

describe('B20 — referral direction (who sent / who received)', () => {
  const row = { clinic_id: 'center', referring_clinic_id: 'clinic' };

  it('resolves outgoing for the referring clinic and incoming for the activity side', () => {
    expect(referralDirection('clinic', row)).toBe('outgoing');
    expect(referralDirection('center', row)).toBe('incoming');
  });

  it('never resolves for an unrelated tenant or an unknown caller', () => {
    expect(referralDirection('stranger', row)).toBe(null);
    expect(referralDirection(null, row)).toBe(null);
    expect(referralDirection(undefined, row)).toBe(null);
  });

  it('treats a row with no referrer as an internal request, not a referral', () => {
    expect(referralDirection('center', { clinic_id: 'center', referring_clinic_id: null })).toBe('incoming');
    // A clinic can never claim a row whose activity side it does not own.
    expect(referralDirection('other', { clinic_id: 'center', referring_clinic_id: null })).toBe(null);
  });

  it('prefers the SENT side when one org is both parties (defensive)', () => {
    expect(referralDirection('same', { clinic_id: 'same', referring_clinic_id: 'same' })).toBe('outgoing');
  });
});

describe('B20 — status language and tones', () => {
  it('labels every state the workflow can hold', () => {
    for (const status of ['submitted', 'accepted', 'rejected', 'needs_clarification', 'scheduled', 'in_progress', 'ready', 'completed', 'delivered', 'cancelled']) {
      expect(referralStatusLabel(status)).not.toBe(status);
    }
    expect(referralStatusLabel('accepted')).toBe('مقبول');
    expect(referralStatusLabel('needs_clarification')).toBe('يحتاج توضيحًا');
  });

  it('falls back to the raw value (never to a wrong label) and handles null', () => {
    expect(referralStatusLabel('weird_new_state')).toBe('weird_new_state');
    expect(referralStatusLabel(null)).toBe('غير معروف');
    expect(REFERRAL_STATUS_LABELS.delivered).toBe('مُسلّم');
  });

  it('maps tones: done/ok = success, waiting = warning, refused = danger', () => {
    expect(referralStatusTone('delivered')).toBe('success');
    expect(referralStatusTone('accepted')).toBe('success');
    expect(referralStatusTone('submitted')).toBe('warning');
    expect(referralStatusTone('needs_clarification')).toBe('warning');
    expect(referralStatusTone('rejected')).toBe('danger');
    expect(referralStatusTone('cancelled')).toBe('danger');
    expect(referralStatusTone('in_progress')).toBe('neutral');
    expect(referralStatusTone(null)).toBe('neutral');
  });

  it('treats terminal states as unmovable and everything else as active', () => {
    for (const status of ['rejected', 'completed', 'delivered', 'cancelled']) {
      expect(isReferralTerminal(status)).toBe(true);
    }
    for (const status of ['submitted', 'accepted', 'needs_clarification', 'scheduled', 'in_progress', 'ready', null, undefined]) {
      expect(isReferralTerminal(status as string | null)).toBe(false);
    }
  });

  it('labels priority with route as the default', () => {
    expect(referralPriorityLabel(null)).toBe('عادي');
    expect(referralPriorityLabel('urgent')).toBe('عاجل');
    expect(referralPriorityLabel('routine')).toBe('عادي');
    expect(referralPriorityLabel('sprint')).toBe('sprint');
  });

  it('translates the imaging type and falls back to the service name', () => {
    expect(imagingTypeLabel('panorama')).toBe('بانوراما');
    expect(imagingTypeLabel('CBCT')).toBe('CBCT');
    expect(imagingTypeLabel('tmj')).toBe('مفصل الفك (TMJ)');
    expect(imagingTypeLabel(null, 'أشعة بانوراما كاملة')).toBe('أشعة بانوراما كاملة');
    expect(imagingTypeLabel(null, null)).toBe('غير محدد');
    expect(imagingTypeLabel('custom_modality', null)).toBe('custom_modality');
  });
});
