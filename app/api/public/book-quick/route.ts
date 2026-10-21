import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolvePublicClinic } from '@/lib/services/clinics';
import { sendBookingConfirmationEmail } from '@/lib/communications/email/bookingConfirmation';

const postSchema = z.object({
  clinicId: z.string().uuid(),
  name: z.string().min(2).max(50),
  phone: z.string().regex(/^[0-9+\-\s]{7,15}$/),
  email: z.string().trim().email().max(254).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'بيانات غير صالحة', details: parsed.error.errors }, { status: 400 });
    }
    const { clinicId, name, phone, email, date, time } = parsed.data;
    const publicClinic = await resolvePublicClinic({ id: clinicId });
    if (!publicClinic) return NextResponse.json({ error: 'العيادة غير موجودة' }, { status: 404 });

    const appointmentDate = `${date}T${time}:00`;

    const { data: newAppointment, error: insertError } = await supabaseAdmin
      .from('appointments')
      .insert({
        clinic_id: clinicId,
        patient_name: name,
        patient_phone: phone,
        appointment_date: appointmentDate,
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
      service: 'موعد سريع',
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
    if (!clinicId || !date) {
      return NextResponse.json({ error: 'clinic_id and date are required' }, { status: 400 });
    }

    const start = `${date}T00:00:00`;
    const end = `${date}T23:59:59`;

    const { data: appointments } = await supabaseAdmin
      .from('appointments')
      .select('appointment_date')
      .eq('clinic_id', clinicId)
      .gte('appointment_date', start)
      .lte('appointment_date', end)
      .neq('status', 'cancelled');

    const bookedTimes = (appointments ?? [])
      .map((a) => a.appointment_date.slice(11, 16))
      .filter(Boolean);

    return NextResponse.json({ bookedTimes });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
