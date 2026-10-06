/**
 * Public AI chat booking policy is tenant/activity agnostic. Clinic identity is
 * resolved separately for every request and all persistence stays clinic-scoped.
 */
export type ChatBookingPolicy = {
  checkGoogleCalendar: true;
  requirePhone: true;
  createGoogleCalendarEvent: true;
};

const GLOBAL_CHAT_BOOKING_POLICY: ChatBookingPolicy = Object.freeze({
  checkGoogleCalendar: true,
  requirePhone: true,
  createGoogleCalendarEvent: true,
});

/**
 * Deliberately does not branch on slug or activity: Hala, Amal Clinic, imaging
 * centers, labs, and future tenants all share the same booking guarantees.
 */
export function getChatBookingPolicy(_clinicSlug?: string | null, _activityType?: string | null): ChatBookingPolicy {
  return GLOBAL_CHAT_BOOKING_POLICY;
}