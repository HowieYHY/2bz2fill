<img src="./.github/assets/images/banner.png" alt="2bz2fill: too busy to fill out the grid? Let your calendar do it." />

<div align="center">

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-orange.svg)](https://www.gnu.org/licenses/agpl-3.0)

</div>

**2bz2fill** is a group availability poll for people who are too busy to fill out a long
When2meet-style grid. Every feature is judged by one question: does it make responding take less
effort?

It is a fork of [Timeful](https://github.com/schej-it/timeful.app) (formerly Schej), an open-source
scheduling app by Jonathan Liu and contributors. Thank you to them: the poll grid, calendar
integrations, time zone handling and most of the code here are theirs.

Built with [Vue 2](https://github.com/vuejs/vue), [MongoDB](https://github.com/mongodb/mongo),
[Go](https://github.com/golang/go), and [TailwindCSS](https://github.com/tailwindlabs/tailwindcss).

## How it differs from Timeful

Timeful is a general scheduling poll. 2bz2fill keeps its features and focuses on cutting the work
of responding.

### Done

- **Fill the grid from an `.ics` file**, exported from any calendar app (Google, Outlook, Apple, a
  school or work timetable), with no account or sign-in. Busy times are shaded out, everything
  else is marked available, and you can edit before submitting.
  - The file is read in the browser and never uploaded; only the availability you submit is saved.
  - Repeating events work, including skipped and moved occurrences, and times stay correct across
    daylight-saving changes. Events marked "free" don't block time.
  - All-day events are listed for you to tick: multi-day ones (trips, leave) start ticked, single
    days (holidays, birthdays) don't.
  - Two ways in: "Upload a calendar file (.ics)" in the "How would you like to add your
    availability?" dialog, or "Autofill from a .ics file" next to the grid while editing.
  - Buffer time, working hours and connected calendars still apply; if you're signed in with
    Google, both sources block time.

  To try it, upload [`docs/sample-calendar.ics`](./docs/sample-calendar.ics) to a poll covering
  Oct 12–25, 2026, 9am–9pm, Singapore time.

- **My usual week**: mark the times you're usually free once (available or "if needed"), and every
  new poll you open arrives filled in from it, ready to check and submit.
  - Set it up on the My usual week page (`/usual-week`, also in the account menu), starting from a
    blank week or "weekdays 9am–5pm". Or, after submitting your first response, click "Save" on the
    "Save this as your usual week?" offer: the weekdays and hours that poll covers are copied in.
  - Signed in, it's saved to your account and works on every device. Signed out, it's saved in this
    browser only and moves to your account the next time you save it while signed in.
  - Times are wall-clock times in your time zone, so "9am" stays 9am across daylight-saving changes
    and in polls shown in other time zones. Works for date polls and days-of-the-week polls; not
    used for groups, sign-up forms or days-only polls.
  - Combines with everything else: connected calendars, an uploaded `.ics` file, buffer time and
    working hours still block time inside your usual free hours.
  - Your usual week is never shown to other people on a poll, only the availability you submit.

- **Fast manual tools** while filling in a poll (date and days-of-the-week polls):
  - A **Busy** brush next to Available and If needed. "Mark everything available" switches to it,
    so you can mark the times you're busy instead of the times you're free.
  - Click a day's name for **Mark day available**, **Mark day if needed**, **Clear day**, **Copy to
    all days** and **Copy to weekdays** (copies row by row, so the same times of day).
  - **Clear all**, and an **Undo** for the last quick fill (until you next drag on the grid).
  - **Reuse my answers from "…"**: copies your last response to another poll onto this one,
    wherever that poll asked about the same weekday and time; times it didn't ask about are left
    alone. Signed in, it uses the latest response on your account (`GET /user/last-response`);
    signed out, a copy of your last submitted response kept in this browser.
  - Run `server/scripts/20261012_event_responses_user_index` once on an existing database: it adds
    the index the account lookup (and the home page's event list) uses.

- **Check and confirm**: with a usual week set up, opening a poll you haven't answered (and didn't
  create) goes straight to your response, already filled in, with a note above the grid saying so.
  Check it, change anything that's different this time, and press Save. As a guest, the name and
  email you last used are remembered in this browser, so confirming is Save, then Continue.

- **A grid that works on a phone**: while filling in a poll or your usual week, a swipe scrolls the
  page even when it starts on the grid, a tap marks or clears one time, and touch and hold, then
  drag, marks a range. Rows are taller on phones (a 15-minute row is 24px instead of 15px), and a
  touch the browser cancels no longer paints anything. Mouse dragging on a computer is unchanged.

The Timeful-specific parts (their branding, blog, socials, analytics, donation links and the
When2meet converter, which runs on Timeful's own servers) have been removed.

## Features inherited from Timeful

- See when everybody's availability overlaps
- Date and time ranges, or days of the week
- Autofill from Google Calendar, Outlook, Apple Calendar or an ICS feed URL (signed-in users)
- "Available" vs. "If needed" times
- See when a subset of people are available
- Time zone support
- Email notifications and reminders
- Duplicating polls, availability groups, CSV export
- Only show responses to the event creator
- Import a poll (with its responses) from a 2bz2fill or Timeful link

## Plugin API

Browser plugins can get and set availability on a poll programmatically. See the
[Plugin API docs](./PLUGIN_API_README.md).

## Self-hosting

See the [Deployment Guide](./DEPLOYMENT.md) for Docker Compose and NixOS setup. Set `BASE_URL` in
`server/.env` to the site's public address; until it is set, emails link to the placeholder
`https://2bz2fill.example`. Analytics are off unless you set your own PostHog key or Google Tag
Manager ID in `frontend/.env` (see `frontend/.env.template`).

## License

[GNU AGPL v3](./LICENSE), the same as Timeful. If you run a modified copy as a public website, you
must offer its source code to your users; the site footer links to this repository for that reason.
