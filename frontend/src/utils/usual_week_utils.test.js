import { beforeEach, describe, expect, it } from "vitest"
import {
  dayToMinutes,
  emptyUsualWeek,
  getUsualWeek,
  getUsualWeekStatus,
  isUsualWeekEmpty,
  isValidUsualWeek,
  loadLocalUsualWeek,
  mergeSlotsIntoUsualWeek,
  minutesToDay,
  saveLocalUsualWeek,
  usualWeekStatuses,
  usualWeekToMinutes,
} from "./usual_week_utils"

const { BUSY, AVAILABLE, IF_NEEDED } = usualWeekStatuses

/** Weekdays 9am–5pm available, 5–6pm if needed, in Singapore (UTC+8, no DST) */
const officeWeek = () => {
  const week = emptyUsualWeek("Asia/Singapore")
  for (let d = 1; d <= 5; ++d) {
    week.days[d] = {
      available: [{ start: 9 * 60, end: 17 * 60 }],
      ifNeeded: [{ start: 17 * 60, end: 18 * 60 }],
    }
  }
  return week
}

const status = (week, iso, minutes) =>
  getUsualWeekStatus(
    usualWeekToMinutes(week),
    week.timezone,
    new Date(iso),
    minutes
  )

describe("day <-> minutes", () => {
  it("round-trips and merges adjacent ranges", () => {
    const day = {
      available: [
        { start: 60, end: 120 },
        { start: 120, end: 180 },
      ],
      ifNeeded: [{ start: 1380, end: 1440 }],
    }
    expect(minutesToDay(dayToMinutes(day))).toEqual({
      available: [{ start: 60, end: 180 }],
      ifNeeded: [{ start: 1380, end: 1440 }],
    })
  })

  it("lets available win over if needed where they overlap", () => {
    const day = {
      available: [{ start: 60, end: 120 }],
      ifNeeded: [{ start: 0, end: 180 }],
    }
    expect(minutesToDay(dayToMinutes(day))).toEqual({
      available: [{ start: 60, end: 120 }],
      ifNeeded: [
        { start: 0, end: 60 },
        { start: 120, end: 180 },
      ],
    })
  })
})

describe("getUsualWeekStatus", () => {
  // 2026-10-12 is a Monday
  it("is available inside the usual free time, in the usual week's timezone", () => {
    // 10:00 Singapore = 02:00 UTC
    expect(status(officeWeek(), "2026-10-12T02:00:00Z", 30)).toBe(AVAILABLE)
  })

  it("is busy outside it, and on weekends", () => {
    expect(status(officeWeek(), "2026-10-12T00:00:00Z", 30)).toBe(BUSY) // 8am
    expect(status(officeWeek(), "2026-10-11T02:00:00Z", 30)).toBe(BUSY) // Sunday 10am
  })

  it("is if needed when any part of the slot is only if needed", () => {
    expect(status(officeWeek(), "2026-10-12T09:00:00Z", 60)).toBe(IF_NEEDED) // 5–6pm
    expect(status(officeWeek(), "2026-10-12T08:30:00Z", 60)).toBe(IF_NEEDED) // 4:30–5:30pm
  })

  it("is busy when the slot runs past the free time", () => {
    expect(status(officeWeek(), "2026-10-12T09:30:00Z", 60)).toBe(BUSY) // 5:30–6:30pm
  })

  it("follows slots across midnight into the next weekday", () => {
    const week = emptyUsualWeek("Asia/Singapore")
    week.days[5].available = [{ start: 23 * 60, end: 24 * 60 }] // Fri 11pm–midnight
    week.days[6].available = [{ start: 0, end: 60 }] // Sat 0–1am
    // Fri 2026-10-16 23:30 Singapore = 15:30 UTC
    expect(status(week, "2026-10-16T15:30:00Z", 60)).toBe(AVAILABLE)
    week.days[6].available = []
    expect(status(week, "2026-10-16T15:30:00Z", 60)).toBe(BUSY)
  })

  it("keeps wall-clock times across daylight-saving changes", () => {
    const week = emptyUsualWeek("America/New_York")
    week.days[1].available = [{ start: 9 * 60, end: 10 * 60 }]
    // Monday 9am New York: UTC-4 in October, UTC-5 in November
    expect(status(week, "2026-10-26T13:00:00Z", 60)).toBe(AVAILABLE)
    expect(status(week, "2026-11-02T14:00:00Z", 60)).toBe(AVAILABLE)
    expect(status(week, "2026-11-02T13:00:00Z", 60)).toBe(BUSY)
  })

  it("uses the given fixed offset for days-of-the-week polls", () => {
    const week = officeWeek()
    const weekMinutes = usualWeekToMinutes(week)
    // Monday 2018-06-18 10:00 at UTC+8 = 02:00 UTC
    expect(
      getUsualWeekStatus(
        weekMinutes,
        week.timezone,
        new Date("2018-06-18T02:00:00Z"),
        30,
        { utcOffsetMinutes: 480 }
      )
    ).toBe(AVAILABLE)
  })
})

describe("mergeSlotsIntoUsualWeek", () => {
  const slot = (iso, statusValue, durationMinutes = 30) => ({
    startDate: new Date(iso),
    durationMinutes,
    status: statusValue,
  })

  it("replaces only the hours the poll covers and keeps the rest", () => {
    // Poll on Monday 2026-10-12, 1pm–2pm Singapore (05:00–06:00 UTC)
    const merged = mergeSlotsIntoUsualWeek(officeWeek(), [
      slot("2026-10-12T05:00:00Z", BUSY),
      slot("2026-10-12T05:30:00Z", IF_NEEDED),
    ])
    expect(merged.days[1]).toEqual({
      available: [
        { start: 9 * 60, end: 13 * 60 },
        { start: 14 * 60, end: 17 * 60 },
      ],
      ifNeeded: [
        { start: 13 * 60 + 30, end: 14 * 60 },
        { start: 17 * 60, end: 18 * 60 },
      ],
    })
    // Other days untouched
    expect(merged.days[2]).toEqual(officeWeek().days[2])
    expect(merged.days[0]).toEqual({ available: [], ifNeeded: [] })
  })

  it("uses the earliest date when a weekday appears more than once", () => {
    const merged = mergeSlotsIntoUsualWeek(emptyUsualWeek("Asia/Singapore"), [
      slot("2026-10-19T02:00:00Z", AVAILABLE), // second Monday, 10am
      slot("2026-10-12T02:00:00Z", BUSY), // first Monday, 10am
      slot("2026-10-12T03:00:00Z", AVAILABLE), // first Monday, 11am
    ])
    expect(merged.days[1].available).toEqual([{ start: 11 * 60, end: 11 * 60 + 30 }])
  })
})

describe("validation and storage", () => {
  beforeEach(() => {
    // Tests run in node: stand in for the browser's localStorage (read and written as properties)
    const storage = {}
    Object.defineProperty(storage, "removeItem", {
      value: (key) => delete storage[key],
    })
    globalThis.localStorage = storage
  })

  it("rejects malformed data", () => {
    expect(isValidUsualWeek(officeWeek())).toBe(true)
    expect(isValidUsualWeek(null)).toBe(false)
    expect(isValidUsualWeek({ timezone: "UTC", days: [] })).toBe(false)
    const bad = officeWeek()
    bad.days[1].available = [{ start: 600, end: 500 }]
    expect(isValidUsualWeek(bad)).toBe(false)
  })

  it("treats a week with no free time as empty", () => {
    expect(isUsualWeekEmpty(emptyUsualWeek())).toBe(true)
    expect(isUsualWeekEmpty(officeWeek())).toBe(false)
  })

  it("reads back what was saved locally and ignores corrupt data", () => {
    saveLocalUsualWeek(officeWeek())
    expect(loadLocalUsualWeek()).toEqual(officeWeek())
    localStorage.usualWeek = "{not json"
    expect(loadLocalUsualWeek()).toBe(null)
  })

  it("prefers the account's usual week and falls back to this browser's", () => {
    const local = officeWeek()
    saveLocalUsualWeek(local)
    expect(getUsualWeek(null)).toEqual(local)
    expect(getUsualWeek({ _id: "1" })).toEqual(local)

    const account = emptyUsualWeek("Asia/Singapore")
    account.days[0].available = [{ start: 0, end: 60 }]
    expect(getUsualWeek({ _id: "1", usualWeek: account })).toEqual(account)
  })
})
