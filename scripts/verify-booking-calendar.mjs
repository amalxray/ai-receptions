/**
 * verify-booking-calendar.mjs — real-browser check of the public booking flow on
 * a phone viewport (issue #39: iOS could not open the native date picker, so the
 * flow now uses a custom calendar).
 *
 * Drives the ACTUAL app: service → provider → tap a day on the calendar → the
 * flow must land on the time step with the day kept in the URL, the displayed
 * closures must match /api/booking/calendar, and the calendar day targets must
 * hit the mobile minimum with no horizontal scroll at the phone width.
 *
 * Usage (dev or preview server must be running):
 *   node scripts/verify-booking-calendar.mjs
 *   BOOKING_BASE_URL=https://app.example.com CLINIC_SLUG=hala-clinic node scripts/verify-booking-calendar.mjs
 *
 * Env: BOOKING_BASE_URL (default http://localhost:3005), CLINIC_SLUG (default
 *      hala-clinic — it has services AND a provider; a clinic with an empty
 *      catalogue cannot exercise the flow), CHROME_PATH (default
 *      /usr/bin/google-chrome), VIEWPORT_WIDTH (default 375),
 *      VIEWPORT_HEIGHT (default 812).
 */
/* global document, window */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BOOKING_BASE_URL || 'http://localhost:3005';
const SLUG = process.env.CLINIC_SLUG || 'hala-clinic';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const WIDTH = Number(process.env.VIEWPORT_WIDTH || 375);
const HEIGHT = Number(process.env.VIEWPORT_HEIGHT || 812);
// Day cells are bounded by the booking card's padding: 375px and up (all current
// iPhones/Androids) fit ≥ 40px, while a legacy 320px screen keeps ≥ 32px — still
// far above the WCAG 2.5.8 minimum of 24px.
const MIN_TARGET_WIDTH = WIDTH >= 360 ? 40 : 32;

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}${detail ? ` (${detail})` : ''}`);
}

async function tapFirst(page, selector, timeout = 15000) {
  await page.waitForSelector(selector, { timeout });
  const handles = await page.$$(selector);
  for (const handle of handles) {
    try {
      await handle.tap();
      return true;
    } catch {
      try {
        await handle.click();
        return true;
      } catch {
        // try the next candidate
      }
    }
  }
  return false;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1'
  );

  try {
    // Pre-flight: a clinic with an empty catalogue renders an empty state instead
    // of a service card, so say that plainly instead of timing out on a selector.
    const preflight = await fetch(`${BASE}/api/booking/clinic?slug=${encodeURIComponent(SLUG)}`)
      .then((r) => r.json())
      .catch(() => null);
    const preflightClinicId = preflight?.data?.id || '';
    if (preflightClinicId) {
      const catalogue = await fetch(`${BASE}/api/booking/services?clinic_id=${preflightClinicId}`)
        .then((r) => r.json())
        .catch(() => null);
      if (catalogue && (catalogue.data?.services || []).length === 0) {
        check('clinic has at least one bookable service', false, `"${SLUG}" has an empty catalogue — pick another CLINIC_SLUG`);
        return;
      }
    }

    await page.goto(`${BASE}/book?slug=${encodeURIComponent(SLUG)}`, { waitUntil: 'networkidle2', timeout: 45000 });

    // Step 1 → service, Step 2 → provider.
    check('service step renders on a phone viewport', await tapFirst(page, 'section[aria-labelledby="service-heading"] button'));
    check('provider step renders after tapping a service', await tapFirst(page, 'section[aria-labelledby="provider-heading"] button'));

    // Step 3 → the replacement for <input type="date">.
    await page.waitForSelector('.booking-calendar .rdp-root', { timeout: 20000 });
    check('custom calendar replaces the native date input', true);
    check('no <input type="date"> left in the flow', (await page.$$('input[type="date"]')).length === 0);

    const layout = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('.booking-calendar .rdp-day_button'));
      const sizes = buttons.map((b) => {
        const rect = b.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      });
      return {
        days: buttons.length,
        minWidth: sizes.length ? Math.min(...sizes.map((s) => s.width)) : 0,
        minHeight: sizes.length ? Math.min(...sizes.map((s) => s.height)) : 0,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    check('calendar renders day cells', layout.days >= 28, `days=${layout.days}`);
    // Height hits Apple's 44pt; width is bounded by the card layout at 375px and
    // stays above WCAG 2.5.8 (24px) with room to spare.
    check('day targets hit the mobile minimum', layout.minWidth >= MIN_TARGET_WIDTH && layout.minHeight >= 44, `${layout.minWidth}x${layout.minHeight} (needs ≥ ${MIN_TARGET_WIDTH}x44)`);
    check('no horizontal scroll at the phone viewport', layout.overflow <= 1, `overflow=${layout.overflow}px`);

    // Closures shown in the DOM must match the API that feeds them (clinic holidays
    // + provider vacations + the provider's weekly pattern). A mismatch offers a
    // patient a day the clinic is shut, or blocks a day it actually works.
    const domDays = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.booking-calendar .rdp-day:not(.rdp-outside)'))
        .map((cell) => ({
          day: cell.getAttribute('data-day') || '',
          // react-day-picker marks closures on the cell and on the real <button>.
          disabled:
            cell.classList.contains('rdp-disabled') ||
            Boolean(cell.querySelector('button')?.disabled),
        }))
        .filter((cell) => cell.day)
    );
    if (domDays.length > 0) {
      const providerId = new URL(page.url()).searchParams.get('provider') || '';
      const clinicBody = await fetch(`${BASE}/api/booking/clinic?slug=${encodeURIComponent(SLUG)}`).then((r) => r.json()).catch(() => null);
      const clinicId = clinicBody?.data?.id || '';
      const month = domDays[0].day.slice(0, 7);
      const calendarBody = clinicId
        ? await fetch(`${BASE}/api/booking/calendar?clinic_id=${clinicId}&provider_id=${encodeURIComponent(providerId)}&month=${month}`)
            .then((r) => r.json())
            .catch(() => null)
        : null;
      const closed = new Set(calendarBody?.data?.closed_days || []);
      const weekdays = calendarBody?.data?.schedule_known ? calendarBody.data.working_weekdays || [] : [];
      // LOCAL calendar date (never toISOString) — the clinic timezone is ahead of
      // UTC, so a UTC slice would test the wrong "today".
      const now = new Date();
      const todayISO = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
      const expected = new Map(
        domDays.map(({ day }) => {
          const [year, monthNumber, dayNumber] = day.split('-').map(Number);
          const weekday = new Date(year, monthNumber - 1, dayNumber).getDay();
          const shouldDisable =
            day < todayISO || closed.has(day) || (weekdays.length > 0 && !weekdays.includes(weekday));
          return [day, shouldDisable];
        })
      );
      const readDays = () =>
        page.evaluate(() =>
          Array.from(document.querySelectorAll('.booking-calendar .rdp-day:not(.rdp-outside)')).map((cell) => ({
            day: cell.getAttribute('data-day') || '',
            disabled: cell.classList.contains('rdp-disabled') || Boolean(cell.querySelector('button')?.disabled),
          }))
        );
      // The closures are fetched per month, so wait for them to land before judging
      // the DOM (otherwise the check races the network and reports phantom mismatches).
      const expectedClosed = [...expected].filter(([, disable]) => disable).map(([day]) => day);
      if (expectedClosed.length > 0) {
        await page
          .waitForFunction(
            (list) => {
              const blocked = new Set(
                Array.from(document.querySelectorAll('.booking-calendar .rdp-day.rdp-disabled')).map((cell) => cell.getAttribute('data-day'))
              );
              return list.every((day) => blocked.has(day));
            },
            { timeout: 8000 },
            expectedClosed
          )
          .catch(() => {});
      }
      const settled = await readDays();
      const mismatch = settled.filter(({ day, disabled }) => expected.get(day) !== disabled);
      check(
        'calendar closures match the clinic/provider data',
        mismatch.length === 0,
        mismatch.length
          ? `mismatch: ${mismatch.map((m) => `${m.day}=${m.disabled ? 'blocked' : 'open'}`).join(', ')}`
          : `closed=${closed.size} workingWeekdays=[${weekdays}]`
      );
    }

    const picked = await page.evaluate(() => {
      const button = document.querySelector('.booking-calendar .rdp-day:not(.rdp-disabled) .rdp-day_button');
      if (!button) return false;
      button.scrollIntoView({ block: 'center' });
      return true;
    });
    check('at least one selectable day exists', picked);

    const tapped = await tapFirst(page, '.booking-calendar .rdp-day:not(.rdp-disabled) .rdp-day_button');
    check('tapping a day registers on touch', tapped);

    await page.waitForFunction(() => /[?&]step=time/.test(window.location.search), { timeout: 15000 }).catch(() => {});
    const url = new URL(page.url());
    const chosenDate = url.searchParams.get('date') || '';
    check('tap advances to the time step', url.searchParams.get('step') === 'time', `url=${url.search} `);
    check('chosen day is kept in the URL', /^\d{4}-\d{2}-\d{2}$/.test(chosenDate), `date=${chosenDate}`);

    // The handoff that used to break on iOS: the tapped day must actually resolve
    // into times (the old flow bounced straight back to the date step / "لا توجد
    // أوقات متاحة" for a day the patient never picked).
    const timeStep = await page.evaluate(() => {
      const section = document.querySelector('section[aria-labelledby="time-heading"]');
      if (!section) return null;
      return {
        date: section.querySelector('p')?.textContent?.trim() || '',
        slots: section.querySelectorAll('div.grid button').length,
        empty: (section.textContent || '').includes('لا توجد أوقات متاحة'),
        loading: (section.textContent || '').includes('جاري تحميل الأوقات'),
      };
    });
    if (timeStep?.loading) {
      await page.waitForFunction(
        () => !document.querySelector('section[aria-labelledby="time-heading"]')?.textContent?.includes('جاري تحميل الأوقات'),
        { timeout: 15000 }
      ).catch(() => {});
    }
    const resolved = await page.evaluate(() => {
      const section = document.querySelector('section[aria-labelledby="time-heading"]');
      return {
        date: section?.querySelector('p')?.textContent?.trim() || '',
        slots: section?.querySelectorAll('div.grid button').length || 0,
        empty: (section?.textContent || '').includes('لا توجد أوقات متاحة'),
      };
    });
    check('time step shows the chosen date', resolved.date.includes('التاريخ المحدد'), resolved.date);
    check('the chosen day resolves into times', resolved.slots > 0 || resolved.empty, `slots=${resolved.slots}${resolved.empty ? ' (empty-state shown)' : ''}`);

    // Going back must show the same day selected (the bug was state loss).
    const back = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('تغيير التاريخ'));
      if (!button) return false;
      button.click();
      return true;
    });
    check('"تغيير التاريخ" sends the patient back to the calendar', back);
    if (back) {
      await page.waitForSelector('.booking-calendar .rdp-root', { timeout: 15000 });
      // Wait for the month's closures to land so the hint shows the settled label.
      await page
        .waitForFunction(
          () => !document.querySelector('.booking-calendar')?.textContent?.includes('جاري تحميل الأيام المتاحة'),
          { timeout: 8000 }
        )
        .catch(() => {});
      const kept = await page.evaluate(() => {
        const selected = document.querySelector('.booking-calendar .rdp-selected .rdp-day_button');
        const caption = document.querySelector('.booking-calendar p:last-of-type')?.textContent || '';
        return { selected: Boolean(selected), caption };
      });
      check('the chosen day stays highlighted after going back', kept.selected, kept.caption.trim());
    }
  } catch (err) {
    check('flow completed without throwing', false, err instanceof Error ? err.message : String(err));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
