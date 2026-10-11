<template>
  <div class="tw-flex tw-flex-col tw-gap-5">
    <div class="tw-flex tw-flex-col tw-gap-2">
      <div class="tw-text-md tw-font-medium">
        {{
          step === steps.ALL_DAY
            ? "Any all-day events that mean you're busy?"
            : "Upload a calendar file (.ics)"
        }}
      </div>
      <div class="tw-text-sm tw-text-very-dark-gray">
        <template v-if="step === steps.ALL_DAY">
          These all-day events fall on this poll's dates. Tick the ones that
          mean you're unavailable, like trips or leave.
        </template>
        <template v-else>
          Your busy times will be shaded out and everything else marked
          available. You can edit it before submitting.
        </template>
      </div>
    </div>

    <!-- Pick a file -->
    <template v-if="step === steps.PICK">
      <label
        class="tw-flex tw-cursor-pointer tw-flex-col tw-items-center tw-gap-2 tw-rounded-lg tw-border-2 tw-border-dashed tw-px-4 tw-py-8 tw-text-center tw-transition-colors"
        :class="
          dragOver
            ? 'tw-border-green tw-bg-ligher-green'
            : 'tw-border-gray hover:tw-border-dark-gray'
        "
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop.prevent="onDrop"
      >
        <v-progress-circular v-if="loading" indeterminate color="primary" />
        <template v-else>
          <v-icon large color="#4F4F4F">mdi-calendar-import</v-icon>
          <div class="tw-text-sm">
            <span class="tw-font-medium tw-text-green">Choose a file</span> or
            drag it here
          </div>
        </template>
        <input
          ref="fileInput"
          type="file"
          accept=".ics,text/calendar"
          class="tw-hidden"
          @change="onFileSelected"
        />
      </label>

      <div v-if="error" class="tw-text-sm tw-text-red">{{ error }}</div>

      <div class="tw-text-xs tw-text-dark-gray">
        <v-icon x-small class="tw-mr-1">mdi-lock</v-icon>
        Your file stays on this device. Only the availability you submit is
        saved.
      </div>

      <ExpandableSection
        label="How do I get a .ics file?"
        label-class="tw-text-sm"
        v-model="showHelp"
      >
        <ul
          class="tw-flex tw-flex-col tw-gap-1.5 tw-pl-4 tw-pt-2 tw-text-xs tw-text-very-dark-gray"
        >
          <li>
            <span class="tw-font-medium">Google Calendar:</span> Settings →
            Import &amp; export → Export. Unzip the download and upload the
            calendar you want.
          </li>
          <li>
            <span class="tw-font-medium">Outlook:</span> File → Save Calendar
            (desktop app).
          </li>
          <li>
            <span class="tw-font-medium">Apple Calendar:</span> select the
            calendar, then File → Export → Export.
          </li>
          <li>
            <span class="tw-font-medium">School or work timetables:</span>
            look for "Export", "Download .ics" or "Add to calendar".
          </li>
        </ul>
      </ExpandableSection>

      <v-btn text block @click="$emit('cancel')">Cancel</v-btn>
    </template>

    <!-- Choose which all-day events block time -->
    <template v-else-if="step === steps.ALL_DAY">
      <div
        class="tw-flex tw-max-h-64 tw-flex-col tw-gap-1 tw-overflow-y-auto"
      >
        <v-checkbox
          v-for="e in allDayEvents"
          :key="e.id"
          v-model="selectedAllDayIds"
          :value="e.id"
          class="tw-mt-0"
          hide-details
        >
          <template v-slot:label>
            <div class="tw-flex tw-w-full tw-items-baseline tw-gap-2">
              <span class="tw-text-sm tw-text-black">{{ e.summary }}</span>
              <v-spacer />
              <span class="tw-whitespace-nowrap tw-text-xs tw-text-dark-gray">
                {{ formatDayRange(e) }}
              </span>
            </div>
          </template>
        </v-checkbox>
      </div>
      <div class="tw-flex tw-items-center tw-gap-2">
        <v-btn text class="tw-grow" @click="reset">Back</v-btn>
        <v-btn color="primary" class="tw-grow" @click="finish">
          Fill my availability
        </v-btn>
      </div>
    </template>

    <!-- Nothing busy in range -->
    <template v-else-if="step === steps.NO_EVENTS">
      <div class="tw-text-sm tw-text-very-dark-gray">
        We didn't find any busy times in
        <span class="tw-font-medium">{{ fileName }}</span> during this poll's
        dates, so you'd be marked available the whole time.
      </div>
      <div class="tw-flex tw-items-center tw-gap-2">
        <v-btn text class="tw-grow" @click="reset">Choose another file</v-btn>
        <v-btn color="primary" class="tw-grow" @click="finish">
          Fill anyway
        </v-btn>
      </div>
    </template>
  </div>
</template>

<script>
import { getCalendarEventsTimeRange } from "@/utils"
import ExpandableSection from "@/components/ExpandableSection.vue"
import dayjs from "dayjs"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export default {
  name: "ICSUpload",

  props: {
    event: { type: Object, required: true },
    weekOffset: { type: Number, default: 0 },
    timezone: { type: String, required: true }, // IANA time zone of the poll grid
  },

  components: {
    ExpandableSection,
  },

  data() {
    return {
      steps: {
        PICK: "pick",
        ALL_DAY: "all_day",
        NO_EVENTS: "no_events",
      },
      step: "pick",
      loading: false,
      error: "",
      dragOver: false,
      showHelp: false,
      fileName: "",
      timedEvents: [],
      allDayEvents: [],
      selectedAllDayIds: [],
    }
  },

  methods: {
    onDrop(e) {
      this.dragOver = false
      const file = e.dataTransfer?.files?.[0]
      if (file) this.readFile(file)
    },
    onFileSelected(e) {
      const file = e.target.files?.[0]
      e.target.value = "" // Allow picking the same file again
      if (file) this.readFile(file)
    },
    async readFile(file) {
      this.error = ""
      if (file.size > MAX_FILE_SIZE) {
        this.error = "That file is too big. Calendar files are usually under 10 MB."
        return
      }

      this.loading = true
      try {
        // Loaded on demand so the calendar parser isn't in the main bundle
        const [{ parseIcsEvents }, text] = await Promise.all([
          import("@/utils/ics_utils"),
          file.text(),
        ])
        const { timeMin, timeMax } = getCalendarEventsTimeRange(
          this.event,
          this.weekOffset
        )
        const { timedEvents, allDayEvents } = parseIcsEvents(text, {
          timeMin,
          timeMax,
          timezone: this.timezone,
        })

        this.fileName = file.name
        this.timedEvents = timedEvents
        this.allDayEvents = allDayEvents
        // Multi-day events are usually trips or leave, single days are usually holidays or reminders
        this.selectedAllDayIds = allDayEvents
          .filter((e) => e.multiDay)
          .map((e) => e.id)

        this.$posthog.capture("ics_file_uploaded", {
          timedEvents: timedEvents.length,
          allDayEvents: allDayEvents.length,
        })

        if (allDayEvents.length > 0) {
          this.step = this.steps.ALL_DAY
        } else if (!timedEvents.some((e) => !e.free)) {
          this.step = this.steps.NO_EVENTS
        } else {
          await this.finish()
        }
      } catch (err) {
        console.error(err)
        this.error =
          "We couldn't read that file. Make sure it's a calendar file ending in .ics."
      } finally {
        this.loading = false
      }
    },
    async finish() {
      const { allDayEventsToTimeBlocks } = await import("@/utils/ics_utils")
      const selected = new Set(this.selectedAllDayIds)
      const allDayBlocks = allDayEventsToTimeBlocks(
        this.allDayEvents.filter((e) => selected.has(e.id)),
        this.timezone
      )
      this.$emit("uploaded", [...this.timedEvents, ...allDayBlocks])
      this.reset()
    },
    reset() {
      this.step = this.steps.PICK
      this.error = ""
      this.fileName = ""
      this.timedEvents = []
      this.allDayEvents = []
      this.selectedAllDayIds = []
    },
    /** e.g. "Oct 30" or "Oct 30 – Nov 3" (endDay is exclusive) */
    formatDayRange(e) {
      const start = dayjs(e.startDay)
      const end = dayjs(e.endDay).subtract(1, "day")
      if (!end.isAfter(start)) return start.format("MMM D")
      return `${start.format("MMM D")} – ${end.format("MMM D")}`
    },
  },
}
</script>
