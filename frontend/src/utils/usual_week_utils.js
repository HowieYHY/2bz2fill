/*
  "My usual week": the times someone is usually free, saved once and used to pre-fill every new poll.

  Shape (same on the server and in localStorage):
    {
      timezone: "Asia/Singapore",   // IANA zone the times below are in
      days: [                       // 7 entries, index 0 = Sunday (like Date.getDay())
        { available: [{ start: 540, end: 1020 }], ifNeeded: [{ start: 1020, end: 1080 }] },
        ...
      ],
    }
  start/end are minutes since local midnight, end exclusive, 0 <= start < end <= 1440.

  Internally each day is expanded to one status per minute, which keeps merging and lookups simple.
*/
import dayjs from "dayjs"
import utcPlugin from "dayjs/plugin/utc"
import timezonePlugin from "dayjs/plugin/timezone"
import { _delete, put } from "./fetch_utils"

dayjs.extend(utcPlugin)
dayjs.extend(timezonePlugin)

export const MINUTES_PER_DAY = 24 * 60
export const USUAL_WEEK_STORAGE_KEY = "usualWeek"

/** Status of a minute in the usual week */
export const usualWeekStatuses = {
  BUSY: 0,
  AVAILABLE: 1,
  IF_NEEDED: 2,
}

/** Returns the browser's IANA timezone */
export const getBrowserTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone

/** Returns a usual week with no free time */
export const emptyUsualWeek = (timezone = getBrowserTimezone()) => ({
  timezone,
  days: Array.from({ length: 7 }, () => ({ available: [], ifNeeded: [] })),
})

/** Returns whether the usual week has no free time at all */
export const isUsualWeekEmpty = (usualWeek) =>
  !usualWeek ||
  usualWeek.days.every(
    (d) => d.available.length === 0 && d.ifNeeded.length === 0
  )

/** Returns whether the value has the usual week shape, so bad saved data is ignored instead of crashing */
export const isValidUsualWeek = (usualWeek) => {
  if (!usualWeek || typeof usualWeek.timezone !== "string") return false
  if (!Array.isArray(usualWeek.days) || usualWeek.days.length !== 7) return false
  const isValidRange = (r) =>
    Number.isInteger(r?.start) &&
    Number.isInteger(r?.end) &&
    r.start >= 0 &&
    r.start < r.end &&
    r.end <= MINUTES_PER_DAY
  return usualWeek.days.every(
    (d) =>
      Array.isArray(d?.available) &&
      Array.isArray(d?.ifNeeded) &&
      d.available.every(isValidRange) &&
      d.ifNeeded.every(isValidRange)
  )
}

/** Expands a day's ranges into one status per minute. Available wins where ranges overlap */
export const dayToMinutes = (day) => {
  const minutes = new Uint8Array(MINUTES_PER_DAY)
  for (const { start, end } of day.ifNeeded) {
    minutes.fill(usualWeekStatuses.IF_NEEDED, start, end)
  }
  for (const { start, end } of day.available) {
    minutes.fill(usualWeekStatuses.AVAILABLE, start, end)
  }
  return minutes
}

/** Collapses per-minute statuses back into sorted, non-overlapping ranges */
export const minutesToDay = (minutes) => {
  const day = { available: [], ifNeeded: [] }
  let start = 0
  for (let m = 1; m <= MINUTES_PER_DAY; ++m) {
    if (m < MINUTES_PER_DAY && minutes[m] === minutes[start]) continue
    if (minutes[start] === usualWeekStatuses.AVAILABLE) {
      day.available.push({ start, end: m })
    } else if (minutes[start] === usualWeekStatuses.IF_NEEDED) {
      day.ifNeeded.push({ start, end: m })
    }
    start = m
  }
  return day
}

/** Returns the usual week as 7 arrays of per-minute statuses */
export const usualWeekToMinutes = (usualWeek) => usualWeek.days.map(dayToMinutes)

/** Returns a usual week from 7 arrays of per-minute statuses */
export const minutesToUsualWeek = (weekMinutes, timezone) => ({
  timezone,
  days: weekMinutes.map(minutesToDay),
})

/**
  Returns the local weekday (0 = Sunday) and minute of the day of a date.
  utcOffsetMinutes is used instead of the usual week's timezone for days-of-the-week polls,
  whose dates are placeholders and are shown with a fixed offset.
*/
const getLocalDayMinute = (date, timezone, utcOffsetMinutes) => {
  const local =
    utcOffsetMinutes === undefined
      ? dayjs(date).tz(timezone)
      : dayjs(date).utc().add(utcOffsetMinutes, "minute")
  return { weekday: local.day(), minute: local.hour() * 60 + local.minute() }
}

/**
  Returns the usual week's status for the time slot [startDate, startDate + durationMinutes):
  AVAILABLE if every minute is available, IF_NEEDED if every minute is free but some only if needed,
  and BUSY otherwise. weekMinutes comes from usualWeekToMinutes (computed once per poll).
*/
export const getUsualWeekStatus = (
  weekMinutes,
  timezone,
  startDate,
  durationMinutes,
  options = {}
) =>
  getTemplateStatus(
    { weekMinutes, covered: null },
    timezone,
    startDate,
    durationMinutes,
    options
  )

/**
  Like getUsualWeekStatus for a template made by slotsToTemplate, which only knows some of the week:
  returns null if any minute of the slot isn't covered.
*/
export const getTemplateStatus = (
  { weekMinutes, covered },
  timezone,
  startDate,
  durationMinutes,
  { utcOffsetMinutes } = {}
) => {
  let { weekday, minute } = getLocalDayMinute(
    startDate,
    timezone,
    utcOffsetMinutes
  )
  let status = usualWeekStatuses.AVAILABLE
  for (let i = 0; i < durationMinutes; ++i) {
    if (covered && !covered[weekday][minute]) return null
    const s = weekMinutes[weekday][minute]
    if (s === usualWeekStatuses.BUSY) return usualWeekStatuses.BUSY
    if (s === usualWeekStatuses.IF_NEEDED) status = usualWeekStatuses.IF_NEEDED
    if (++minute === MINUTES_PER_DAY) {
      minute = 0
      weekday = (weekday + 1) % 7
    }
  }
  return status
}

/**
  Returns the usual week updated with a poll response, replacing only the weekdays and hours the poll covers.
  slots: [{ startDate, durationMinutes, status }] for every slot of the poll, status from usualWeekStatuses.
  If the poll covers the same weekday more than once, the earliest date wins so a two-week poll
  doesn't mix its weeks together.
*/
export const mergeSlotsIntoUsualWeek = (usualWeek, slots, options = {}) => {
  const { timezone } = usualWeek
  const weekMinutes = usualWeekToMinutes(usualWeek)
  writeSlots(weekMinutes, null, slots, timezone, options)
  return minutesToUsualWeek(weekMinutes, timezone)
}

/**
  Returns a template of one poll response: { weekMinutes, covered }, where covered marks the
  weekday minutes the poll asked about. Read it with getTemplateStatus.
*/
export const slotsToTemplate = (slots, timezone, options = {}) => {
  const weekMinutes = Array.from({ length: 7 }, () => new Uint8Array(MINUTES_PER_DAY))
  const covered = Array.from({ length: 7 }, () => new Uint8Array(MINUTES_PER_DAY))
  writeSlots(weekMinutes, covered, slots, timezone, options)
  return { weekMinutes, covered }
}

/** Writes slot statuses into per-minute weekdays (and marks them covered), earliest date per weekday winning */
const writeSlots = (
  weekMinutes,
  covered,
  slots,
  timezone,
  { utcOffsetMinutes } = {}
) => {
  // Find the first local date seen for each weekday
  const dateForWeekday = {}
  const located = slots.map((slot) => {
    const local =
      utcOffsetMinutes === undefined
        ? dayjs(slot.startDate).tz(timezone)
        : dayjs(slot.startDate).utc().add(utcOffsetMinutes, "minute")
    const dateKey = local.format("YYYY-MM-DD")
    const weekday = local.day()
    if (!(weekday in dateForWeekday) || dateKey < dateForWeekday[weekday]) {
      dateForWeekday[weekday] = dateKey
    }
    return { ...slot, weekday, dateKey, minute: local.hour() * 60 + local.minute() }
  })

  for (const slot of located) {
    if (dateForWeekday[slot.weekday] !== slot.dateKey) continue
    const end = Math.min(slot.minute + slot.durationMinutes, MINUTES_PER_DAY)
    weekMinutes[slot.weekday].fill(slot.status, slot.minute, end)
    covered?.[slot.weekday].fill(1, slot.minute, end)
  }
}

// ---------------------------------------------------------------------------
// Storage: on the account when signed in, otherwise in this browser
// ---------------------------------------------------------------------------

/** Returns the usual week saved in this browser, or null */
export const loadLocalUsualWeek = () => {
  try {
    const usualWeek = JSON.parse(localStorage[USUAL_WEEK_STORAGE_KEY] ?? "null")
    return isValidUsualWeek(usualWeek) ? usualWeek : null
  } catch {
    return null
  }
}

export const saveLocalUsualWeek = (usualWeek) => {
  localStorage[USUAL_WEEK_STORAGE_KEY] = JSON.stringify(usualWeek)
}

export const clearLocalUsualWeek = () => {
  localStorage.removeItem(USUAL_WEEK_STORAGE_KEY)
}

/**
  Returns the usual week to use: the account's when signed in, falling back to one saved in this browser
  (e.g. set up before signing in). Returns null if there is none or it has no free time.
*/
export const getUsualWeek = (authUser) => {
  const usualWeek = isValidUsualWeek(authUser?.usualWeek)
    ? authUser.usualWeek
    : loadLocalUsualWeek()
  return isUsualWeekEmpty(usualWeek) ? null : usualWeek
}

/**
  Saves the usual week to the account if signed in (and clears any copy in this browser), otherwise to this browser.
  Returns the updated authUser, or null if not signed in.
*/
export const saveUsualWeek = async (authUser, usualWeek) => {
  if (authUser) {
    await put("/user/usual-week", usualWeek)
    clearLocalUsualWeek()
    return { ...authUser, usualWeek }
  }
  saveLocalUsualWeek(usualWeek)
  return null
}

/** Deletes the usual week from the account (if signed in) and from this browser */
export const deleteUsualWeek = async (authUser) => {
  if (authUser) {
    await _delete("/user/usual-week")
  }
  clearLocalUsualWeek()
  if (!authUser) return null
  const { usualWeek, ...rest } = authUser
  return rest
}
