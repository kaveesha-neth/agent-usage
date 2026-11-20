package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestQuotaShapes(t *testing.T) {
	now := time.Now().UTC()
	snapshot, err := parseUsage([]byte(`{
		"rateLimits":{"limitId":"codex","primary":{"usedPercent":42}},
		"rateLimitsByLimitId": {
			"codex": {"primary":{"usedPercent":100,"windowDurationMins":300},
			          "secondary":{"usedPercent":null,"windowDurationMins":10080,"resetsAt":9007199254740991}},
			"codex-other": {"primary":{"usedPercent":-1,"windowDurationMins":60,"resetsAt":4102444800}},
			"extra": {"primary":null,"secondary":null}
		}}`), now)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Buckets) != 3 || snapshot.FetchedAt != now || snapshot.Buckets[0].ID != "codex" ||
		snapshot.Buckets[1].Name != "Codex Other" || len(snapshot.Buckets[2].Windows) != 0 {
		t.Fatalf("unexpected buckets: %+v", snapshot.Buckets)
	}
	windows := snapshot.Buckets[0].Windows
	if len(windows) != 2 || *windows[0].RemainingPercent != 0 || *windows[0].WindowDurationMins != 300 ||
		windows[1].DurationLabel != "1 week window" || windows[1].RemainingPercent != nil || windows[1].ResetsAt != nil {
		t.Fatalf("unexpected quota windows: %+v", windows)
	}
	if w := snapshot.Buckets[1].Windows[0]; *w.RemainingPercent != 100 || *w.ResetsAt != 4102444800 {
		t.Fatalf("unexpected secondary bucket: %+v", w)
	}
	legacy, err := parseUsage([]byte(`{"rateLimits":{"primary":{"usedPercent":25}}}`), now)
	if err != nil || legacy.Buckets[0].ID != "unidentified" || *legacy.Buckets[0].Windows[0].RemainingPercent != 75 {
		t.Fatalf("unexpected legacy quota: %+v (%v)", legacy, err)
	}
	empty, err := parseUsage([]byte(`{"rateLimits":null}`), now)
	if err != nil || empty.Buckets == nil || len(empty.Buckets) != 0 {
		t.Fatalf("expected explicit empty quota: %+v (%v)", empty, err)
	}
	for _, raw := range []string{`null`, `[]`, `{}`, `{"rateLimits":0}`, `{"rateLimitsByLimitId":[]}`} {
		if _, err := parseUsage([]byte(raw), now); err == nil {
			t.Errorf("accepted malformed quota: %s", raw)
		}
	}
}

func TestPrivateCache(t *testing.T) {
	path := filepath.Join(t.TempDir(), "quota", "usage.json")
	now := time.Now()
	snap, err := parseUsage([]byte(`{"rateLimits":{"limitId":"codex","primary":{}}}`), now)
	if err != nil {
		t.Fatal(err)
	}
	saveCache(path, "account-a", snap)
	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("expected private cache entry: %v (%v)", info, err)
	}
	if loadCache(path, "account-a", now) == nil || loadCache(path, "account-b", now) != nil ||
		loadCache(path, "account-a", now.Add(-time.Hour)) != nil {
		t.Fatal("cache must be recent and match the confirmed account")
	}
}

func TestAuthenticationURLs(t *testing.T) {
	for _, url := range []string{"https://auth.openai.com/authorize", "https://chatgpt.com:443/auth"} {
		if !trustedAuthURL(url) {
			t.Errorf("rejected trusted URL %s", url)
		}
	}
	for _, url := range []string{"http://chatgpt.com", "https://openai.com.example.invalid", "https://user@openai.com", "https://openai.com:8443", "https://example.invalid/#openai.com"} {
		if trustedAuthURL(url) {
			t.Errorf("accepted untrusted URL %s", url)
		}
	}
}
