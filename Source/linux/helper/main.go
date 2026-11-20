package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

const helperProtocol = 1

func main() {
	if len(os.Args) != 1 && (len(os.Args) != 3 || os.Args[1] != "--codex") {
		fmt.Fprintln(os.Stderr, "Usage: codex-usage-helper [--codex /absolute/path/to/codex]")
		os.Exit(2)
	}
	var configured string
	if len(os.Args) == 3 {
		configured = os.Args[2]
	}
	home, err := os.UserHomeDir()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Could not determine the user's home directory.")
		os.Exit(1)
	}
	cache := os.Getenv("XDG_CACHE_HOME")
	if !filepath.IsAbs(cache) {
		cache = filepath.Join(home, ".cache")
	}
	signals, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM, syscall.SIGPIPE)
	defer stop()
	ctx, cancel := context.WithCancel(signals)
	defer cancel()
	commands, output := make(chan string, 16), make(chan any)
	go func() {
		defer close(commands)
		defer cancel()
		scanner := bufio.NewScanner(os.Stdin)
		scanner.Buffer(make([]byte, 64), 256)
		for scanner.Scan() {
			if scanner.Text() == "quit" {
				return
			}
			select {
			case commands <- scanner.Text():
			case <-ctx.Done():
				return
			}
		}
	}()
	go func() {
		encoder := json.NewEncoder(os.Stdout)
		for {
			select {
			case <-ctx.Done():
				return
			case msg := <-output:
				if encoder.Encode(msg) != nil {
					cancel()
					return
				}
			}
		}
	}()
	m := monitor{
		findCLI: func() (string, error) { return codexPath(configured, home, os.Getenv("PATH")) },
		cache:   filepath.Join(cache, "codex-usage-widget", "usage-cache.json"),
		timeout: 12 * time.Second,
		emit: func(message any) {
			timer := time.NewTimer(2 * time.Second)
			defer timer.Stop()
			select {
			case output <- message:
			case <-ctx.Done():
			case <-timer.C:
				cancel()
			}
		},
	}
	m.emit(map[string]any{"type": "hello", "protocol": helperProtocol})
	m.serve(ctx, commands)
}
