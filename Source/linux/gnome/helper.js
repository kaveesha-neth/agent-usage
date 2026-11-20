import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async', 'read_bytes_finish');
Gio._promisify(Gio.OutputStream.prototype, 'write_all_async', 'write_all_finish');
Gio._promisify(Gio.OutputStream.prototype, 'close_async', 'close_finish');
Gio._promisify(Gio.Subprocess.prototype, 'wait_async', 'wait_finish');

const protocolVersion = 1;
const maximumFrame = 2 * 1024 * 1024;

function timer(milliseconds, callback) {
    return GLib.timeout_add(GLib.PRIORITY_DEFAULT, milliseconds, () => {
        callback();
        return GLib.SOURCE_REMOVE;
    });
}

export class IncompatibleHelper extends Error {}

export class HelperClient {
    constructor(argv) {
        this._process = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDIN_PIPE |
            Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
        this._input = this._process.get_stdin_pipe();
        this._output = this._process.get_stdout_pipe();
        this._cancel = new Gio.Cancellable();
        this._writes = Promise.resolve();
        this._decoder = new TextDecoder('utf-8', {fatal: true});
        this.ready = false;
    }

    async read(onMessage) {
        let handshake = timer(3500, () => {
            handshake = 0;
            this._cancel.cancel();
        });
        let frame = new Uint8Array(8192);
        let size = 0;
        try {
            while (!this._cancel.is_cancelled()) {
                const bytes = (await this._output.read_bytes_async(8192, 0, this._cancel)).get_data();
                if (!bytes?.length || this._cancel.is_cancelled())
                    break;
                let offset = 0;
                while (offset < bytes.length && !this._cancel.is_cancelled()) {
                    const lf = bytes.indexOf(10, offset);
                    const end = lf < 0 ? bytes.length : lf;
                    const total = size + end - offset;
                    if (total > maximumFrame)
                        throw new Error('The quota helper sent an oversized message.');
                    if (total > frame.length) {
                        const larger = new Uint8Array(Math.max(frame.length * 2, total));
                        larger.set(frame.subarray(0, size));
                        frame = larger;
                    }
                    frame.set(bytes.subarray(offset, end), size);
                    size = total;
                    if (lf < 0)
                        break;
                    offset = lf + 1;
                    const message = JSON.parse(this._decoder.decode(frame.subarray(0, size)));
                    size = 0;
                    if (!this.ready) {
                        if (message?.type !== 'hello' || message.protocol !== protocolVersion)
                            throw new IncompatibleHelper('The quota helper and extension versions do not match.');
                        this.ready = true;
                        GLib.Source.remove(handshake);
                        handshake = 0;
                    } else {
                        onMessage(message);
                    }
                }
            }
        } finally {
            if (handshake)
                GLib.Source.remove(handshake);
            await this.stop();
        }
    }

    send(command) {
        if (this._closing || !this.ready)
            return Promise.reject(new Error('The quota helper is not ready.'));
        const data = new TextEncoder().encode(`${command}\n`);
        const write = this._writes.then(() => this._input.write_all_async(data, 0, this._cancel));
        this._writes = write.catch(() => {});
        return write;
    }

    stop() {
        if (!this._closing) {
            this._cancel.cancel();
            this._closing = this._shutdown();
        }
        return this._closing;
    }

    async _shutdown() {
        const wait = new Gio.Cancellable();
        let terminate = timer(500, () => {
            terminate = 0;
            this._process.send_signal(15);
        });
        let kill = timer(1500, () => {
            kill = 0;
            this._process.force_exit();
        });
        let limit = timer(2500, () => {
            limit = 0;
            wait.cancel();
        });
        this._writes.then(() => this._input.close_async(0, wait)).catch(() => {});
        try {
            await this._process.wait_async(wait);
        } catch {
            // The bounded wait is only a last resort after SIGTERM and SIGKILL.
        } finally {
            for (const source of [terminate, kill, limit]) {
                if (source)
                    GLib.Source.remove(source);
            }
            // Release outstanding stream callbacks even after the child exits.
            wait.cancel();
        }
    }
}
