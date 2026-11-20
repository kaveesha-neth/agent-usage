package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

type quotaWindow struct {
	DurationLabel      string   `json:"durationLabel"`
	WindowDurationMins *float64 `json:"windowDurationMins"`
	RemainingPercent   *float64 `json:"remainingPercent"`
	ResetsAt           *int64   `json:"resetsAt"`
}

type quotaBucket struct {
	ID      string        `json:"id"`
	Name    string        `json:"name"`
	Windows []quotaWindow `json:"windows"`
}

type usageSnapshot struct {
	FetchedAt time.Time     `json:"fetchedAt"`
	Buckets   []quotaBucket `json:"buckets"`
}

func parseUsage(data json.RawMessage, now time.Time) (*usageSnapshot, error) {
	// Distinguish an explicit null (no data) from a protocol that omits both fields.
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return nil, err
	}
	single, multi := fields["rateLimits"], fields["rateLimitsByLimitId"]
	if single == nil && multi == nil {
		return nil, errors.New("missing rate limit fields")
	}
	var byID map[string]json.RawMessage
	if multi != nil {
		if err := json.Unmarshal(multi, &byID); err != nil {
			return nil, err
		}
	}
	ids := make([]string, 0, len(byID))
	for id := range byID {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	buckets := make([]quotaBucket, 0, len(ids)+1)
	for _, id := range ids {
		if b, ok := parseBucket(byID[id], id); ok {
			buckets = append(buckets, b)
		}
	}
	if single != nil && string(single) != "null" {
		var legacy map[string]json.RawMessage
		if err := json.Unmarshal(single, &legacy); err != nil {
			return nil, err
		}
		id := text(legacy["limitId"])
		if id == "" && len(buckets) == 0 {
			id = "unidentified"
		}
		if id != "" && !slices.ContainsFunc(buckets, func(b quotaBucket) bool { return b.ID == id }) {
			if b, ok := parseBucket(single, id); ok {
				buckets = append(buckets, b)
			}
		}
	}
	return &usageSnapshot{now.UTC(), buckets}, nil
}

func parseBucket(data json.RawMessage, id string) (quotaBucket, bool) {
	var fields map[string]json.RawMessage
	if json.Unmarshal(data, &fields) != nil || fields == nil {
		return quotaBucket{}, false
	}
	name := text(fields["limitName"])
	if name == "" {
		parts := strings.FieldsFunc(id, func(r rune) bool { return strings.ContainsRune("_./-", r) })
		for i, part := range parts {
			_, length := utf8.DecodeRuneInString(part)
			parts[i] = strings.ToUpper(part[:length]) + part[length:]
		}
		name = strings.Join(parts, " ")
		if name == "" {
			name = "Unknown quota"
		}
	}
	bucket := quotaBucket{ID: id, Name: name, Windows: make([]quotaWindow, 0, 2)}
	for _, kind := range []string{"primary", "secondary"} {
		var raw map[string]json.RawMessage
		if json.Unmarshal(fields[kind], &raw) != nil || raw == nil {
			continue
		}
		window := quotaWindow{
			WindowDurationMins: numeric[float64](raw["windowDurationMins"]),
			ResetsAt:           numeric[int64](raw["resetsAt"]),
		}
		// Keep timestamps in the range supported by calendar formatting and cache JSON.
		if window.ResetsAt != nil && (*window.ResetsAt < -62135596800 || *window.ResetsAt > 253402300799) {
			window.ResetsAt = nil
		}
		if used := numeric[float64](raw["usedPercent"]); used != nil {
			remaining := min(100, max(0, 100-*used))
			window.RemainingPercent = &remaining
		}
		window.DurationLabel = durationLabel(kind, window.WindowDurationMins)
		bucket.Windows = append(bucket.Windows, window)
	}
	return bucket, true
}

func numeric[T float64 | int64](data json.RawMessage) *T {
	var number *T
	if json.Unmarshal(data, &number) != nil {
		return nil
	}
	return number
}

func text(data json.RawMessage) string {
	var str string
	if json.Unmarshal(data, &str) != nil || strings.TrimSpace(str) == "" {
		return ""
	}
	return str
}

func durationLabel(kind string, minutes *float64) string {
	if minutes == nil || *minutes <= 0 {
		return kind + " window · duration unavailable"
	}
	n := *minutes
	for _, unit := range []struct {
		minutes float64
		format  string
	}{{10080, "%s week window"}, {1440, "%s day window"}, {60, "%s-hour window"}} {
		if math.Mod(n, unit.minutes) == 0 {
			return fmt.Sprintf(unit.format, strconv.FormatFloat(n/unit.minutes, 'g', -1, 64))
		}
	}
	return strconv.FormatFloat(n, 'g', -1, 64) + "-minute window"
}
