# Google Calendar booking integration setup guide

This guide explains how to configure a Google service account for the direct booking flow without connecting the production app to Google yet.

## 1. Create a Google Cloud project

1. Open https://console.cloud.google.com/
2. Create a new project or select an existing one.
3. Give it a clear name such as `clinic-booking-integration`.
4. Make sure the billing account is enabled if required by your Google Cloud project policy.

## 2. Enable the Google Calendar API

1. In Google Cloud Console, open `APIs & Services` > `Library`.
2. Search for `Google Calendar API`.
3. Click `Enable`.
4. It may take a few seconds to become active.

## 3. Create a service account

1. Open `IAM & Admin` > `Service Accounts`.
2. Click `Create Service Account`.
3. Use a name like `clinic-calendar-bot`.
4. Add the service account to the project.
5. After creation, open the service account and go to the `Keys` tab.
6. Click `Add Key` > `Create new key` > `JSON`.
7. Download the file. This is the `credentials.json` equivalent.

## 4. Grant access to the target calendar

1. Open Google Calendar.
2. Select the calendar to be used for appointments.
3. Open `Settings and sharing`.
4. In `Share with specific people or groups`, add the service account email address.
5. Give it `Make changes to events` or `Make changes and manage sharing`, depending on your desired permissions.
6. Save the settings.

> Without sharing the calendar with the service account, the booking API cannot create calendar events.

## 5. Get the required values

From the downloaded JSON key file, collect:

- `client_email`
- `private_key`
- `project_id`

From Google Calendar, also collect the calendar ID:

- Calendar ID appears in `Settings and sharing` as the calendar address, for example:
  `your-calendar-id@group.calendar.google.com`

## 6. Store the values in environment variables

Add the following to your local `.env.local` or deployment environment:

```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL="your-service-account@project-id.iam.gserviceaccount.com"
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CALENDAR_ID="your-calendar-id@group.calendar.google.com"
```

For Vercel, add the same values in the project environment variables page.

## 7. Recommended Node.js library

Use `googleapis`:

```bash
npm install googleapis
```

Example initialization:

```ts
import { google } from 'googleapis';

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/calendar'],
});

const calendar = google.calendar({ version: 'v3', auth });
```

## 8. Safety pattern for direct booking

Before creating the Google event, the app should:

1. Check availability for the requested slot.
2. Reject overlaps with existing confirmed or pending appointments.
3. Insert the appointment row into `public.appointments`.
4. Create the Google Calendar event.
5. Save the returned `event.id` in `google_event_id`.
6. Update the booking status to `confirmed` after the event is created.

This avoids double booking and keeps the database and calendar in sync.

## 9. Environment and deployment checklist

- Google Calendar API enabled
- Service account created
- JSON key downloaded
- Calendar shared with service account
- Environment variables added
- App restarted after env changes
- Calendar ID validated
- Production secrets stored in a secure secret manager

## 10. Important note

The code in this branch is intentionally structured as a safe scaffolding layer. It does not create live Google Calendar events until the credentials are supplied and the environment is configured.
