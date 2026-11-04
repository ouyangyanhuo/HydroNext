import { escapeRegExp } from 'lodash';
import { Filter } from 'mongodb';
import { BadRequestError, NotAssignedError } from '../error';
import { Tdoc } from '../interface';
import { PERM } from '../model/builtin';
import * as contest from '../model/contest';
import user from '../model/user';
import type { Handler } from '../service/server';

/** Keep autocomplete and the contest list on the same visibility policy, including plugin filters. */
export async function getContestListFilter(handler: Handler, domainId: string, rule = '', group = '', q = '') {
    if (rule && contest.RULES[rule].hidden) throw new BadRequestError();
    const groups = (await user.listGroup(domainId, handler.user.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST) ? undefined : handler.user._id))
        .map((i) => i.name);
    if (group && !groups.includes(group)) throw new NotAssignedError(group);
    const rules = Object.keys(contest.RULES).filter((i) => !contest.RULES[i].hidden);
    const escaped = escapeRegExp(q.toLowerCase());
    const $regex = new RegExp(q.length >= 2 ? escaped : `^${escaped}`, 'i');
    const filter: Filter<Tdoc> = {
        ...(handler.user.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST) && !group)
            ? {}
            : {
                $or: [
                    { maintainer: handler.user._id },
                    { owner: handler.user._id },
                    { assign: { $in: groups } },
                    { assign: { $size: 0 } },
                ],
            },
        ...rule ? { rule } : { rule: { $in: rules } },
        ...group ? { assign: { $in: [group] } } : {},
        ...q ? { title: { $regex } } : {},
    };
    await handler.ctx.parallel('contest/list', filter, handler);
    return { filter, groups };
}
