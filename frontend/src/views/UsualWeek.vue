<template>
  <div class="tw-mx-auto tw-mb-12 tw-mt-5 tw-max-w-3xl">
    <div class="tw-flex tw-flex-col tw-gap-6 tw-p-4">
      <!-- Heading -->
      <div class="tw-flex tw-flex-col tw-gap-2">
        <h1
          class="tw-text-xl tw-font-medium tw-text-dark-green sm:tw-text-2xl"
        >
          My usual week
        </h1>
        <p class="tw-max-w-prose tw-text-sm tw-text-very-dark-gray sm:tw-text-base">
          Mark the times you're usually free. Every new poll you open arrives
          filled in from this, and you can still change each one before you
          submit.
        </p>
      </div>

      <!-- Where it's saved and which timezone -->
      <div class="tw-flex tw-flex-col tw-gap-1 tw-text-sm tw-text-dark-gray">
        <div class="tw-flex tw-items-start tw-gap-2">
          <v-icon small color="#6B6B6B" class="tw-mt-px">mdi-earth</v-icon>
          <span>
            Times are in {{ timezoneName(timezone) }}.
            <template v-if="timezone !== browserTimezone">
              This device is set to {{ timezoneName(browserTimezone) }}.
              <button
                type="button"
                class="tw-text-green tw-underline tw-underline-offset-2 hover:tw-text-dark-green"
                @click="timezone = browserTimezone"
              >
                Use that instead
              </button>
            </template>
          </span>
        </div>
        <div class="tw-flex tw-items-start tw-gap-2">
          <v-icon small color="#6B6B6B" class="tw-mt-px">{{
            authUser ? "mdi-account-check-outline" : "mdi-laptop"
          }}</v-icon>
          <span v-if="authUser && onlyInBrowser">
            Saved in this browser only. Save it to keep it on your account and
            use it on any device you sign in on.
          </span>
          <span v-else-if="authUser">
            Saved to your account, so it works on any device you sign in on.
          </span>
          <span v-else>
            Saved in this browser only.
            <router-link
              :to="{ name: 'sign-in' }"
              class="tw-text-green tw-underline tw-underline-offset-2 hover:tw-text-dark-green"
              >Sign in</router-link
            >
            to use it on your other devices too.
          </span>
        </div>
      </div>

      <!-- Paint controls -->
      <div
        class="tw-flex tw-flex-col tw-gap-3 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between"
      >
        <AvailabilityTypeToggle
          v-model="availabilityType"
          class="tw-w-full sm:tw-w-72"
        />
        <div class="tw-flex tw-items-center tw-gap-4 tw-text-xs tw-text-very-dark-gray">
          <span class="tw-flex tw-items-center tw-gap-1.5">
            <span class="tw-h-3 tw-w-3 tw-rounded-sm tw-border tw-border-gray tw-bg-[#00994C77]"></span>
            Available
          </span>
          <span class="tw-flex tw-items-center tw-gap-1.5">
            <span class="tw-h-3 tw-w-3 tw-rounded-sm tw-border tw-border-gray tw-bg-yellow"></span>
            If needed
          </span>
          <span class="tw-flex tw-items-center tw-gap-1.5">
            <span class="tw-h-3 tw-w-3 tw-rounded-sm tw-border tw-border-gray tw-bg-[#E523232D]"></span>
            Busy
          </span>
        </div>
      </div>

      <!-- Grid -->
      <div class="tw-flex tw-flex-col tw-gap-2">
        <div
          class="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-x-4 tw-gap-y-1 tw-text-xs tw-text-dark-gray"
        >
          <span>Drag across the grid to mark times. Drag over marked times to clear them.</span>
          <button
            v-if="gridEmpty"
            type="button"
            class="tw-flex tw-items-center tw-gap-1 tw-font-medium tw-text-green hover:tw-text-dark-green"
            @click="fillOfficeHours"
          >
            <v-icon x-small color="#00994C">mdi-briefcase-outline</v-icon>
            Start from weekdays 9am–5pm
          </button>
          <button
            v-else
            type="button"
            class="tw-flex tw-items-center tw-gap-1 tw-text-dark-gray hover:tw-text-black"
            @click="clearGrid"
          >
            <v-icon x-small color="#6B6B6B">mdi-eraser</v-icon>
            Clear grid
          </button>
        </div>
        <UsualWeekGrid
          v-model="weekMinutes"
          :availabilityType="availabilityType"
          :rowHeight="isPhone ? 16 : 18"
        />
      </div>

      <!-- Actions -->
      <div
        class="tw-sticky tw-bottom-0 tw-z-10 tw--mx-4 tw-flex tw-flex-wrap tw-items-center tw-gap-2 tw-border-t tw-border-light-gray-stroke tw-bg-white tw-px-4 tw-py-3"
      >
        <v-btn
          color="primary"
          :disabled="!(unsavedChanges || onlyInBrowser) || gridEmpty"
          :loading="saving"
          @click="save"
        >
          Save usual week
        </v-btn>
        <v-btn v-if="unsavedChanges" text @click="discardChanges">
          Discard changes
        </v-btn>
        <span
          v-else-if="savedUsualWeek && !onlyInBrowser"
          class="tw-flex tw-items-center tw-gap-1 tw-text-sm tw-text-dark-gray"
        >
          <v-icon small color="#00994C">mdi-check</v-icon>
          Saved
        </span>
        <v-spacer />
        <v-btn
          v-if="savedUsualWeek"
          text
          class="tw-text-red"
          @click="deleteDialog = true"
        >
          Delete usual week
        </v-btn>
      </div>
    </div>

    <v-dialog v-model="deleteDialog" width="400">
      <v-card>
        <v-card-title>Delete your usual week?</v-card-title>
        <v-card-text class="tw-text-sm tw-text-dark-gray">
          New polls won't be filled in for you any more. Responses you've
          already submitted stay as they are.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteDialog = false">Cancel</v-btn>
          <v-btn text color="error" :loading="deleting" @click="deleteWeek">
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script>
import { mapActions, mapGetters, mapState } from "vuex"
import { isPhone } from "@/utils"
import { availabilityTypes } from "@/constants"
import {
  emptyUsualWeek,
  getBrowserTimezone,
  minutesToUsualWeek,
  usualWeekStatuses,
  usualWeekToMinutes,
} from "@/utils/usual_week_utils"
import AvailabilityTypeToggle from "@/components/schedule_overlap/AvailabilityTypeToggle.vue"
import UsualWeekGrid from "@/components/usual_week/UsualWeekGrid.vue"

export default {
  name: "UsualWeek",

  metaInfo: {
    title: "My usual week - 2bz2fill",
  },

  components: { AvailabilityTypeToggle, UsualWeekGrid },

  data() {
    return {
      availabilityType: availabilityTypes.AVAILABLE,
      weekMinutes: [],
      timezone: getBrowserTimezone(),
      browserTimezone: getBrowserTimezone(),
      savedSnapshot: "", // JSON of the last saved state, to detect unsaved changes
      saving: false,
      deleteDialog: false,
      deleting: false,
    }
  },

  computed: {
    ...mapState(["authUser"]),
    ...mapGetters({ savedUsualWeek: "usualWeek" }),
    isPhone() {
      return isPhone(this.$vuetify)
    },
    currentUsualWeek() {
      return minutesToUsualWeek(this.weekMinutes, this.timezone)
    },
    unsavedChanges() {
      return JSON.stringify(this.currentUsualWeek) !== this.savedSnapshot
    },
    /** Signed in, but the usual week shown was set up in this browser before signing in */
    onlyInBrowser() {
      return Boolean(
        this.authUser && !this.authUser.usualWeek && this.savedUsualWeek
      )
    },
    gridEmpty() {
      return this.weekMinutes.every((day) =>
        day.every((s) => s === usualWeekStatuses.BUSY)
      )
    },
  },

  methods: {
    ...mapActions(["showInfo", "showError", "saveUsualWeek", "deleteUsualWeek"]),
    /** Loads the saved usual week (or an empty one) into the editor */
    load() {
      const usualWeek = this.savedUsualWeek ?? emptyUsualWeek()
      this.weekMinutes = usualWeekToMinutes(usualWeek)
      this.timezone = usualWeek.timezone
      this.savedSnapshot = this.savedUsualWeek
        ? JSON.stringify(minutesToUsualWeek(this.weekMinutes, this.timezone))
        : JSON.stringify(emptyUsualWeek(this.timezone))
    },
    timezoneName(timezone) {
      try {
        const name = new Intl.DateTimeFormat(undefined, {
          timeZone: timezone,
          timeZoneName: "long",
        })
          .formatToParts(new Date())
          .find((p) => p.type === "timeZoneName")?.value
        return name && name !== timezone ? `${name} (${timezone})` : timezone
      } catch {
        return timezone
      }
    },
    fillOfficeHours() {
      this.weekMinutes = this.weekMinutes.map((day, weekday) => {
        const next = day.slice()
        if (weekday >= 1 && weekday <= 5) {
          next.fill(usualWeekStatuses.AVAILABLE, 9 * 60, 17 * 60)
        }
        return next
      })
    },
    clearGrid() {
      this.weekMinutes = usualWeekToMinutes(emptyUsualWeek(this.timezone))
    },
    discardChanges() {
      this.load()
    },
    async save() {
      this.saving = true
      try {
        const usualWeek = this.currentUsualWeek
        await this.saveUsualWeek(usualWeek)
        this.savedSnapshot = JSON.stringify(usualWeek)
        this.showInfo("Usual week saved. New polls will arrive filled in.")
      } catch (err) {
        this.showError(
          "Couldn't save your usual week. Check your connection and try again."
        )
      } finally {
        this.saving = false
      }
    },
    async deleteWeek() {
      this.deleting = true
      try {
        await this.deleteUsualWeek()
        this.deleteDialog = false
        this.load()
        this.showInfo("Usual week deleted.")
      } catch (err) {
        this.showError(
          "Couldn't delete your usual week. Check your connection and try again."
        )
      } finally {
        this.deleting = false
      }
    },
    /** Warns before closing the tab with unsaved changes */
    onBeforeUnload(e) {
      if (!this.unsavedChanges) return
      e.preventDefault()
      e.returnValue = ""
    },
  },

  beforeRouteLeave(to, from, next) {
    if (
      this.unsavedChanges &&
      !window.confirm("You have unsaved changes to your usual week. Leave anyway?")
    ) {
      next(false)
    } else {
      next()
    }
  },

  created() {
    this.load()
  },

  mounted() {
    window.addEventListener("beforeunload", this.onBeforeUnload)
  },

  beforeDestroy() {
    window.removeEventListener("beforeunload", this.onBeforeUnload)
  },
}
</script>
