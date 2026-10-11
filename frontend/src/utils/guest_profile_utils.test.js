import { beforeEach, describe, expect, it } from "vitest"
import { loadGuestProfile, saveGuestProfile } from "./guest_profile_utils"

describe("guest profile", () => {
  beforeEach(() => {
    // Tests run in node: stand in for the browser's localStorage (read and written as properties)
    globalThis.localStorage = {}
  })

  it("remembers the last name and email used", () => {
    expect(loadGuestProfile()).toBe(null)
    saveGuestProfile({ name: "Sam", email: "sam@example.com" })
    expect(loadGuestProfile()).toEqual({ name: "Sam", email: "sam@example.com" })
  })

  it("keeps a remembered email when a poll didn't ask for one", () => {
    saveGuestProfile({ name: "Sam", email: "sam@example.com" })
    saveGuestProfile({ name: "Sammy", email: "" })
    expect(loadGuestProfile()).toEqual({ name: "Sammy", email: "sam@example.com" })
  })

  it("ignores an empty name and corrupt data", () => {
    saveGuestProfile({ name: "" })
    expect(loadGuestProfile()).toBe(null)
    localStorage.guestProfile = "{oops"
    expect(loadGuestProfile()).toBe(null)
  })
})
