package models

import (
	"errors"
	"fmt"
	"time"
)

// MinutesPerDay is the number of minutes in a day, the upper bound for a UsualWeekRange's End
const MinutesPerDay = 24 * 60

// maxRangesPerDay caps how many ranges a day can hold (one per 15 minutes is already more than the editor can make)
const maxRangesPerDay = MinutesPerDay / 15

// UsualWeek is the times a user is usually free, used to pre-fill new polls.
// Days[0] is Sunday. Times are wall-clock minutes in Timezone.
type UsualWeek struct {
	Timezone string         `json:"timezone" bson:"timezone"`
	Days     []UsualWeekDay `json:"days" bson:"days"`
}

// UsualWeekDay is the free time on one day of the usual week
type UsualWeekDay struct {
	Available []UsualWeekRange `json:"available" bson:"available"`
	IfNeeded  []UsualWeekRange `json:"ifNeeded" bson:"ifNeeded"`
}

// UsualWeekRange is a time range in minutes since local midnight; End is exclusive
type UsualWeekRange struct {
	Start int `json:"start" bson:"start"`
	End   int `json:"end" bson:"end"`
}

// Validate returns an error describing the first problem with the usual week, or nil.
// It also replaces missing range lists with empty ones, so they are stored and returned as [] rather than null.
func (w *UsualWeek) Validate() error {
	if w.Timezone == "" {
		return errors.New("timezone is required")
	}
	if _, err := time.LoadLocation(w.Timezone); err != nil {
		return fmt.Errorf("unknown timezone %q", w.Timezone)
	}
	if len(w.Days) != 7 {
		return fmt.Errorf("days must have 7 entries, got %d", len(w.Days))
	}
	for i := range w.Days {
		if w.Days[i].Available == nil {
			w.Days[i].Available = []UsualWeekRange{}
		}
		if w.Days[i].IfNeeded == nil {
			w.Days[i].IfNeeded = []UsualWeekRange{}
		}
		day := w.Days[i]
		for _, ranges := range [][]UsualWeekRange{day.Available, day.IfNeeded} {
			if len(ranges) > maxRangesPerDay {
				return fmt.Errorf("day %d has too many ranges", i)
			}
			for _, r := range ranges {
				if r.Start < 0 || r.End > MinutesPerDay || r.Start >= r.End {
					return fmt.Errorf("day %d has an invalid range %d-%d", i, r.Start, r.End)
				}
			}
		}
	}
	return nil
}
