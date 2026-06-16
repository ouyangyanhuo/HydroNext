import { readFileSync } from 'fs';
import { join } from 'path';
import { Context } from 'hydrooj';
import yaml from 'js-yaml';

export async function apply(ctx: Context) {
    const logger = ctx.logger('contest-settings');

    // Override Gravatar URL to use Cravatar (Chinese mirror, works in mainland China)
    try {
        await global.Hydro.model.system.set('avatar.gravatar_url', '//cravatar.cn/avatar/');
        logger.info('Gravatar URL set to cravatar.cn');
    } catch (e) {
        logger.warn('Failed to set Gravatar URL: %o', e);
    }

    // Override 'about' setting from our own setting.yaml
    try {
        const settingPath = join(__dirname, 'setting.yaml');
        const settingFile = yaml.load(readFileSync(settingPath, 'utf-8')) as any;
        if (settingFile?.about?.value) {
            await global.Hydro.model.system.set('ui-default.about', settingFile.about.value);
            logger.info('About page content loaded from contest-settings/setting.yaml');
        }
    } catch (e) {
        logger.warn('Failed to load contest-settings/setting.yaml: %o', e);
    }

    // i18n
    ctx.i18n.load('zh', {
        'Paste limit exceeded': '粘贴内容超过30字符限制，请手动输入代码。',
    });
    ctx.i18n.load('en', {
        'Paste limit exceeded': 'Paste exceeds 30 character limit. Please type your code manually.',
    });
}
