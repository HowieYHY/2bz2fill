package models

import "testing"

func TestUsualWeekValidate(t *testing.T) {
	valid := func() UsualWeek {
		w := UsualWeek{Timezone: "Asia/Singapore", Days: make([]UsualWeekDay, 7)}
		w.Days[1].Available = []UsualWeekRange{{Start: 540, End: 1020}}
		w.Days[1].IfNeeded = []UsualWeekRange{{Start: 1020, End: 1440}}
		return w
	}

	empty := UsualWeek{Timezone: "UTC", Days: make([]UsualWeekDay, 7)}
	if err := empty.Validate(); err != nil {
		t.Errorf("empty week should be valid, got %v", err)
	}
	if empty.Days[3].Available == nil || empty.Days[3].IfNeeded == nil {
		t.Errorf("missing range lists should become empty lists")
	}
	w := valid()
	if err := w.Validate(); err != nil {
		t.Errorf("valid week rejected: %v", err)
	}

	cases := map[string]func(*UsualWeek){
		"missing timezone": func(w *UsualWeek) { w.Timezone = "" },
		"six days":         func(w *UsualWeek) { w.Days = w.Days[:6] },
		"no days":          func(w *UsualWeek) { w.Days = nil },
		"unknown timezone": func(w *UsualWeek) { w.Timezone = "Mars/Olympus" },
		"start after end":  func(w *UsualWeek) { w.Days[1].Available[0] = UsualWeekRange{Start: 600, End: 500} },
		"empty range":      func(w *UsualWeek) { w.Days[1].Available[0] = UsualWeekRange{Start: 600, End: 600} },
		"negative start":   func(w *UsualWeek) { w.Days[1].IfNeeded[0] = UsualWeekRange{Start: -1, End: 60} },
		"past midnight":    func(w *UsualWeek) { w.Days[1].IfNeeded[0] = UsualWeekRange{Start: 1400, End: 1441} },
		"too many ranges": func(w *UsualWeek) {
			w.Days[2].Available = make([]UsualWeekRange, maxRangesPerDay+1)
			for i := range w.Days[2].Available {
				w.Days[2].Available[i] = UsualWeekRange{Start: 0, End: 1}
			}
		},
	}
	for name, mutate := range cases {
		w := valid()
		mutate(&w)
		if err := w.Validate(); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}
