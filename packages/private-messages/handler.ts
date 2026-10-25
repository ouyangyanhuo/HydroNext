import { ObjectId } from 'mongodb';
import {
    avatar, Context, Handler, MessageModel as message, param, PermissionError,
    PRIV, Types, UserModel as user, UserNotFoundError,
} from 'hydrooj';

export class HomeMessagesHandler extends Handler {
    async get() {
        // TODO(iceboy): projection, pagination.
        const messages = await message.getByUser(this.user._id);
        const uids = new Set<number>([
            ...messages.map((mdoc) => mdoc.from),
            ...messages.flatMap((mdoc) => mdoc.to),
        ]);
        const udict = await user.getList(this.domain._id, Array.from(uids));
        // TODO(twd2): improve here:
        const parsed = {};
        for (const m of messages) {
            const raw = m.from === this.user._id ? m.to : m.from;
            const targetArr = Array.isArray(raw) ? raw : [raw];
            for (const target of targetArr) {
                const targetUser = udict[target] || { _id: target, uname: String(target), avatar: '' };
                parsed[target] ||= {
                    _id: target,
                    udoc: {
                        ...targetUser,
                        avatarUrl: targetUser.avatar ? avatar(targetUser.avatar) : '',
                    },
                    messages: [],
                };
                parsed[target].messages.push(m);
            }
        }
        await user.setById(this.user._id, { unreadMsg: 0 });
        this.response.body = { messages: parsed };
        this.response.template = 'home_messages.html';
    }

    @param('uid', Types.PositiveInt)
    @param('content', Types.Content)
    async postSend(domainId: string, uid: number, content: string) {
        this.checkPriv(PRIV.PRIV_SEND_MESSAGE);
        const udoc = await user.getById(domainId, uid);
        if (!udoc) throw new UserNotFoundError(uid);
        if (udoc.avatar) udoc.avatarUrl = avatar(udoc.avatar);
        const mdoc = await message.send(this.user._id, uid, content, message.FLAG_UNREAD);
        this.back({ mdoc, udoc });
    }

    @param('messageId', Types.ObjectId)
    async postDeleteMessage({ }, messageId: ObjectId) {
        const msg = await message.get(messageId);
        if (msg?.from === this.user._id) await message.del(messageId);
        else throw new PermissionError();
        this.back();
    }
}

export function apply(ctx: Context) {
    ctx.Route('home_messages', '/home/messages', HomeMessagesHandler, PRIV.PRIV_USER_PROFILE);
}
