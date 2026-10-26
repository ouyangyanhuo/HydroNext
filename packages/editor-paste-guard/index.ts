import { Context, SettingModel, SystemModel, ValidationError } from 'hydrooj';
import { DEFAULT_PASTE_LIMIT, parsePasteLimit, PASTE_LIMIT_KEY, resolvePasteLimit } from './config';

/** The server distributes policy; this remains a frontend interaction restriction. */
export function apply(ctx: Context) {
    ctx.setting.SystemSetting(SettingModel.Setting('setting_code_paste', PASTE_LIMIT_KEY, DEFAULT_PASTE_LIMIT, 'number',
        'Code paste limit', 'Disable the limit to allow unrestricted pasting. Set 0 to block all pasting.',
        0, (value) => parsePasteLimit(value) !== undefined));
    ctx.on('handler/before/SystemSetting#post', (handler) => {
        const value = handler.args['editor-paste-guard']?.maxLength;
        if (value !== undefined && parsePasteLimit(value) === undefined) throw new ValidationError(PASTE_LIMIT_KEY);
    });
    ctx.on('handler/after', (handler) => {
        handler.UiContext.editorPasteLimit = resolvePasteLimit(SystemModel.get(PASTE_LIMIT_KEY));
    });
}
