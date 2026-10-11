import { describe, expect, it } from "vitest"
import { responseToSlots } from "./last_response_utils"
import {
  getTemplateStatus,
  slotsToTemplate,
  usualWeekStatuses,
} from "./usual_week_utils"

const { BUSY, AVAILABLE, IF_NEEDED } = usualWeekStatuses
const TZ = "Asia/Singapore" // UTC+8, no DST

describe("responseToSlots", () => {
  it("lists every slot of a date poll with the response's status", () => {
    // Mon 2026-10-05, 9–10am Singapore (01:00–02:00 UTC), 30-minute slots
    const slots = responseToSlots({
      event: { dates: ["2026-10-05T01:00:00Z"], duration: 1, timeIncrement: 30 },
      availability: ["2026-10-05T01:00:00Z"],
      ifNeeded: ["2026-10-05T01:30:00Z"],
    })
    expect(slots).toEqual([
      { startDate: Date.parse("2026-10-05T01:00:00Z"), durationMinutes: 30, status: AVAILABLE },
      { startDate: Date.parse("2026-10-05T01:30:00Z"), durationMinutes: 30, status: IF_NEEDED },
    ])
  })

  it("defaults to 15-minute slots and uses the times of a specific-times poll", () => {
    const slots = responseToSlots({
      event: {
        dates: ["2026-10-05T01:00:00Z"],
        duration: 8,
        hasSpecificTimes: true,
        times: ["2026-10-05T03:00:00Z"],
      },
      availability: [],
    })
    expect(slots).toEqual([
      { startDate: Date.parse("2026-10-05T03:00:00Z"), durationMinutes: 15, status: BUSY },
    ])
  })
})

describe("reusing a response on another poll", () => {
  // Last poll: Mon 5 and Tue 6 Oct, 9am–12pm. Free Monday 10–11, busy otherwise.
  const lastPollSlots = responseToSlots({
    event: {
      dates: ["2026-10-05T01:00:00Z", "2026-10-06T01:00:00Z"],
      duration: 3,
      timeIncrement: 15,
    },
    availability: [
      "2026-10-05T02:00:00Z",
      "2026-10-05T02:15:00Z",
      "2026-10-05T02:30:00Z",
      "2026-10-05T02:45:00Z",
    ],
  })
  const template = slotsToTemplate(lastPollSlots, TZ)
  const status = (iso, minutes = 15) =>
    getTemplateStatus(template, TZ, new Date(iso), minutes)

  it("copies answers to the same weekday and time a week later", () => {
    expect(status("2026-10-12T02:00:00Z")).toBe(AVAILABLE) // Mon 10am
    expect(status("2026-10-12T01:00:00Z")).toBe(BUSY) // Mon 9am, answered busy
    expect(status("2026-10-13T02:00:00Z")).toBe(BUSY) // Tue 10am
  })

  it("leaves times the last poll didn't ask about alone", () => {
    expect(status("2026-10-12T04:00:00Z")).toBe(null) // Mon 12pm
    expect(status("2026-10-14T02:00:00Z")).toBe(null) // Wednesday
    expect(status("2026-10-12T00:45:00Z", 30)).toBe(null) // Mon 8:45–9:15, half asked about
  })

  it("treats a slot that was partly busy as busy, even if the rest wasn't asked about", () => {
    expect(status("2026-10-12T03:45:00Z", 30)).toBe(BUSY) // Mon 11:45–12:15
  })

  it("matches a days-of-the-week poll by weekday", () => {
    const dowSlots = responseToSlots({
      // Placeholder Monday 2018-06-18, 9–10am at UTC+8
      event: { dates: ["2018-06-18T01:00:00Z"], duration: 1, timeIncrement: 60 },
      availability: ["2018-06-18T01:00:00Z"],
    })
    const dowTemplate = slotsToTemplate(dowSlots, TZ, { utcOffsetMinutes: 480 })
    expect(getTemplateStatus(dowTemplate, TZ, new Date("2026-10-12T01:00:00Z"), 15)).toBe(AVAILABLE)
  })
})
