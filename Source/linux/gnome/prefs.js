import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CodexUsagePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({title: 'Codex Usage', icon_name: 'utilities-system-monitor-symbolic'});
        const group = new Adw.PreferencesGroup({title: 'Usage indicator'});
        const demo = new Adw.SwitchRow({title: 'Demo mode', subtitle: 'Show synthetic quota without connecting to Codex'});
        settings.bind('demo-mode', demo, 'active', Gio.SettingsBindFlags.DEFAULT);
        const executable = new Adw.EntryRow({title: 'Absolute Codex CLI path (optional)',
            text: settings.get_string('codex-path'), show_apply_button: true});
        executable.connect('apply', row => settings.set_string('codex-path', row.text.trim()));
        group.add(demo);
        group.add(executable);
        page.add(group);
        window.add(page);
    }
}
