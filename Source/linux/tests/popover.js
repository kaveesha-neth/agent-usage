// Loaded by the isolated GNOME Shell smoke session, never shipped to users.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {sleep, waitLeisure} from 'resource:///org/gnome/shell/ui/scripting.js';

const uuid = 'codex-usage@agent-usage';

function check(condition, message) {
    if (!condition)
        throw new Error(message);
}

async function waitFor(find) {
    for (let i = 0; i < 100; i++) {
        const result = find();
        if (result)
            return result;
        await sleep(100);
    }
    throw new Error('Timed out waiting for the quota popover');
}

function actors(parent, className) {
    const found = String(parent.style_class ?? '').split(' ').includes(className) ? [parent] : [];
    for (const child of parent.get_children())
        found.push(...actors(child, className));
    return found;
}

async function checkBars(menu, expected, values) {
    await waitLeisure();
    check(menu.isOpen, 'The quota popover should be open');
    const bars = actors(menu.box, 'codex-usage-progress');
    check(bars.length === expected.length, 'Show a bar for each known quota, but none for unknown values');
    bars.forEach((bar, i) => {
        check(Math.abs(bar.value - expected[i]) < 0.0001, 'Each bar represents quota remaining');
        check(bar.mapped && bar.width > 150 && bar.height > 0, 'Each bar is visible and has a real allocation');
    });
    check(actors(menu.box, 'codex-usage-quota-value').map(actor => actor.text).join(',') === values,
        'Show a readable percentage next to each quota title');
}

export async function run() {
    const extension = await waitFor(() => Main.extensionManager.lookup(uuid)?.stateObj?._button &&
        Main.extensionManager.lookup(uuid).stateObj);
    const menu = extension._button.menu;
    menu.open();
    await checkBars(menu, [0.5275, 0.84], '52.75% left,84% left,Unavailable');
    check(extension._demoBadge.visible && !extension._account.visible && !extension._signIn.visible,
        'Demo is visibly labeled and hides account actions');

    menu.close();
    const stage = GLib.getenv('CODEX_USAGE_SMOKE_STAGE');
    GLib.file_set_contents(`${stage}/demo-popover-ok`, 'ok');

    await waitFor(() => extension._view?.connection === 'Connected');
    menu.open();
    await checkBars(menu, [0.625, 0.84], '62.5% left,84% left');
    check(!extension._demoBadge.visible && extension._account.visible && !extension._signIn.visible &&
        !extension._cancelSignIn.visible, 'A connected account should show the Account submenu only');

    const preview = GLib.getenv('CODEX_USAGE_SMOKE_PREVIEW');
    if (preview) {
        const stream = Gio.File.new_for_path(preview).replace(null, false, Gio.FileCreateFlags.NONE, null);
        const [x, y] = menu.actor.get_transformed_position();
        const [width, height] = menu.actor.get_transformed_size();
        try {
            await new Shell.Screenshot().screenshot_area(Math.floor(x), Math.floor(y),
                Math.floor(width), Math.floor(height), stream);
        } finally {
            stream.close(null);
        }
    }
    extension._account.setSubmenuShown(true);
    check(extension._account.menu.isOpen && extension._signOut.visible, 'Sign-out is available under Account');
    menu.close();
    GLib.file_set_contents(`${stage}/live-popover-ok`, 'ok');

    // Stay alive while the outer smoke test exercises restart and uninstall.
    await new Promise(() => {});
}
