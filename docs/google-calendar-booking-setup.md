# Google Calendar booking scaffold

The booking endpoints currently save appointment records and use a clinic's
`google_calendar_id` to scope the booking configuration. This is a scaffold:
it does not call the Google Calendar API, create calendar events, or confirm
that a slot is free in Google Calendar. The stored `google_event_id` is
synthetic and must not be treated as a live Google event.

## Configure the calendar ID

1. Apply [`db/migrations/20261018_google_calendar_booking_integration.sql`](../db/migrations/20261018_google_calendar_booking_integration.sql).
2. Set `clinics.google_calendar_id` for each clinic. If it is empty, the service
   uses the server-side `GOOGLE_CALENDAR_ID` environment variable.
3. Restart the application after changing environment variables.

## Endpoints

- `POST /api/google-calendar/availability` checks persisted appointments for a
  clinic and requires authenticated clinic membership.
- `POST /api/google-calendar/book` saves an appointment and requires an
  authenticated clinic administrator or owner.

Both endpoints enforce clinic scoping. Configure Google service-account
credentials and implement live event creation/synchronization before relying on
Google Calendar itself as the source of truth.
