# Google Calendar booking

The booking endpoint creates a real event in Google Calendar using a Service
Account, then stores the returned event ID with the appointment. If saving the
appointment fails after event creation, the service attempts to delete that
event to avoid leaving an orphaned booking.

## Configure the calendar ID

1. Apply [`db/migrations/20261018_google_calendar_booking_integration.sql`](../db/migrations/20261018_google_calendar_booking_integration.sql).
2. Configure `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and
   `GOOGLE_CALENDAR_ID` in `.env.local` and the deployment environment. The
   clinic's `google_calendar_id` overrides the environment calendar ID when set.
3. Share the target calendar with the Service Account email and grant it
   permission to make changes to events.
4. Restart the application after changing environment variables.

## Endpoints

- `POST /api/google-calendar/availability` checks persisted appointments for a
  clinic and requires authenticated clinic membership.
- `POST /api/google-calendar/book` saves an appointment and requires an
  authenticated clinic administrator or owner.

Both endpoints enforce clinic scoping. Availability currently checks the
application's appointment records; it does not query external calendar events
for free/busy conflicts.
