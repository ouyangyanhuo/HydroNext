import { Context, UserModel } from 'hydrooj';
import { apply as registerHandlers } from './handler';
import { initialize, resolveFrames } from './model';

export async function apply(ctx: Context) {
    await initialize(ctx);
    await registerHandlers(ctx);
    ctx.on('user/get', async (user) => {
        const id = user._udoc.honorFrameId;
        user.honorFrame = id ? (await resolveFrames([id]))[id] || null : null;
        user._publicFields.push('honorFrame');
    });
    ctx.on('user/render', async (_domainId, users, uids) => {
        // Always resolve ownership from global accounts, never domain-user data.
        const accounts = await UserModel.coll.find({ _id: { $in: uids } })
            .project({ _id: 1, honorFrameId: 1 }).toArray();
        const frames = await resolveFrames(accounts.map((doc) => doc.honorFrameId));
        for (const user of Object.values(users)) {
            user.honorFrame = null;
            delete user.honorFrameId;
            delete user.honorFrameIds;
        }
        for (const account of accounts) {
            if (users[account._id]) users[account._id].honorFrame = frames[account.honorFrameId] || null;
        }
    });
    UserModel._deleteUserCache(true);
    ctx.effect(() => () => { UserModel._deleteUserCache(true); });
}
