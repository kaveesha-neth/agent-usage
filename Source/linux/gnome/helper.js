import Gio from 'gi://Gio';

Gio._promisify(Gio.DataInputStream.prototype, 'read_line_async', 'read_line_finish_utf8');
Gio._promisify(Gio.OutputStream.prototype, 'write_all_async', 'write_all_finish');
Gio._promisify(Gio.OutputStream.prototype, 'close_async', 'close_finish');
Gio._promisify(Gio.Subprocess.prototype, 'wait_async', 'wait_finish');

export class HelperClient {
    constructor(argv) {
        this._process = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDIN_PIPE |
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
        this._input = this._process.get_stdin_pipe();
        this._output = new Gio.DataInputStream({base_stream: this._process.get_stdout_pipe()});
        this._cancel = new Gio.Cancellable();
        this._writes = Promise.resolve();
        this._decoder = new TextDecoder('utf-8', {fatal: true});
    }

    async read(onMessage) {
        try {
            while (!this._cancel.is_cancelled()) {
                const [line] = await this._output.read_line_async(0, this._cancel);
                if (line === null || this._cancel.is_cancelled())
                    break;
                // GNOME Shell can pre-promisify this API with the byte-array finish method.
                const text = typeof line === 'string' ? line : this._decoder.decode(line);
                onMessage(JSON.parse(text));
            }
        } finally {
            await this.stop();
        }
    }

    send(command) {
        if (this._closing)
            return Promise.reject(new Error('The quota helper has closed.'));
        const data = new TextEncoder().encode(`${command}\n`);
        const write = this._writes.then(() => this._input.write_all_async(data, 0, this._cancel));
        this._writes = write.catch(() => {});
        return write;
    }

    stop() {
        if (!this._closing) {
            this._cancel.cancel();
            this._closing = this._writes.then(async () => {
                try {
                    await this._input.close_async(0, null);
                } finally {
                    await this._process.wait_async(null);
                }
            });
        }
        return this._closing;
    }
}
