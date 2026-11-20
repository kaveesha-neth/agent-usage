import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {BarLevel} from 'resource:///org/gnome/shell/ui/barLevel.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {HelperClient, IncompatibleHelper} from './helper.js';
import {accountAction, countdown, isStale, makeDemo, panelWindows, percent,
    quotaLevel, quotaSections, remainingForWindow, resetLabel} from './usage.js';

const usageDashboard = 'https://chatgpt.com/codex/settings/usage';
const updatedTime = new Intl.DateTimeFormat(undefined, {hour: 'numeric', minute: '2-digit'});

function box(parent, styleClass, orientation = Clutter.Orientation.VERTICAL) {
    const actor = new St.BoxLayout({style_class: styleClass, orientation, x_expand: true});
    parent.add_child(actor);
    return actor;
}

function label(parent, text, styleClass, options = {}) {
    const opacity = ['codex-usage-secondary', 'codex-usage-bucket'].includes(styleClass) ? 215 : 255;
    const actor = new St.Label({text, style_class: styleClass, opacity, ...options});
    actor.clutter_text.line_wrap = true;
    actor.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
    parent.add_child(actor);
    return actor;
}

function staticItem(menu, styleClass) {
    const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false,
        style_class: styleClass});
    item.add_style_class_name('codex-usage-static');
    menu.addMenuItem(item);
    return item;
}

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

        const menu = this._button.menu;
        const heading = box(staticItem(menu, 'codex-usage-header'), 'codex-usage-heading-group');
        const titleRow = box(heading, 'codex-usage-title-row', Clutter.Orientation.HORIZONTAL);
        label(titleRow, 'Codex Usage', 'codex-usage-heading', {x_expand: true});
        this._demoBadge = label(titleRow, 'DEMO', 'codex-usage-demo-badge', {y_align: Clutter.ActorAlign.CENTER});
        this._status = label(heading, '', 'codex-usage-secondary');

        const detailsItem = staticItem(menu, 'codex-usage-content');
        const scroll = new St.ScrollView({style_class: 'codex-usage-scroll',
            x_expand: true, reactive: true, overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER});
        this._details = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'codex-usage-details'});
        scroll.set_child(this._details);
        detailsItem.add_child(scroll);
        this._notice = staticItem(menu, 'codex-usage-notice');
        this._errorLabel = label(this._notice, '', 'codex-usage-error', {x_expand: true});
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._signIn = menu.addAction('Sign in with ChatGPT', () => this._send('sign-in'), 'avatar-default-symbolic');
        this._cancelSignIn = menu.addAction('Cancel sign-in', () => this._send('cancel-sign-in'), 'process-stop-symbolic');
        menu.addAction('Refresh', () => this._refresh(), 'view-refresh-symbolic');
        menu.addAction('Usage dashboard', () => this._openUrl(usageDashboard), 'web-browser-symbolic');
        menu.addAction('Preferences', () => this.openPreferences(), 'preferences-system-symbolic');
        this._account = new PopupMenu.PopupSubMenuMenuItem('Account', true);
        this._account.icon.icon_name = 'avatar-default-symbolic';
        menu.addMenuItem(this._account);
        this._signOut = this._account.menu.addAction('Sign out of shared Codex session',
            () => this._send('sign-out'), 'system-log-out-symbolic');
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
        this._status = this._notice = this._errorLabel = this._view = this._countdowns = this._demoBadge = null;
        this._signIn = this._cancelSignIn = this._signOut = this._account = null;
    }

    _switchMode() {
        this._stopHelper();
        this._failures = 0;
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
        const started = Date.now();
        let incompatible = false;
        this._updateActions();
        try {
            await client.read(message => {
                if (this._client === client)
                    this._onMessage(message);
            });
        } catch (error) {
            incompatible = error instanceof IncompatibleHelper;
        } finally {
            if (this._client === client) {
                this._client = null;
                this._busy = false;
                if (incompatible) {
                    this._render({snapshot: null, connection: 'Update required', stale: false,
                        detail: 'Reinstall the latest Linux bundle, then log out and back in.'});
                } else {
                    if (Date.now() - started >= 60_000)
                        this._failures = 0;
                    const delay = Math.min(180_000, 5000 * 2 ** this._failures);
                    this._failures = Math.min(this._failures + 1, 6);
                    this._retryAt = Date.now() + delay;
                    this._render({...this._view, connection: 'Disconnected', stale: true,
                        detail: 'The quota helper stopped. Reconnecting…'});
                }
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
        else if (this._client?.ready)
            this._send('refresh');
        else
            this._startHelper();
    }

    async _send(command) {
        const client = this._client;
        if (!client?.ready || (command !== 'refresh' && this._busy))
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
        const available = Boolean(this._client?.ready) && !this._busy;
        const action = accountAction(this._view);
        this._signIn.visible = action === 'sign-in';
        this._cancelSignIn.visible = action === 'cancel';
        this._account.visible = action === 'manage';
        this._signIn.setSensitive(available);
        this._cancelSignIn.setSensitive(available);
        this._signOut.setSensitive(available);
        if (!this._account.visible)
            this._account.setSubmenuShown(false);
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
        this._notice.visible = message !== null;
    }

    _render(view) {
        this._view = view;
        this._demoLabel.visible = Boolean(view.demo);
        this._demoBadge.visible = Boolean(view.demo);
        for (const meter of this._meters) {
            meter.remaining = remainingForWindow(view.snapshot, meter.minutes);
            meter.value.text = `${meter.label} ${percent(meter.remaining)}`;
            meter.ring.queue_repaint();
        }
        this._details.destroy_all_children();
        this._countdowns = [];
        const sections = quotaSections(view.snapshot);
        if (sections.length === 0 || (view.connection !== 'Connected' && !view.demo))
            label(this._details, view.detail, 'codex-usage-secondary');
        for (const {title, rows, main} of sections) {
            const section = box(this._details, 'codex-usage-quota-section');
            if (!main || sections.length > 1)
                label(section, title, 'codex-usage-bucket');
            if (rows.length === 0)
                label(section, 'No quota windows reported', 'codex-usage-secondary');
            for (const row of rows)
                this._addQuotaRow(section, row);
        }
        this._showError(this._error ?? null);
        this._updateActions();
        this._tick();
    }

    _addQuotaRow(section, {title, remainingPercent, resetsAt}) {
        const level = quotaLevel(remainingPercent);
        const row = box(section, 'codex-usage-quota-card');
        const heading = box(row, 'codex-usage-quota-heading', Clutter.Orientation.HORIZONTAL);
        label(heading, title, 'codex-usage-quota-title', {x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        label(heading, remainingPercent === null ? 'Unavailable' : `${percent(remainingPercent)} left`,
            `codex-usage-quota-value codex-usage-value-${level}`, {y_align: Clutter.ActorAlign.CENTER});

        if (remainingPercent !== null) {
            row.add_child(new BarLevel({style_class: `codex-usage-progress codex-usage-progress-${level}`,
                value: remainingPercent / 100, x_expand: true, accessible_name: `${title}, quota remaining`}));
        }
        const timing = box(row, 'codex-usage-timing', Clutter.Orientation.HORIZONTAL);
        label(timing, resetLabel(resetsAt), 'codex-usage-secondary', {x_expand: true});
        if (resetsAt !== null) {
            const clock = label(timing, '', 'codex-usage-countdown');
            this._countdowns.push({label: clock, resetsAt});
        }
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
        const updated = fetchedAt ? ` · Updated ${updatedTime.format(new Date(fetchedAt))}` : '';
        this._status.text = this._view.demo ? 'Sample quota data' :
            `${stale ? 'Stale · ' : ''}${this._view.connection}${updated}`;
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
