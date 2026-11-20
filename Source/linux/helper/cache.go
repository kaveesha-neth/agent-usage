package main

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"syscall"
	"time"
)

type cachedUsage struct {
	Version    int            `json:"version"`
	AccountKey string         `json:"accountKey"`
	Snapshot   *usageSnapshot `json:"snapshot"`
}

func loadCache(path, key string, now time.Time) *usageSnapshot {
	file, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NONBLOCK|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return nil
	}
	defer file.Close()
	stat, err := file.Stat()
	if err != nil || !stat.Mode().IsRegular() || stat.Size() > maxServerLine {
		return nil
	}
	data, err := io.ReadAll(io.LimitReader(file, maxServerLine+1))
	var cache cachedUsage
	if err != nil || len(data) > maxServerLine || json.Unmarshal(data, &cache) != nil ||
		cache.Version != 1 || cache.AccountKey != key || cache.Snapshot == nil ||
		cache.Snapshot.Buckets == nil || cache.Snapshot.FetchedAt.IsZero() ||
		cache.Snapshot.FetchedAt.After(now.Add(5*time.Minute)) {
		return nil
	}
	for _, bucket := range cache.Snapshot.Buckets {
		if bucket.Windows == nil {
			return nil
		}
	}
	return cache.Snapshot
}

func saveCache(path, key string, snap *usageSnapshot) {
	directory := filepath.Dir(path)
	if os.MkdirAll(directory, 0o700) != nil {
		return
	}
	file, err := os.CreateTemp(directory, ".usage-cache-*")
	if err != nil {
		return
	}
	defer os.Remove(file.Name())
	err = json.NewEncoder(file).Encode(cachedUsage{1, key, snap})
	if closeErr := file.Close(); err == nil && closeErr == nil {
		_ = os.Rename(file.Name(), path)
	}
}
