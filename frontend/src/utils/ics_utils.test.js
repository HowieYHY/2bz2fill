import { describe, expect, it } from "vitest"
import {
  allDayEventsToTimeBlocks,
  ICS_UPLOAD_CALENDAR_ID,
  parseIcsEvents,
} from "./ics_utils"

/** Wraps VEVENT/VTIMEZONE lines in a VCALENDAR */
const ics = (...lines) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", ...lines, "END:VCALENDAR"].join(
    "\r\n"
  )

const NEW_YORK_VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:America/New_York",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
]

const weeklyLecture = [
  "BEGIN:VEVENT",
  "UID:lecture",
  "SUMMARY:Lecture",
  "DTSTART;TZID=America/New_York:20260915T100000",
  "DTEND;TZID=America/New_York:20260915T120000",
  "RRULE:FREQ=WEEKLY;BYDAY=TU",
  "END:VEVENT",
]

// Poll covering the week before and after DST ends in New York (Sunday Nov 1, 2026)
const range = {
  timeMin: "2026-10-26T00:00:00Z",
  timeMax: "2026-11-08T00:00:00Z",
  timezone: "America/New_York",
}

const startTimes = (events) => events.map((e) => e.startDate)

describe("parseIcsEvents", () => {
  describe.each([
    ["with a VTIMEZONE in the file", NEW_YORK_VTIMEZONE],
    ["with only a TZID name", []],
  ])("weekly recurring event %s", (_, vtimezone) => {
    it("is busy on every matching day in range and keeps 10am local across DST", () => {
      const { timedEvents } = parseIcsEvents(ics(...vtimezone, ...weeklyLecture), range)

      expect(startTimes(timedEvents)).toEqual([
        "2026-10-27T14:00:00.000Z", // 10am EDT (UTC-4)
        "2026-11-03T15:00:00.000Z", // 10am EST (UTC-5)
      ])
      expect(timedEvents[1].endDate).toBe("2026-11-03T17:00:00.000Z")
      expect(timedEvents[0]).toMatchObject({
        calendarId: ICS_UPLOAD_CALENDAR_ID,
        summary: "Lecture",
        free: false,
        allDay: false,
      })
    })
  })

  it("skips EXDATEs and applies RECURRENCE-ID overrides", () => {
    const { timedEvents } = parseIcsEvents(
      ics(
        "BEGIN:VEVENT",
        "UID:class",
        "SUMMARY:Class",
        "DTSTART;TZID=America/New_York:20261026T090000",
        "DTEND;TZID=America/New_York:20261026T100000",
        "RRULE:FREQ=DAILY;COUNT=5",
        "EXDATE;TZID=America/New_York:20261027T090000",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:class",
        "RECURRENCE-ID;TZID=America/New_York:20261028T090000",
        "SUMMARY:Class (moved)",
        "DTSTART;TZID=America/New_York:20261028T150000",
        "DTEND;TZID=America/New_York:20261028T160000",
        "END:VEVENT"
      ),
      range
    )

    expect(timedEvents.map((e) => [e.startDate, e.summary])).toEqual([
      ["2026-10-26T13:00:00.000Z", "Class"],
      ["2026-10-28T19:00:00.000Z", "Class (moved)"],
      ["2026-10-29T13:00:00.000Z", "Class"],
      ["2026-10-30T13:00:00.000Z", "Class"],
    ])
  })

  it("reads floating times in the given time zone", () => {
    const { timedEvents } = parseIcsEvents(
      ics(
        "BEGIN:VEVENT",
        "UID:floating",
        "DTSTART:20261028T090000",
        "DTEND:20261028T100000",
        "END:VEVENT"
      ),
      { ...range, timezone: "Asia/Singapore" }
    )

    expect(startTimes(timedEvents)).toEqual(["2026-10-28T01:00:00.000Z"])
  })

  it("reads UTC times and custom time zones defined in the file", () => {
    const { timedEvents } = parseIcsEvents(
      ics(
        "BEGIN:VTIMEZONE",
        "TZID:My Custom Zone",
        "BEGIN:STANDARD",
        "DTSTART:19700101T000000",
        "TZOFFSETFROM:+0530",
        "TZOFFSETTO:+0530",
        "END:STANDARD",
        "END:VTIMEZONE",
        "BEGIN:VEVENT",
        "UID:custom",
        "DTSTART;TZID=My Custom Zone:20261028T100000",
        "DTEND;TZID=My Custom Zone:20261028T110000",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:utc",
        "DTSTART:20261029T120000Z",
        "DTEND:20261029T130000Z",
        "END:VEVENT"
      ),
      range
    )

    expect(startTimes(timedEvents)).toEqual([
      "2026-10-28T04:30:00.000Z",
      "2026-10-29T12:00:00.000Z",
    ])
  })

  it("uses DURATION when there is no DTEND", () => {
    const { timedEvents } = parseIcsEvents(
      ics(
        "BEGIN:VEVENT",
        "UID:duration",
        "DTSTART:20261028T120000Z",
        "DURATION:PT90M",
        "END:VEVENT"
      ),
      range
    )

    expect(timedEvents[0].endDate).toBe("2026-10-28T13:30:00.000Z")
  })

  it("marks transparent events as free and drops cancelled events", () => {
    const { timedEvents } = parseIcsEvents(
      ics(
        "BEGIN:VEVENT",
        "UID:free",
        "DTSTART:20261028T120000Z",
        "DTEND:20261028T130000Z",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:cancelled",
        "DTSTART:20261028T140000Z",
        "DTEND:20261028T150000Z",
        "STATUS:CANCELLED",
        "END:VEVENT"
      ),
      range
    )

    expect(timedEvents).toHaveLength(1)
    expect(timedEvents[0].free).toBe(true)
  })

  it("ignores events outside the range", () => {
    const { timedEvents, allDayEvents } = parseIcsEvents(
      ics(
        "BEGIN:VEVENT",
        "UID:old",
        "DTSTART:20250101T120000Z",
        "DTEND:20250101T130000Z",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:later",
        "DTSTART;VALUE=DATE:20261201",
        "DTEND;VALUE=DATE:20261202",
        "END:VEVENT"
      ),
      range
    )

    expect(timedEvents).toEqual([])
    expect(allDayEvents).toEqual([])
  })

  it("returns all-day events separately and flags multi-day ones", () => {
    const { timedEvents, allDayEvents } = parseIcsEvents(
      ics(
        "BEGIN:VEVENT",
        "UID:holiday",
        "SUMMARY:Holiday",
        "DTSTART;VALUE=DATE:20261027",
        "DTEND;VALUE=DATE:20261028",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:trip",
        "SUMMARY:Japan trip",
        "DTSTART;VALUE=DATE:20261030",
        "DTEND;VALUE=DATE:20261104",
        "END:VEVENT"
      ),
      range
    )

    expect(timedEvents).toEqual([])
    expect(allDayEvents).toEqual([
      {
        id: "holiday_2026-10-27",
        summary: "Holiday",
        startDay: "2026-10-27",
        endDay: "2026-10-28",
        days: 1,
        multiDay: false,
        free: true,
      },
      {
        id: "trip_2026-10-30",
        summary: "Japan trip",
        startDay: "2026-10-30",
        endDay: "2026-11-04",
        days: 5,
        multiDay: true,
        free: false,
      },
    ])
  })

  it("expands recurring all-day events", () => {
    const { allDayEvents } = parseIcsEvents(
      ics(
        "BEGIN:VEVENT",
        "UID:gym",
        "DTSTART;VALUE=DATE:20260101",
        "RRULE:FREQ=WEEKLY;BYDAY=SA",
        "END:VEVENT"
      ),
      range
    )

    expect(allDayEvents.map((e) => e.startDay)).toEqual(["2026-10-31", "2026-11-07"])
  })

  it("throws on files that aren't calendars", () => {
    expect(() => parseIcsEvents("hello world", range)).toThrow()
    expect(() =>
      parseIcsEvents("BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD", range)
    ).toThrow()
  })
})

describe("allDayEventsToTimeBlocks", () => {
  it("blocks whole local days in the given time zone", () => {
    const blocks = allDayEventsToTimeBlocks(
      [{ id: "trip_2026-10-30", summary: "Japan trip", startDay: "2026-10-30", endDay: "2026-11-04" }],
      "Asia/Singapore"
    )

    expect(blocks).toEqual([
      {
        id: "trip_2026-10-30",
        calendarId: ICS_UPLOAD_CALENDAR_ID,
        summary: "Japan trip",
        startDate: "2026-10-29T16:00:00.000Z", // Oct 30, 00:00 in Singapore
        endDate: "2026-11-03T16:00:00.000Z", // Nov 4, 00:00 in Singapore
        free: false,
        allDay: true,
      },
    ])
  })
})
