import ICAL from "ical.js"
import dayjs from "dayjs"
import utcPlugin from "dayjs/plugin/utc"
import timezonePlugin from "dayjs/plugin/timezone"
dayjs.extend(utcPlugin)
dayjs.extend(timezonePlugin)

/*
  Utils for reading an uploaded .ics file in the browser. Nothing here talks to the server.
*/

/** calendarId given to events that came from an uploaded .ics file */
export const ICS_UPLOAD_CALENDAR_ID = "ics-upload"

/** Safety cap on how many occurrences of a single recurring event we walk through */
const MAX_OCCURRENCES = 10000

/**
 * Parses the text of an .ics file and returns the events that overlap [timeMin, timeMax).
 * Recurring events (RRULE, RDATE, EXDATE, RECURRENCE-ID overrides) are expanded over the range.
 * Times without a time zone ("floating") are read in `timezone`.
 *
 * Returns { timedEvents, allDayEvents }:
 * - timedEvents are in the same shape as calendar events from the server
 *   ({ id, calendarId, summary, startDate, endDate, free, allDay }), so they can go through the
 *   existing autofill pipeline unchanged
 * - allDayEvents ({ id, summary, startDay, endDay, days, multiDay, free }) are returned separately
 *   so the user can choose which ones block time. endDay is exclusive.
 *
 * Throws if the text is not a calendar file.
 */
export const parseIcsEvents = (icsText, { timeMin, timeMax, timezone }) => {
  let root
  try {
    root = new ICAL.Component(ICAL.parse(icsText))
  } catch (e) {
    throw new Error("Not a valid calendar (.ics) file")
  }
  if (root.name !== "vcalendar") {
    throw new Error("Not a valid calendar (.ics) file")
  }

  timeMin = new Date(timeMin)
  timeMax = new Date(timeMax)

  // Group VEVENTs by UID so that overrides (RECURRENCE-ID) attach to their recurring event
  const mastersByUid = {}
  const exceptions = []
  for (const vevent of root.getAllSubcomponents("vevent")) {
    if (vevent.hasProperty("recurrence-id")) {
      exceptions.push(vevent)
    } else {
      const uid = vevent.getFirstPropertyValue("uid") ?? `no-uid-${Math.random()}`
      mastersByUid[uid] = new ICAL.Event(vevent)
    }
  }
  const standaloneEvents = []
  for (const vevent of exceptions) {
    const master = mastersByUid[vevent.getFirstPropertyValue("uid")]
    if (master) {
      master.relateException(vevent)
    } else {
      // Override without its recurring event, treat it as a one-off event
      standaloneEvents.push(new ICAL.Event(vevent))
    }
  }

  const timedEvents = []
  const allDayEvents = []
  const addOccurrence = (item, start, end) => {
    const occurrence = toOccurrence(item, start, end, { timeMin, timeMax, timezone })
    if (!occurrence) return
    if (occurrence.allDay) allDayEvents.push(occurrence.event)
    else timedEvents.push(occurrence.event)
  }

  for (const event of [...Object.values(mastersByUid), ...standaloneEvents]) {
    try {
      if (!event.startDate) continue

      if (!event.isRecurring()) {
        addOccurrence(event, event.startDate, event.endDate)
        continue
      }

      const iterator = event.iterator()
      let next
      let count = 0
      while ((next = iterator.next()) && count++ < MAX_OCCURRENCES) {
        const details = event.getOccurrenceDetails(next)
        // Occurrences come in order, so stop once we're past the range
        if (toJsDate(next, getTzid(event, "dtstart"), timezone) >= timeMax) break
        addOccurrence(details.item, details.startDate, details.endDate)
      }
    } catch (e) {
      // Skip events we can't read instead of failing the whole file
      console.error("Skipping unreadable calendar event", e)
    }
  }

  return { timedEvents, allDayEvents }
}

/**
 * Turns the all-day events the user picked into time blocks covering those whole days in `timezone`,
 * in the same shape as timedEvents
 */
export const allDayEventsToTimeBlocks = (allDayEvents, timezone) => {
  return allDayEvents.map((e) => ({
    id: e.id,
    calendarId: ICS_UPLOAD_CALENDAR_ID,
    summary: e.summary,
    startDate: dayjs.tz(`${e.startDay}T00:00:00`, timezone).toISOString(),
    endDate: dayjs.tz(`${e.endDay}T00:00:00`, timezone).toISOString(),
    free: false,
    allDay: true,
  }))
}

/** Returns the occurrence in our event shape, or null if it should be ignored */
const toOccurrence = (item, start, end, { timeMin, timeMax, timezone }) => {
  if (item.component.getFirstPropertyValue("status") === "CANCELLED") return null

  const summary = item.summary || "Busy"
  const free =
    String(item.component.getFirstPropertyValue("transp") ?? "").toUpperCase() ===
    "TRANSPARENT"

  if (start.isDate) {
    const startDay = toIsoDay(start)
    let endDay = end ? toIsoDay(end) : startDay
    if (endDay <= startDay) endDay = dayjs(startDay).add(1, "day").format("YYYY-MM-DD")

    const startDate = dayjs.tz(`${startDay}T00:00:00`, timezone).toDate()
    const endDate = dayjs.tz(`${endDay}T00:00:00`, timezone).toDate()
    if (endDate <= timeMin || startDate >= timeMax) return null

    const days = dayjs(endDay).diff(dayjs(startDay), "day")
    return {
      allDay: true,
      event: {
        id: `${item.uid}_${startDay}`,
        summary,
        startDay,
        endDay,
        days,
        multiDay: days > 1,
        free,
      },
    }
  }

  const startTzid = getTzid(item, "dtstart")
  const startDate = toJsDate(start, startTzid, timezone)
  const endDate = end
    ? toJsDate(end, getTzid(item, "dtend") ?? startTzid, timezone)
    : startDate
  if (endDate <= timeMin || startDate >= timeMax) return null

  return {
    allDay: false,
    event: {
      id: `${item.uid}_${startDate.toISOString()}`,
      calendarId: ICS_UPLOAD_CALENDAR_ID,
      summary,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      free,
      allDay: false,
    },
  }
}

/** Returns the TZID parameter of the given property of an event, if any */
const getTzid = (event, propName) => {
  return event.component.getFirstProperty(propName)?.getParameter("tzid") ?? null
}

/**
 * Converts an ICAL.Time to a JS Date.
 * ical.js only knows time zones defined inside the file (VTIMEZONE), and it drops the TZID on
 * expanded occurrences when the zone isn't defined there, so we resolve the zone ourselves:
 * UTC -> zone defined in the file -> IANA name from TZID -> fallbackTimezone (floating times)
 */
const toJsDate = (time, tzid, fallbackTimezone) => {
  const zone = time.zone
  if (zone === ICAL.Timezone.utcTimezone) {
    return time.toJSDate()
  }
  if (zone && zone !== ICAL.Timezone.localTimezone && zone.tzid !== "floating") {
    return new Date(time.toUnixTime() * 1000)
  }

  const wallTime =
    `${toIsoDay(time)}T${pad(time.hour)}:${pad(time.minute)}:${pad(time.second)}`
  const tz = tzid && isValidTimezone(tzid) ? tzid : fallbackTimezone
  return dayjs.tz(wallTime, tz).toDate()
}

const isValidTimezone = (tz) => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch (e) {
    return false
  }
}

const toIsoDay = (time) => `${time.year}-${pad(time.month)}-${pad(time.day)}`

const pad = (n) => String(n).padStart(2, "0")
