import { Context, SettingModel, SystemModel } from 'hydrooj';
import { apply as registerHandlers } from './handler';

export function apply(ctx: Context) {
    ctx.setting.SystemSetting(SettingModel.Setting('setting_basic', 'private-messages.showEntry', true, 'boolean',
        'Show private messages entry', 'Only controls the menu entry; existing messages and direct access remain available.'));
    registerHandlers(ctx);
    ctx.on('handler/after', (handler) => {
        handler.UiContext.privateMessagesEntryVisible = SystemModel.get('private-messages.showEntry') !== false;
    });
}
