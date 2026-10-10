/**
 * Public AI chat booking policy is tenant/activity agnostic. Clinic identity is
 * resolved separately for every request and all persistence stays clinic-scoped.
 */
export type ChatBookingPolicy = {
  checkGoogleCalendar: boolean;
  requirePhone: true;
  createGoogleCalendarEvent: boolean;
};

function hasGoogleCalendarConfiguration(): boolean {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();

  return Boolean(
    serviceAccountEmail?.includes('@')
    && privateKey?.includes('-----BEGIN PRIVATE KEY-----')
    && calendarId
  );
}

/**
 * Deliberately does not branch on slug or activity: Hala, Amal Clinic, imaging
 * centers, labs, and future tenants all share the same booking guarantees.
 */
export function getChatBookingPolicy(_clinicSlug?: string | null, _activityType?: string | null): ChatBookingPolicy {
  const googleCalendarConfigured = hasGoogleCalendarConfiguration();
  return {
    checkGoogleCalendar: googleCalendarConfigured,
    requirePhone: true,
    createGoogleCalendarEvent: googleCalendarConfigured,
  };
}