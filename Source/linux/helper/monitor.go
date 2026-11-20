package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math/rand/v2"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const pollInterval = 3 * time.Minute

type view struct {
	Snapshot   *usageSnapshot `json:"snapshot"`
	Connection string         `json:"connection"`
	Stale      bool           `json:"stale"`
	Detail     string         `json:"detail"`
	Plan       *string        `json:"plan"`
}

type monitor struct {
	findCLI               func() (string, error)
	cache                 string
	timeout               time.Duration
	emit                  func(any)
	client                *rpcClient
	view                  view
	key, loginID          string
	authGeneration        uint64
	cacheChecked, refresh bool
	failures              int
}

type cliNotFound struct{ message string }

func (err cliNotFound) Error() string { return err.message }

func codexPath(configured, home, path string) (string, error) {
	isExecutable := func(file string) bool {
		if !filepath.IsAbs(file) {
			return false
		}
		info, err := os.Stat(file)
		return err == nil && info.Mode().IsRegular() && info.Mode().Perm()&0o111 != 0
	}
	if configured != "" {
		if isExecutable(configured) {
			return configured, nil
		}
		return "", cliNotFound{"Select an absolute path to an executable Codex CLI in Preferences."}
	}
	for _, dir := range append(filepath.SplitList(path), filepath.Join(home, ".local/bin"), filepath.Join(home, ".cargo/bin")) {
		if filepath.IsAbs(dir) {
			if file := filepath.Join(dir, "codex"); isExecutable(file) {
				return file, nil
			}
		}
	}
	return "", cliNotFound{"Codex CLI not found. Install Codex or set its path in Preferences."}
}

func (m *monitor) publish(v view) {
	m.view = v
	m.emit(map[string]any{"type": "view", "view": v})
}

func (m *monitor) serve(ctx context.Context, commands <-chan string) {
	defer m.closeServer()
	m.publish(view{Connection: "Connecting", Detail: "Starting Codex app-server…"})
	timer := time.NewTimer(0)
	defer timer.Stop()
	for ctx.Err() == nil {
		var messages <-chan serverMessage
		if m.client != nil {
			messages = m.client.messages
		}
		select {
		case <-ctx.Done():
			return
		case command, ok := <-commands:
			if !ok || command == "quit" {
				return
			}
			if command == "refresh" {
				// Coalesce clicks where possible and defer reconnects during backoff.
				if m.failures == 0 {
					timer.Reset(0)
				}
				continue
			}
			m.action(ctx, command)
			if m.refresh || m.failures != 0 {
				timer.Reset(m.nextPoll(time.Now()))
			}
		case <-timer.C:
			m.refresh = false
			if err := m.poll(ctx); err != nil && ctx.Err() == nil {
				m.disconnected(err)
			}
			timer.Reset(m.nextPoll(time.Now()))
		case msg, ok := <-messages:
			if !ok {
				m.disconnected(errors.New("Codex connection closed"))
				timer.Reset(m.nextPoll(time.Now()))
				continue
			}
			wasPending := m.refresh
			if msg.Method != "" {
				if err := m.client.event(ctx, msg, m.notification); err != nil && ctx.Err() == nil {
					m.disconnected(err)
					timer.Reset(m.nextPoll(time.Now()))
					continue
				}
			}
			if m.refresh && !wasPending {
				timer.Reset(time.Second)
			}
		}
	}
}

func (m *monitor) connect(ctx context.Context) error {
	if m.client != nil {
		return nil
	}
	executable, err := m.findCLI()
	if err != nil {
		return err
	}
	directory := filepath.Dir(m.cache)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return err
	}
	m.client, err = startServer(ctx, executable, directory, m.timeout)
	if err != nil {
		return err
	}
	_, err = m.request(ctx, "initialize", map[string]any{"clientInfo": map[string]any{
		"name": "codex_usage_widget", "title": "Codex Usage Widget", "version": "1.0.0",
	}})
	if err != nil {
		return err
	}
	return m.client.write(ctx, map[string]string{"method": "initialized"})
}

func (m *monitor) closeServer() {
	if m.client != nil {
		m.client.close()
		m.client = nil
	}
	m.loginID = ""
}

func (m *monitor) disconnected(err error) {
	m.closeServer()
	m.failures = min(m.failures+1, 7)
	v := m.view
	v.Connection, v.Stale = "Disconnected", v.Snapshot != nil
	v.Detail = "Could not read usage. Check the Codex CLI and your connection. Retrying automatically."
	var missing cliNotFound
	if errors.As(err, &missing) {
		v.Detail = missing.message
	}
	m.publish(v)
}

func (m *monitor) nextPoll(now time.Time) time.Duration {
	if m.failures > 0 {
		if m.failures >= 7 {
			return pollInterval
		}
		return min(pollInterval, time.Second*time.Duration(2<<m.failures)*(90+time.Duration(rand.IntN(21)))/100)
	}
	if m.refresh {
		return time.Second
	}
	delay := pollInterval
	if m.view.Snapshot != nil {
		for _, bucket := range m.view.Snapshot.Buckets {
			for _, window := range bucket.Windows {
				if window.ResetsAt != nil {
					until := time.Unix(*window.ResetsAt, 0).Sub(now)
					if until <= 0 {
						until = 30 * time.Second
					} else {
						until += time.Second
					}
					delay = min(delay, until)
				}
			}
		}
	}
	return delay
}

func (m *monitor) request(ctx context.Context, method string, params map[string]any) (json.RawMessage, error) {
	if params == nil {
		params = map[string]any{}
	}
	return m.client.request(ctx, method, params, m.notification)
}

func (m *monitor) notification(msg serverMessage) {
	switch msg.Method {
	case "account/updated":
		m.authGeneration++
		m.clearUsage()
		m.publish(view{Connection: "Checking account", Detail: "Authentication changed; reading account…"})
		m.refresh = true
	case "account/login/completed":
		var login struct {
			LoginID string `json:"loginId"`
		}
		if json.Unmarshal(msg.Params, &login) == nil && login.LoginID == m.loginID {
			m.loginID = ""
		}
		m.refresh = true
	case "account/rateLimits/updated":
		m.refresh = true
	}
}

func (m *monitor) clearUsage() {
	m.key = ""
	m.cacheChecked = true
	_ = os.Remove(m.cache)
}

func (m *monitor) poll(ctx context.Context) error {
	if err := m.connect(ctx); err != nil {
		return err
	}
	generation := m.authGeneration
	result, err := m.request(ctx, "account/read", map[string]any{"refreshToken": false})
	if err != nil || generation != m.authGeneration {
		return err
	}
	var envelope struct {
		Account json.RawMessage `json:"account"`
	}
	var account map[string]json.RawMessage
	if json.Unmarshal(result, &envelope) != nil || json.Unmarshal(envelope.Account, &account) != nil {
		return errors.New("unexpected account response")
	}
	kind := text(account["type"])
	if kind != "chatgpt" {
		m.clearUsage()
		m.failures = 0
		switch {
		case m.loginID != "":
			m.publish(view{Connection: "Signing in", Detail: "Complete ChatGPT sign-in in your browser."})
		case kind == "apiKey":
			m.publish(view{Connection: "API key only", Detail: "API-key billing is separate. Sign in with ChatGPT to see subscription quotas."})
		default:
			m.publish(view{Connection: "Sign in required", Detail: "Sign in with ChatGPT to see subscription quotas."})
		}
		return nil
	}
	// Keep only a one-way fingerprint. Sorting the top-level keys prevents
	// harmless JSON field ordering changes from invalidating the snapshot.
	canonical, err := json.Marshal(account)
	if err != nil {
		return err
	}
	digest := sha256.Sum256(canonical)
	key := strings.ToUpper(hex.EncodeToString(digest[:]))
	var plan *string
	if name := text(account["planType"]); name != "" {
		plan = &name
	}
	if m.key != "" && m.key != key {
		m.clearUsage()
		m.publish(view{Connection: "Account changed", Detail: "Loading current account…", Plan: plan})
	}
	m.key = key
	if !m.cacheChecked {
		m.cacheChecked = true
		if cached := loadCache(m.cache, key, time.Now()); cached != nil {
			m.publish(view{Snapshot: cached, Connection: "Connecting", Stale: true, Detail: "Showing cached usage while reconnecting.", Plan: plan})
		}
	}
	result, err = m.request(ctx, "account/rateLimits/read", nil)
	if err != nil || generation != m.authGeneration {
		return err
	}
	snapshot, err := parseUsage(result, time.Now())
	if err != nil {
		return err
	}
	m.failures = 0
	detail := "Usage read from the local Codex CLI."
	if len(snapshot.Buckets) == 0 {
		detail = "No quota buckets were returned by this account."
	}
	saveCache(m.cache, key, snapshot)
	m.publish(view{Snapshot: snapshot, Connection: "Connected", Detail: detail, Plan: plan})
	return nil
}

func (m *monitor) action(ctx context.Context, command string) {
	if command != "sign-in" && command != "cancel-sign-in" && command != "sign-out" {
		m.emit(map[string]string{"type": "error", "message": "Unknown helper command."})
		return
	}
	defer m.emit(map[string]string{"type": "action-done", "command": command})
	if err := m.accountAction(ctx, command); err != nil && ctx.Err() == nil {
		m.disconnected(err)
		m.refresh = true
		m.emit(map[string]string{"type": "error", "message": "Account action failed. Check the Codex CLI and connection."})
	}
}

func (m *monitor) accountAction(ctx context.Context, command string) error {
	if err := m.connect(ctx); err != nil {
		return err
	}
	switch command {
	case "sign-in":
		if m.loginID != "" {
			return nil
		}
		result, err := m.request(ctx, "account/login/start", map[string]any{"type": "chatgpt"})
		if err != nil {
			return err
		}
		var login struct {
			LoginID string `json:"loginId"`
			AuthURL string `json:"authUrl"`
			Type    string `json:"type"`
		}
		if err := json.Unmarshal(result, &login); err != nil {
			return err
		}
		m.loginID = login.LoginID
		if login.Type != "chatgpt" || login.LoginID == "" || !trustedAuthURL(login.AuthURL) {
			m.emit(map[string]string{"type": "error", "message": "Codex returned an unexpected authentication URL or login response."})
			return m.accountAction(ctx, "cancel-sign-in")
		}
		v := m.view
		v.Connection, v.Detail = "Signing in", "Complete ChatGPT sign-in in your browser."
		m.publish(v)
		m.emit(map[string]string{"type": "auth-url", "url": login.AuthURL})
	case "cancel-sign-in":
		if m.loginID != "" {
			if _, err := m.request(ctx, "account/login/cancel", map[string]any{"loginId": m.loginID}); err != nil {
				return err
			}
			m.loginID = ""
		}
		m.refresh = true
	case "sign-out":
		if _, err := m.request(ctx, "account/logout", nil); err != nil {
			return err
		}
		m.loginID = ""
		m.clearUsage()
		m.publish(view{Connection: "Sign in required", Detail: "Signed out of the shared Codex session."})
		m.refresh = true
	}
	return nil
}

func trustedAuthURL(value string) bool {
	u, err := url.Parse(value)
	if err != nil || u.Scheme != "https" || u.User != nil || (u.Port() != "" && u.Port() != "443") {
		return false
	}
	host := strings.ToLower(u.Hostname())
	return host == "openai.com" || host == "chatgpt.com" ||
		strings.HasSuffix(host, ".openai.com") || strings.HasSuffix(host, ".chatgpt.com")
}
