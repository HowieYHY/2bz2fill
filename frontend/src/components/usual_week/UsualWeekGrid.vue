<!--
  Weekly grid for editing the usual week. Drag across cells to mark them with the current availability type;
  starting a drag on a cell that already has that type clears the dragged range instead (like the poll grid).
  v-model is 7 Uint8Arrays of per-minute statuses (index 0 = Sunday), see usual_week_utils.
-->
<template>
  <div class="tw-select-none" style="-webkit-touch-callout: none">
    <!-- Day headings -->
    <div class="tw-flex tw-pl-12 sm:tw-pl-14">
      <div
        v-for="day in dayColumns"
        :key="day.weekday"
        class="tw-flex-1 tw-pb-2 tw-text-center tw-text-xs tw-font-medium tw-uppercase tw-text-very-dark-gray sm:tw-text-sm"
      >
        <span class="sm:tw-hidden">{{ day.narrow }}</span>
        <span class="tw-hidden sm:tw-inline">{{ day.short }}</span>
      </div>
    </div>

    <div class="tw-flex">
      <!-- Time labels (also where phones can scroll the page, since the grid itself captures touches) -->
      <div class="tw-w-12 tw-flex-none sm:tw-w-14">
        <div
          v-for="slot in slots"
          :key="slot.index"
          class="tw-relative"
          :style="{ height: `${rowHeight}px` }"
        >
          <span
            v-if="slot.isHour && slot.index > 0"
            class="tw-absolute tw-right-2 tw-top-0 tw--translate-y-1/2 tw-whitespace-nowrap tw-text-xs tw-tabular-nums tw-text-dark-gray"
            >{{ slot.label }}</span
          >
        </div>
      </div>

      <!-- Cells -->
      <div
        ref="grid"
        class="tw-flex tw-flex-1 tw-overflow-hidden tw-rounded-md tw-border tw-border-gray"
        style="touch-action: none"
        @pointerdown="startDrag"
        @pointermove="moveDrag"
        @pointerup="endDrag"
        @pointercancel="cancelDrag"
        @lostpointercapture="endDrag"
      >
        <div
          v-for="(day, col) in dayColumns"
          :key="day.weekday"
          class="tw-flex-1"
          :class="col > 0 ? 'tw-border-l tw-border-gray' : ''"
        >
          <div
            v-for="slot in slots"
            :key="slot.index"
            :data-col="col"
            :data-row="slot.index"
            class="tw-cursor-pointer tw-transition-colors tw-duration-75"
            :class="cellClass(col, slot)"
            :style="{
              height: `${rowHeight}px`,
              backgroundColor: cellColor(col, slot.index),
            }"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { availabilityTypes } from "@/constants"
import { getTimeOptions, prefersStartOnMonday } from "@/utils"
import { usualWeekStatuses } from "@/utils/usual_week_utils"

const SLOT_MINUTES = 30
const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES

// Colors match the poll grid while editing availability
const STATUS_COLORS = {
  [usualWeekStatuses.AVAILABLE]: "#00994C77",
  [usualWeekStatuses.IF_NEEDED]: "#FFE8B8",
  [usualWeekStatuses.BUSY]: "#E523230D",
}

export default {
  name: "UsualWeekGrid",

  props: {
    value: { type: Array, required: true }, // 7 Uint8Arrays of per-minute statuses
    availabilityType: { type: String, default: availabilityTypes.AVAILABLE },
    rowHeight: { type: Number, default: 18 },
  },

  data() {
    return {
      dragStart: null, // { row, col }
      dragCur: null,
      dragStatus: null, // Status the dragged range will be set to
      pointerId: null,
    }
  },

  computed: {
    /** Columns in display order, following the user's "start week on Monday" preference */
    dayColumns() {
      const start = prefersStartOnMonday() ? 1 : 0
      const sunday = new Date(Date.UTC(2023, 0, 1)) // A Sunday
      return Array.from({ length: 7 }, (_, i) => {
        const weekday = (start + i) % 7
        const date = new Date(sunday.getTime() + weekday * 864e5)
        const format = (weekdayStyle) =>
          date.toLocaleDateString(undefined, {
            weekday: weekdayStyle,
            timeZone: "UTC",
          })
        return { weekday, short: format("short"), narrow: format("narrow") }
      })
    },
    slots() {
      const hourLabels = getTimeOptions().map((t) => t.text)
      return Array.from({ length: SLOTS_PER_DAY }, (_, index) => {
        const minute = index * SLOT_MINUTES
        const isHour = minute % 60 === 0
        return {
          index,
          isHour,
          label: isHour ? hourLabels[minute / 60] : "",
        }
      })
    },
    paintStatus() {
      return this.availabilityType === availabilityTypes.IF_NEEDED
        ? usualWeekStatuses.IF_NEEDED
        : usualWeekStatuses.AVAILABLE
    },
  },

  methods: {
    /** Status shown for a cell: the status of its first minute */
    cellStatus(col, row) {
      return this.value[this.dayColumns[col].weekday][row * SLOT_MINUTES]
    },
    inDragRange(col, row) {
      if (!this.dragStart) return false
      const [c0, c1] = [this.dragStart.col, this.dragCur.col].sort((a, b) => a - b)
      const [r0, r1] = [this.dragStart.row, this.dragCur.row].sort((a, b) => a - b)
      return col >= c0 && col <= c1 && row >= r0 && row <= r1
    },
    cellColor(col, row) {
      const status = this.inDragRange(col, row)
        ? this.dragStatus
        : this.cellStatus(col, row)
      return STATUS_COLORS[status]
    },
    cellClass(col, slot) {
      // Solid line on the hour, dashed on the half hour, like the poll grid
      if (slot.index === 0) return ""
      return slot.isHour
        ? "tw-border-t tw-border-[#DDDDDD]"
        : "tw-border-t tw-border-dashed tw-border-[#EEEEEE]"
    },
    /** Returns the { row, col } of the cell under the pointer, clamped to the grid */
    cellFromEvent(e) {
      const rect = this.$refs.grid.getBoundingClientRect()
      const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width - 1)
      const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height - 1)
      return {
        col: Math.floor((x / rect.width) * 7),
        row: Math.floor((y / rect.height) * SLOTS_PER_DAY),
      }
    },
    startDrag(e) {
      if (e.button !== 0 || this.dragStart) return
      e.preventDefault()
      window.getSelection()?.removeAllRanges()
      this.pointerId = e.pointerId
      this.$refs.grid.setPointerCapture?.(e.pointerId)

      const cell = this.cellFromEvent(e)
      this.dragStart = cell
      this.dragCur = cell
      this.dragStatus =
        this.cellStatus(cell.col, cell.row) === this.paintStatus
          ? usualWeekStatuses.BUSY
          : this.paintStatus
    },
    moveDrag(e) {
      if (!this.dragStart || e.pointerId !== this.pointerId) return
      e.preventDefault()
      const cell = this.cellFromEvent(e)
      if (cell.row !== this.dragCur.row || cell.col !== this.dragCur.col) {
        this.dragCur = cell
      }
    },
    endDrag(e) {
      if (!this.dragStart || e.pointerId !== this.pointerId) return
      const week = this.value.map((day) => day.slice())
      for (let col = 0; col < 7; ++col) {
        for (let row = 0; row < SLOTS_PER_DAY; ++row) {
          if (!this.inDragRange(col, row)) continue
          const start = row * SLOT_MINUTES
          week[this.dayColumns[col].weekday].fill(
            this.dragStatus,
            start,
            start + SLOT_MINUTES
          )
        }
      }
      this.resetDrag()
      this.$emit("input", week)
    },
    /** A cancelled pointer (e.g. the browser took over the gesture) abandons the drag instead of applying it */
    cancelDrag(e) {
      if (e.pointerId !== this.pointerId) return
      this.resetDrag()
    },
    resetDrag() {
      if (this.pointerId !== null) {
        this.$refs.grid?.releasePointerCapture?.(this.pointerId)
      }
      this.dragStart = null
      this.dragCur = null
      this.dragStatus = null
      this.pointerId = null
    },
  },
}
</script>
