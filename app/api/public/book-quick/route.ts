import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolvePublicClinic } from '@/lib/services/clinics';
import { normalizeActivityType } from '@/lib/services/activityTypes';
import { sendBookingConfirmationEmail } from '@/lib/communications/email/bookingConfirmation';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});

const postSchema = z.object({
  clinicId: z.string().uuid(),
  serviceId: z.string().uuid(),
  activityType: z.enum(['clinic', 'imaging_center', 'dental_lab']),
  name: z.string().min(2).max(50),
  phone: z.string().regex(/^[0-9+\-\s]{7,15}$/),
  email: z.string().trim().email().max(254).optional().nullable(),
  date: dateSchema,
  time: z.string().regex(TIME_PATTERN),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'بيانات غير صالحة', details: parsed.error.errors }, { status: 400 });
    }
    const { clinicId, serviceId, activityType, name, phone, email, date, time } = parsed.data;
    const publicClinic = await resolvePublicClinic({ id: clinicId });
    if (!publicClinic) return NextResponse.json({ error: 'العيادة غير موجودة' }, { status: 404 });

    const { data: clinicActivity, error: clinicActivityError } = await supabaseAdmin
      .from('clinics')
      .select('activity_type')
      .eq('id', clinicId)
      .maybeSingle();
    if (clinicActivityError) throw clinicActivityError;
    if (!clinicActivity || normalizeActivityType(clinicActivity.activity_type) !== activityType) {
      return NextResponse.json({ error: 'نوع الخدمة لا يطابق العيادة' }, { status: 400 });
    }

    const servicesTable =
      activityType === 'imaging_center' ? 'imaging_services' :
      activityType === 'dental_lab' ? 'lab_services' :
      'clinic_services';
    const { data: service, error: serviceError } = await supabaseAdmin
      .from(servicesTable)
      .select('id, name, duration_minutes')
      .eq('id', serviceId)
      .eq('clinic_id', clinicId)
      .eq('active', true)
      .maybeSingle();
    if (serviceError) throw serviceError;
    if (!service) return NextResponse.json({ error: 'الخدمة غير متاحة للحجز' }, { status: 404 });

    const { data: newAppointment, error: insertError } = await supabaseAdmin
      .from('appointments')
      .insert({
        clinic_id: clinicId,
        service: service.name,
        service_id: activityType === 'clinic' ? service.id : null,
        duration_minutes: service.duration_minutes ?? 30,
        patient_name: name,
        patient_phone: phone,
        appointment_date: date,
        scheduled_at: `${date}T${time}:00.000Z`,
        status: 'pending',
        source: 'web-quick',
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    const { data: clinic } = await supabaseAdmin
      .from('clinics')
      .select('owner_id')
      .eq('id', clinicId)
      .single();

    if (clinic?.owner_id) {
      await supabaseAdmin.from('notifications').insert({
        clinic_id: clinicId,
        user_id: clinic.owner_id,
        type: 'booking_quick',
        payload: {
          title: 'حجز جديد',
          body: `${name} - ${date} ${time} - ${phone}`,
          appointment_id: newAppointment.id,
        },
      });
    }

    const emailSent = await sendBookingConfirmationEmail({
      clinicId,
      appointmentId: newAppointment.id,
      to: email,
      clinicName: publicClinic.name,
      patientName: name,
      service: service.name,
      date,
      time,
    });

    // Google Calendar — fire-and-forget (ملف غير موجود حالياً — تتخطى دون انتظار)
    void Promise.resolve().catch(() => {});

    return NextResponse.json({
      success: true,
      appointment_id: newAppointment.id,
      clinic_name: publicClinic.name,
      clinic_phone: publicClinic.phone,
      email_sent: emailSent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinic_id');
    const date = url.searchParams.get('date');
    if (!clinicId || !date || !z.string().uuid().safeParse(clinicId).success || !dateSchema.safeParse(date).success) {
      return NextResponse.json({ error: 'clinic_id and date are required' }, { status: 400 });
    }

    const clinic = await resolvePublicClinic({ id: clinicId });
    if (!clinic) return NextResponse.json({ error: 'العيادة غير موجودة' }, { status: 404 });
    const start = `${date}T00:00:00.000Z`;
    const end = `${date}T23:59:59.999Z`;

    const { data: appointments, error } = await supabaseAdmin
      .from('appointments')
      .select('scheduled_at')
      .eq('clinic_id', clinicId)
      .gte('scheduled_at', start)
      .lte('scheduled_at', end)
      .neq('status', 'cancelled')
      .neq('status', 'completed')
      .is('deleted_at', null);
    if (error) throw error;

    const bookedTimes = (appointments ?? [])
      .map((a) => a.scheduled_at ? new Date(a.scheduled_at).toISOString().slice(11, 16) : '')
      .filter(Boolean);

    return NextResponse.json({ bookedTimes });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
