import { supabaseAdmin } from '@/lib/supabase/admin';
import { logEvent } from '@/lib/server/logging';

export type PendingBookingLeadInput = {
  clinicId: string;
  conversationId: string;
  name: string;
  phone: string;
  serviceId: string;
  serviceName: string;
  requestedDate?: string | null;
  requestedTime?: string | null;
  failureSource: string;
};

/** Save one idempotent, clinic-scoped callback request for a failed booking check. */
export async function persistPendingBookingLead(input: PendingBookingLeadInput): Promise<void> {
  const name = input.name.trim().slice(0, 120);
  const phone = input.phone.trim().slice(0, 40);
  if (!name || !phone) throw new Error('A patient name and phone are required for a pending booking lead.');

  const metadata = {
    channel: 'ai_chat',
    conversation_id: input.conversationId,
    request_type: 'booking_availability_confirmation',
    service_id: input.serviceId,
    service_name: input.serviceName,
    requested_date: input.requestedDate ?? null,
    requested_time: input.requestedTime ?? null,
    failure_source: input.failureSource,
  };

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('leads')
    .select('id')
    .eq('clinic_id', input.clinicId)
    .eq('source', 'ai_chat_calendar_unavailable')
    .eq('status', 'pending')
    .is('deleted_at', null)
    .contains('metadata', { conversation_id: input.conversationId })
    .maybeSingle();
  if (lookupError) throw new Error(`Pending booking lead lookup failed: ${lookupError.message}`);

  const query = existing
    ? supabaseAdmin.from('leads').update({ name, phone, metadata }).eq('id', existing.id).eq('clinic_id', input.clinicId).is('deleted_at', null)
    : supabaseAdmin.from('leads').insert([{
        clinic_id: input.clinicId,
        name,
        phone,
        email: null,
        source: 'ai_chat_calendar_unavailable',
        status: 'pending',
        metadata,
      }]);
  const { data, error } = await query.select('id').single();
  if (error || !data) throw new Error(`Pending booking lead save failed: ${error?.message ?? 'no row returned'}`);

  logEvent('booking_availability_pending_lead_saved', {
    clinic_id: input.clinicId,
    conversation_id: input.conversationId,
    lead_id: data.id,
    failure_source: input.failureSource,
    updated_existing: Boolean(existing),
  });
}
