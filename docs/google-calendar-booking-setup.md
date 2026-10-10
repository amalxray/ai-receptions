# Per-clinic Google Calendar OAuth setup

Each clinic connects its own Google account from **Dashboard → Communication
Settings → Google Calendar**. The connection is made by a clinic owner or
manager through Google's account chooser; it is not inferred from the email
used to register for the application. The selected Google account's primary
calendar is used only for that clinic. The settings page displays the connected
Google email so the clinic can verify which account it selected.

## Google Cloud setup

1. Create or select a Google Cloud project and enable the Google Calendar API.
2. Configure the OAuth consent screen with the app's name and support email.
   Add the `openid`, `email`, and
   `https://www.googleapis.com/auth/calendar.events` scopes.
3. Create an OAuth client ID for a **Web application**.
4. Add the deployed callback URL (and the local URL for development) to
   **Authorized redirect URIs**:
   `https://your-domain.example/api/clinic/google-calendar/callback`
   `http://localhost:3000/api/clinic/google-calendar/callback`
   If the development server runs on port 3001, also register
   `http://localhost:3001/api/clinic/google-calendar/callback` and set the
   redirect URI environment variable to that exact local URL.
5. Set the OAuth credentials in the server environment. Do not expose the
   client secret or encryption key to browser code.

```dotenv
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REDIRECT_URI=https://your-domain.example/api/clinic/google-calendar/callback
GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY=
```

Generate a random 32-byte key and encode it as Base64 for
`GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`. Keep the same key across deployments:
changing it makes already stored clinic refresh tokens unreadable. Store all
four values in the hosting provider's secret/environment-variable manager and
restart the app after changing them.

## Clinic connection flow

1. An owner or manager opens that clinic's Communication Settings.
2. **Connect Google Calendar** navigates to
   `/api/clinic/google-calendar/connect`. That route uses the authenticated
   Supabase session and verified clinic membership to select the clinic; it
   does not accept a clinic ID in the URL query.
3. The app redirects to Google with `access_type=offline` and `prompt=consent`.
   Its short-lived HS256 JWT state binds the callback to the clinic and user.
4. After consent, the callback validates the signed state and the authenticated
   clinic membership before storing anything.
5. Access and refresh tokens are encrypted together with AES-256-GCM and saved
   in that clinic's `clinics.settings`; neither token is returned to the
   browser. The selected account email is displayed to clinic administrators.
5. Disconnecting removes only that clinic's saved OAuth connection.

The app reads busy intervals and creates events in the connected account's
`primary` calendar. Appointment and calendar operations always resolve the
credentials using the appointment's `clinic_id`, so a connection cannot be
used by another clinic.

## Booking behavior

When a clinic is connected, booking checks both the clinic's local schedule and
that clinic's Google Calendar before inserting an event. New events are linked
to the matching clinic appointment. If a clinic has not connected a calendar,
the appointment remains database-backed and pending confirmation; the app does
not silently use a shared or global Google account.

OAuth API failures during availability checks are surfaced as availability
errors rather than treating the calendar as empty. A controlled booking should
be tested with a clinic-owned test Google account before enabling the feature
for patients.

## Deployment status and release gates (2026-10-10)

The per-clinic OAuth flow has been exercised locally: the clinic connection was
read, upcoming events were queried, and a temporary event was created, fetched,
then deleted. A focused test forces token refresh and verifies that the new
access token and expiry are persisted encrypted for the same clinic. These
checks do **not** certify production deployment, production database schema,
or Google's production OAuth verification.

### OAuth consent-screen constraints

The current Google Cloud consent screen is **External / Testing** and only
configured test users can authorize. In Testing mode, refresh tokens for these
non-basic scopes expire after seven days, so this setup is not suitable for
reliable clinic operations. Before a public launch, configure the production
consent screen, verify the app/domain and required OAuth scopes/verification
with Google, and confirm the production user cap and review requirements in
Google Cloud Console. Do not assume local successful consent means the app has
passed verification.

### Production deployment checklist

1. Register this exact callback URI as an authorized redirect URI in Google
   Cloud: `https://www.dentairec.com/api/clinic/google-calendar/callback`.
2. Configure the four server-side Vercel variables for the production
   environment: `GOOGLE_CALENDAR_CLIENT_ID`,
   `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI` (the exact
   callback above), and `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` (32 random bytes,
   Base64). Never use `NEXT_PUBLIC_` for client secret or encryption key.
3. Preserve the same encryption key across deploys and environments that must
   decrypt the same clinic records; never replace it without an approved
   re-encryption/rotation plan.
4. Review and apply required migrations to staging first; record production
   schema state rather than assuming a repository migration has been applied.
5. Deploy the reviewed OAuth routes and UI, then test connect/status/disconnect,
   event listing, booking, and per-clinic isolation with a test clinic.
6. Confirm token-refresh persistence and error monitoring. Roll out to one
   approved clinic first; only broaden after an owner-approved production
   smoke test.

### New clinic connection

An owner/manager signs into the clinic dashboard, opens Communication Settings,
and selects **Connect Google Calendar**. The server derives the clinic from the
authenticated membership and selected clinic context; the user chooses the
Google account and grants the requested scopes. The callback re-validates
session, signed state, and membership, then stores encrypted credentials under
that clinic's `settings`. Verify the displayed account identity and test
availability before taking patient bookings. A clinic must explicitly connect
its own account; registration email alone never creates the link.

The production API and UI changes must be committed, reviewed, and deployed
before claiming this feature is live on `www.dentairec.com`.
