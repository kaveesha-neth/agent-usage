package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"
)

const maxServerLine = 1 << 20

type serverMessage struct {
	ID     json.RawMessage `json:"id,omitempty"`
	Method string          `json:"method,omitempty"`
	Params json.RawMessage `json:"params,omitempty"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  json.RawMessage `json:"error,omitempty"`
}

// rpcClient is owned by the monitor loop. The reader only decodes bounded
// lines; it never touches session state or writes back to the subprocess.
type rpcClient struct {
	cmd        *exec.Cmd
	in, out    *os.File
	messages   chan serverMessage
	stopRead   context.CancelFunc
	readerDone chan struct{}
	stopWrite  func() bool
	nextID     uint64
	deadline   time.Duration
}

func startServer(ctx context.Context, executable, directory string, deadline time.Duration) (*rpcClient, error) {
	childIn, in, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	out, childOut, err := os.Pipe()
	if err != nil {
		childIn.Close()
		in.Close()
		return nil, err
	}
	defer childIn.Close()
	defer childOut.Close()
	cmd := exec.Command(executable, "app-server")
	cmd.Dir, cmd.Stdin, cmd.Stdout = directory, childIn, childOut
	// Do not retain stderr. Give the subprocess a private group for cleanup.
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err = cmd.Start(); err != nil {
		in.Close()
		out.Close()
		return nil, err
	}
	readCtx, cancel := context.WithCancel(ctx)
	c := &rpcClient{cmd: cmd, in: in, out: out, stopRead: cancel, deadline: deadline,
		messages: make(chan serverMessage, 16), readerDone: make(chan struct{})}
	c.stopWrite = context.AfterFunc(ctx, func() { in.Close() })
	go c.read(readCtx)
	return c, nil
}

func (c *rpcClient) read(ctx context.Context) {
	defer close(c.readerDone)
	defer close(c.messages)
	scanner := bufio.NewScanner(c.out)
	scanner.Buffer(make([]byte, 4096), maxServerLine)
	for scanner.Scan() {
		var msg *serverMessage
		if json.Unmarshal(scanner.Bytes(), &msg) != nil || msg == nil {
			return
		}
		select {
		case c.messages <- *msg:
		case <-ctx.Done():
			return
		}
	}
}

func (c *rpcClient) close() {
	c.stopWrite()
	c.stopRead()
	c.in.Close()
	// The child has not been reaped, so its process-group ID cannot be reused.
	_ = syscall.Kill(-c.cmd.Process.Pid, syscall.SIGKILL)
	c.out.Close()
	<-c.readerDone
	_ = c.cmd.Wait()
}

func (c *rpcClient) write(ctx context.Context, msg any) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	deadline := time.Now().Add(c.deadline)
	if limit, ok := ctx.Deadline(); ok && limit.Before(deadline) {
		deadline = limit
	}
	if err := c.in.SetWriteDeadline(deadline); err != nil {
		return err
	}
	return json.NewEncoder(c.in).Encode(msg)
}

func (c *rpcClient) request(ctx context.Context, method string, params map[string]any, notify func(serverMessage)) (json.RawMessage, error) {
	// No model turns, billing actions, token hand-offs, or arbitrary RPC calls.
	switch method {
	case "initialize", "account/read", "account/rateLimits/read", "account/login/cancel", "account/logout":
	case "account/login/start":
		if params["type"] != "chatgpt" {
			return nil, errors.New("only managed ChatGPT login is allowed")
		}
	default:
		return nil, errors.New("RPC method not allowed")
	}
	ctx, cancel := context.WithTimeout(ctx, c.deadline)
	defer cancel()
	c.nextID++
	id := c.nextID
	if err := c.write(ctx, map[string]any{"id": id, "method": method, "params": params}); err != nil {
		return nil, err
	}
	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case msg, ok := <-c.messages:
			if !ok {
				return nil, errors.New("Codex connection closed")
			}
			if msg.Method != "" {
				if err := c.event(ctx, msg, notify); err != nil {
					return nil, err
				}
				continue
			}
			var responseID uint64
			if json.Unmarshal(msg.ID, &responseID) != nil || responseID != id {
				continue
			}
			if (len(msg.Error) != 0 && string(msg.Error) != "null") || len(msg.Result) == 0 {
				return nil, fmt.Errorf("Codex rejected %s or returned no result", method)
			}
			return msg.Result, nil
		}
	}
}

func (c *rpcClient) event(ctx context.Context, msg serverMessage, notify func(serverMessage)) error {
	if len(msg.ID) != 0 && string(msg.ID) != "null" {
		return c.write(ctx, map[string]any{"id": msg.ID, "error": map[string]any{
			"code": -32601, "message": "The quota indicator does not handle server requests",
		}})
	}
	notify(msg)
	return nil
}
