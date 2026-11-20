package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestServerBoundsAndCleanup(t *testing.T) {
	for _, test := range []struct {
		name, body  string
		wantTimeout bool
	}{
		{"hung", "IFS= read -r request\nexec sleep 60\n", true},
		{"malformed", "IFS= read -r request\nprintf 'not json\\n'\n", false},
		{"oversized", "IFS= read -r request\nexec head -c 2097152 /dev/zero\n", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			dir := t.TempDir()
			path := filepath.Join(dir, "fake codex")
			if err := os.WriteFile(path, []byte("#!/bin/sh\n"+test.body), 0o700); err != nil {
				t.Fatal(err)
			}
			client, err := startServer(t.Context(), path, dir, time.Second)
			if err != nil {
				t.Fatal(err)
			}
			defer client.close()
			if _, err := client.request(t.Context(), "turn/start", nil, func(serverMessage) {}); err == nil {
				t.Fatal("accepted a model request")
			}
			if _, err := client.request(t.Context(), "account/login/start", map[string]any{"type": "apiKey"}, func(serverMessage) {}); err == nil {
				t.Fatal("accepted an API-key login request")
			}
			if _, err := client.request(t.Context(), "initialize", nil, func(serverMessage) {}); err == nil ||
				errors.Is(err, context.DeadlineExceeded) != test.wantTimeout {
				t.Fatalf("unexpected request failure: %v", err)
			}
		})
	}
}
