/*
  The name and email someone last used when answering a poll as a guest, kept in this browser
  so the guest dialog can start filled in on the next poll.
*/
export const GUEST_PROFILE_STORAGE_KEY = "guestProfile"

/** Returns { name, email } from this browser, or null */
export const loadGuestProfile = () => {
  try {
    const profile = JSON.parse(localStorage[GUEST_PROFILE_STORAGE_KEY] ?? "null")
    return typeof profile?.name === "string" ? profile : null
  } catch {
    return null
  }
}

export const saveGuestProfile = ({ name, email = "" }) => {
  if (!name) return
  try {
    const previous = loadGuestProfile()
    localStorage[GUEST_PROFILE_STORAGE_KEY] = JSON.stringify({
      name,
      // Keep a remembered email when this poll didn't ask for one
      email: email || previous?.email || "",
    })
  } catch {
    // Storage unavailable: the dialog just starts empty next time
  }
}
