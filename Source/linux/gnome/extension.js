import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {HelperClient} from './helper.js';
import {countdown, isStale, makeDemo, percent, remainingForWindow, resetLabel} from './usage.js';

const usageDashboard = 'https://chatgpt.com/codex/settings/usage';
const panelWindows = [
    {label: '5h', name: 'Five-hour', minutes: 300},
    {label: 'W', name: 'Weekly', minutes: 10080},
];

export default class CodexUsageExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._button = new PanelMenu.Button(0.0, 'Codex Usage');
        const panel = new St.BoxLayout({style_class: 'codex-usage-indicator'});
        this._demoLabel = new St.Label({text: 'DEMO', y_align: Clutter.ActorAlign.CENTER});
        panel.add_child(this._demoLabel);
        this._meters = panelWindows.map(window => {
            const group = new St.BoxLayout({style_class: 'codex-usage-meter'});
            const ring = new St.DrawingArea({style_class: 'codex-usage-ring',
                y_align: Clutter.ActorAlign.CENTER});
            const value = new St.Label({y_align: Clutter.ActorAlign.CENTER});
            const meter = {...window, ring, value, remaining: null};
            ring.connect('repaint', () => this._drawRing(meter));
            group.add_child(ring);
            group.add_child(value);
            panel.add_child(group);
            return meter;
        });
        this._button.add_child(panel);

        const detailsItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        const scroll = new St.ScrollView({style_class: 'codex-usage-scroll',
            x_expand: true, reactive: true, overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER});
        this._details = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'codex-usage-details'});
        scroll.set_child(this._details);
        detailsItem.add_child(scroll);
        this._button.menu.addMenuItem(detailsItem);
        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._button.menu.addAction('Refresh', () => this._refresh());
        this._signIn = this._button.menu.addAction('Sign in with ChatGPT', () => this._send('sign-in'));
        this._cancelSignIn = this._button.menu.addAction('Cancel sign-in', () => this._send('cancel-sign-in'));
        this._signOut = this._button.menu.addAction('Sign out of shared Codex session', () => this._send('sign-out'));
        this._button.menu.addAction('Open usage dashboard', () => this._openUrl(usageDashboard));
        this._button.menu.addAction('Preferences', () => this.openPreferences());
        Main.panel.addToStatusArea(this.uuid, this._button);

        this._settingsChanged = this._settings.connect('changed', () => this._switchMode());
        this._switchMode();
        this._lastTick = Date.now();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            const now = Date.now();
            if (!this._demo && this._client && now - this._lastTick > 10_000)
                this._send('refresh');
            this._lastTick = now;
            if (!this._demo && this._retryAt && now >= this._retryAt)
                this._startHelper();
            this._tick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (this._timer) {
            GLib.Source.remove(this._timer);
            this._timer = null;
        }
        this._stopHelper();
        this._settings.disconnect(this._settingsChanged);
        this._settings = null;
        this._button?.destroy();
        this._button = this._details = this._meters = this._demoLabel = null;
        this._stale = null;
        this._status = this._errorLabel = this._view = this._countdowns = null;
        this._signIn = this._cancelSignIn = this._signOut = null;
    }

    _switchMode() {
        this._stopHelper();
        this._demo = this._settings.get_boolean('demo-mode');
        this._error = null;
        this._render(this._demo ? makeDemo() :
            {snapshot: null, connection: 'Connecting', stale: false, detail: 'Starting the quota helper…'});
        if (!this._demo)
            this._startHelper();
    }

    _stopHelper() {
        this._retryAt = 0;
        this._busy = false;
        if (!this._client)
            return;
        this._closing = this._client.stop().catch(() => {});
        this._client = null;
    }

    async _startHelper() {
        this._retryAt = 0;
        // Wait for the previous process to release its cache before starting a new one.
        await this._closing;
        if (!this._button || this._demo || this._client)
            return;
        const executable = GLib.build_filenamev([GLib.get_user_data_dir(), 'codex-usage-widget',
            'bin', 'codex-usage-helper']);
        const codexPath = this._settings.get_string('codex-path');
        let client;
        try {
            client = new HelperClient(codexPath ? [executable, '--codex', codexPath] : [executable]);
        } catch {
            this._render({...this._view, connection: 'Helper unavailable', stale: true,
                detail: 'Install or repair the Linux helper, then choose Refresh.'});
            return;
        }

        this._closing = null;
        this._client = client;
        this._updateActions();
        try {
            await client.read(message => {
                if (this._client === client)
                    this._onMessage(message);
            });
        } catch {
            // EOF, cancellation, and malformed replies share the same recovery path.
        } finally {
            if (this._client === client) {
                this._client = null;
                this._busy = false;
                this._retryAt = Date.now() + 10_000;
                this._render({...this._view, connection: 'Disconnected', stale: true,
                    detail: 'The quota helper stopped. Reconnecting…'});
            }
        }
    }

    _onMessage(message) {
        switch (message.type) {
        case 'view':
            this._render(message.view);
            break;
        case 'auth-url':
            this._openUrl(message.url);
            break;
        case 'error':
            this._showError(message.message);
            break;
        case 'action-done':
            this._busy = false;
            this._updateActions();
            break;
        }
    }

    _refresh() {
        this._showError(null);
        if (this._demo)
            this._render(makeDemo());
        else if (this._client)
            this._send('refresh');
        else
            this._startHelper();
    }

    async _send(command) {
        const client = this._client;
        if (!client || (command !== 'refresh' && this._busy))
            return;
        if (command !== 'refresh') {
            this._busy = true;
            this._showError(null);
            this._updateActions();
        }
        try {
            await client.send(command);
        } catch {
            if (this._client === client) {
                this._busy = false;
                this._showError('Could not contact the quota helper.');
                this._updateActions();
            }
        }
    }

    _updateActions() {
        const available = Boolean(this._client) && !this._busy;
        const signingIn = this._view?.connection === 'Signing in';
        for (const item of [this._signIn, this._cancelSignIn, this._signOut])
            item.actor.visible = !this._demo;
        this._signIn.setSensitive(available && !signingIn);
        this._cancelSignIn.setSensitive(available && signingIn);
        this._signOut.setSensitive(available && !signingIn &&
            (this._view?.connection === 'Connected' || this._view?.plan != null));
    }

    _openUrl(url) {
        try {
            Gio.AppInfo.launch_default_for_uri(url, global.create_app_launch_context(0, -1));
        } catch {
            this._showError('Could not open the default browser.');
        }
    }

    _showError(message) {
        this._error = message;
        this._errorLabel.text = message ?? '';
        this._errorLabel.visible = message !== null;
    }

    _render(view) {
        this._view = view;
        this._demoLabel.visible = Boolean(view.demo);
        for (const meter of this._meters) {
            meter.remaining = remainingForWindow(view.snapshot, meter.minutes);
            meter.value.text = `${meter.label} ${percent(meter.remaining)}`;
            meter.ring.queue_repaint();
        }
        this._details.destroy_all_children();
        this._countdowns = [];
        this._addLabel(view.demo ? 'Codex Usage · DEMO' : 'Codex Usage', 'codex-usage-heading');
        if (!view.snapshot?.buckets.length)
            this._addLabel(view.detail, 'codex-usage-secondary');
        for (const bucket of view.snapshot?.buckets ?? []) {
            this._addLabel(bucket.name, 'codex-usage-bucket');
            if (bucket.windows.length === 0)
                this._addLabel('Quota windows unavailable');
            for (const window of bucket.windows) {
                const remaining = window.remainingPercent === null ? 'Quota unavailable' :
                    `${percent(window.remainingPercent)} remaining`;
                this._addLabel(`${window.durationLabel} · ${remaining}`);
                this._addLabel(resetLabel(window.resetsAt), 'codex-usage-secondary');
                const label = this._addLabel('', 'codex-usage-secondary');
                this._countdowns.push({label, resetsAt: window.resetsAt});
            }
        }
        this._status = this._addLabel('', 'codex-usage-secondary');
        this._errorLabel = this._addLabel('', 'codex-usage-secondary');
        this._showError(this._error ?? null);
        this._updateActions();
        this._tick();
    }

    _addLabel(text, styleClass = '') {
        const label = new St.Label({text, style_class: styleClass});
        label.clutter_text.line_wrap = true;
        label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        this._details.add_child(label);
        return label;
    }

    _tick() {
        const now = Date.now();
        const stale = isStale(this._view, now);
        if (this._stale !== stale) {
            this._stale = stale;
            if (stale)
                this._button.add_style_class_name('codex-usage-stale');
            else
                this._button.remove_style_class_name('codex-usage-stale');
            for (const meter of this._meters)
                meter.ring.queue_repaint();
        }
        const quotas = this._meters.map(({name, remaining}) => remaining === null ?
            `${name} quota unavailable` : `${name} quota ${percent(remaining)} remaining`);
        const accessibleName = ['Codex Usage', this._demo && 'Demo', ...quotas, stale && 'Stale']
            .filter(Boolean).join(', ');
        if (this._button.accessible_name !== accessibleName)
            this._button.accessible_name = accessibleName;
        for (const {label, resetsAt} of this._countdowns)
            label.text = countdown(resetsAt, now);
        const fetchedAt = this._view.snapshot?.fetchedAt;
        const updated = fetchedAt ? ` · Updated ${new Date(fetchedAt).toLocaleTimeString()}` : '';
        this._status.text = `${stale ? 'Stale · ' : ''}${this._view.connection}${updated}`;
    }

    _drawRing({ring, remaining}) {
        const cr = ring.get_context();
        try {
            const [width, height] = ring.get_surface_size();
            const radius = Math.max(0, Math.min(width, height) * 0.38);
            const start = -Math.PI / 2;
            cr.setLineWidth(Math.max(1, radius * 0.3));
            cr.setSourceRGBA(0.65, 0.65, 0.65, 0.45);
            cr.arc(width / 2, height / 2, radius, start, start + 2 * Math.PI);
            cr.stroke();

            const portion = Math.max(0, Math.min(100, remaining ?? 0)) / 100;
            if (portion > 0) {
                cr.setSourceRGBA(0.34, 0.76, 0.60, this._stale ? 0.5 : 1);
                cr.arc(width / 2, height / 2, radius, start, start + 2 * Math.PI * portion);
                cr.stroke();
            }
        } finally {
            cr.$dispose();
        }
    }
}
