/*
  "Reuse your last response": copies the availability from the last poll someone answered onto the poll
  they're filling in now, matched by weekday and time of day.

  A previous response is kept as { eventId, eventName, isDow, slots }, where slots lists every slot of that
  poll as { startDate (ms), durationMinutes, status } (status from usualWeekStatuses), so it knows which
  hours the poll asked about as well as the answers. Signed in, it comes from the account's latest
  response (GET /user/last-response); signed out, from a copy saved in this browser on submit.
*/
import { get } from "./fetch_utils"
import { eventTypes } from "@/constants"
import { usualWeekStatuses } from "./usual_week_utils"

export const LAST_RESPONSE_STORAGE_KEY = "lastResponse"
const DEFAULT_TIME_INCREMENT = 15

/** Returns the slots of a poll with the response's status for each, from /user/last-response data */
export const responseToSlots = ({ event, availability = [], ifNeeded = [] }) => {
  const available = new Set(availability.map((d) => new Date(d).getTime()))
  const maybe = new Set(ifNeeded.map((d) => new Date(d).getTime()))
  const durationMinutes = event.timeIncrement || DEFAULT_TIME_INCREMENT

  let starts = []
  if (event.hasSpecificTimes && event.times?.length > 0) {
    starts = event.times.map((t) => new Date(t).getTime())
  } else {
    const slotsPerDay = Math.round((event.duration * 60) / durationMinutes)
    for (const date of event.dates) {
      const start = new Date(date).getTime()
      for (let i = 0; i < slotsPerDay; ++i) {
        starts.push(start + i * durationMinutes * 60 * 1000)
      }
    }
  }

  return starts.map((startDate) => ({
    startDate,
    durationMinutes,
    status: available.has(startDate)
      ? usualWeekStatuses.AVAILABLE
      : maybe.has(startDate)
      ? usualWeekStatuses.IF_NEEDED
      : usualWeekStatuses.BUSY,
  }))
}

/** Returns the last response saved in this browser, or null */
export const loadLocalLastResponse = () => {
  try {
    const saved = JSON.parse(localStorage[LAST_RESPONSE_STORAGE_KEY] ?? "null")
    return Array.isArray(saved?.slots) ? saved : null
  } catch {
    return null
  }
}

/** Saves a submitted response in this browser, for reusing on the next poll */
export const saveLocalLastResponse = (lastResponse) => {
  try {
    localStorage[LAST_RESPONSE_STORAGE_KEY] = JSON.stringify(lastResponse)
  } catch {
    // Storage unavailable or full: reusing the last response just won't be offered
  }
}

/**
  Returns the last response to offer on the poll with id currentEventId, or null:
  the account's latest response when signed in (falling back to this browser's), otherwise this browser's.
*/
export const fetchLastResponse = async (authUser, currentEventId) => {
  const local = loadLocalLastResponse()
  const usable = (r) => r && r.eventId !== currentEventId && r.slots.length > 0 ? r : null

  if (authUser) {
    try {
      const res = await get(
        `/user/last-response?excludeEventId=${encodeURIComponent(currentEventId)}`
      )
      if (res?.event) {
        return usable({
          eventId: res.event._id,
          eventName: res.event.name,
          isDow: res.event.type === eventTypes.DOW,
          slots: responseToSlots(res),
        })
      }
    } catch {
      // Fall back to this browser's copy
    }
  }
  return usable(local)
}
