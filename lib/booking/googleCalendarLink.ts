type GoogleCalendarEvent = {
  appointmentDate: string;
  clinicName: string;
  clinicPhone?: string | null;
  appointmentId: string;
  patientName: string;
  serviceName: string;
  timeZone?: string;
};

function parseAppointmentDate(value: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:\s*[—–]\s*|T)(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;

  const [, date, hours, minutes] = match;
  const [year, month, day] = date.split('-').map(Number);
  const hour = Number(hours);
  const minute = Number(minutes);
  const start = new Date(Date.UTC(year, month - 1, day, hour, minute));

  if (
    start.getUTCFullYear() !== year ||
    start.getUTCMonth() !== month - 1 ||
    start.getUTCDate() !== day ||
    start.getUTCHours() !== hour ||
    start.getUTCMinutes() !== minute
  ) return null;

  return start;
}

function formatCalendarDate(value: Date): string {
  return [
    value.getUTCFullYear().toString().padStart(4, '0'),
    (value.getUTCMonth() + 1).toString().padStart(2, '0'),
    value.getUTCDate().toString().padStart(2, '0'),
    'T',
    value.getUTCHours().toString().padStart(2, '0'),
    value.getUTCMinutes().toString().padStart(2, '0'),
    '00',
  ].join('');
}

export function buildGoogleCalendarUrl(event: GoogleCalendarEvent): string | null {
  const start = parseAppointmentDate(event.appointmentDate);
  if (!start) return null;

  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const description = [
    `الخدمة: ${event.serviceName}`,
    `المريض: ${event.patientName}`,
    `رقم الحجز: ${event.appointmentId}`,
    event.clinicPhone ? `هاتف العيادة: ${event.clinicPhone}` : '',
  ].filter(Boolean).join('\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${event.serviceName} — ${event.clinicName}`,
    dates: `${formatCalendarDate(start)}/${formatCalendarDate(end)}`,
    details: description,
  });
  if (event.timeZone) params.set('ctz', event.timeZone);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
