import { Context } from 'hydrooj';

export async function apply(ctx: Context) {
    const logger = ctx.logger('contest-settings');

    // Override Gravatar URL to use Cravatar (Chinese mirror, works in mainland China)
    try {
        await global.Hydro.model.system.set('avatar.gravatar_url', '//cravatar.cn/avatar/');
        logger.info('Gravatar URL set to cravatar.cn');
    } catch (e) {
        logger.warn('Failed to set Gravatar URL: %o', e);
    }

    // i18n
    ctx.i18n.load('zh', {
        'Paste limit exceeded': '粘贴内容超过30字符限制，请手动输入代码。',
    });
    ctx.i18n.load('en', {
        'Paste limit exceeded': 'Paste exceeds 30 character limit. Please type your code manually.',
    });
}
