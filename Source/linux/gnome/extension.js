import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {countdown, fiveHourRemaining, isStale, makeDemo, percent, resetLabel} from './usage.js';

export default class CodexUsageExtension extends Extension {
    enable() {
        this._button = new PanelMenu.Button(0.0, 'Codex Usage');
        const panel = new St.BoxLayout({style_class: 'codex-usage-indicator'});
        this._ring = new St.DrawingArea({style_class: 'codex-usage-ring',
            y_align: Clutter.ActorAlign.CENTER});
        this._ring.connect('repaint', () => this._drawRing());
        this._percent = new St.Label({y_align: Clutter.ActorAlign.CENTER});
        panel.add_child(this._ring);
        panel.add_child(this._percent);
        this._button.add_child(panel);

        const detailsItem = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        const scroll = new St.ScrollView({style_class: 'codex-usage-scroll',
            x_expand: true, overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER});
        this._details = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'codex-usage-details'});
        scroll.set_child(this._details);
        detailsItem.add_child(scroll);
        this._button.menu.addMenuItem(detailsItem);
        this._button.menu.addAction('Refresh demo', () => this._render(makeDemo()));
        Main.panel.addToStatusArea(this.uuid, this._button);

        this._render(makeDemo());
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._tick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (this._timer) {
            GLib.Source.remove(this._timer);
            this._timer = null;
        }
        this._button?.destroy();
        this._button = this._details = this._ring = this._percent = null;
        this._status = this._view = this._countdowns = null;
    }

    _render(view) {
        this._view = view;
        this._details.destroy_all_children();
        this._countdowns = [];
        this._addLabel('Codex Usage · DEMO', 'codex-usage-heading');
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
        this._tick();
    }

    _addLabel(text, styleClass = '') {
        const label = new St.Label({text, style_class: styleClass});
        this._details.add_child(label);
        return label;
    }

    _tick() {
        const now = Date.now();
        const remaining = fiveHourRemaining(this._view.snapshot);
        const stale = isStale(this._view, now);
        const text = `DEMO ${percent(remaining)}`;
        if (this._percent.text !== text || this._stale !== stale) {
            this._percent.text = text;
            this._stale = stale;
            this._button.accessible_name = `Codex Usage: ${text} remaining${stale ? ', stale' : ''}`;
            this._ring.queue_repaint();
        }
        for (const {label, resetsAt} of this._countdowns)
            label.text = countdown(resetsAt, now);
        const fetchedAt = this._view.snapshot?.fetchedAt;
        const updated = fetchedAt ? ` · Updated ${new Date(fetchedAt).toLocaleTimeString()}` : '';
        this._status.text = `${stale ? 'Stale · ' : ''}${this._view.connection}${updated}`;
    }

    _drawRing() {
        const cr = this._ring.get_context();
        try {
            const [width, height] = this._ring.get_surface_size();
            const radius = Math.max(0, Math.min(width, height) * 0.38);
            const start = -Math.PI / 2;
            cr.setLineWidth(Math.max(1, radius * 0.3));
            cr.setSourceRGBA(0.65, 0.65, 0.65, 0.45);
            cr.arc(width / 2, height / 2, radius, start, start + 2 * Math.PI);
            cr.stroke();

            const remaining = fiveHourRemaining(this._view?.snapshot);
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
