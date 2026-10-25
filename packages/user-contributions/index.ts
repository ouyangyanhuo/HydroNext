import { Context } from 'hydrooj';
import { getUserContributions } from './model';

export function apply(ctx: Context) {
    const logger = ctx.logger('user-contributions');
    ctx.on('user/profile', async (_handler, uid, data) => {
        if (!Number.isSafeInteger(uid) || uid <= 0) return;
        try {
            data.contributions = await getUserContributions(uid);
        } catch (error) {
            // An optional statistics panel must not make the user profile unusable.
            logger.warn('Failed to load contribution history for user %d: %o', uid, error);
        }
    });
}
