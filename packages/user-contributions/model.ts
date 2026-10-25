import { RecordModel, STATUS } from 'hydrooj';
import { buildUserContributions, CONTRIBUTION_TIME_ZONE } from './statistics';
import type { UserContributionDay } from './types';

export async function getUserContributions(uid: number) {
    // Count the earliest accepted submission per domain/problem. Submission
    // time stays stable when a record is rejudged; judgeAt does not.
    const days = await RecordModel.coll.aggregate<UserContributionDay>([
        {
            $match: {
                uid,
                status: STATUS.STATUS_ACCEPTED,
                contest: { $nin: [RecordModel.RECORD_PRETEST, RecordModel.RECORD_GENERATE] },
            },
        },
        { $group: { _id: { domainId: '$domainId', pid: '$pid' }, firstRecord: { $min: '$_id' } } },
        {
            $group: {
                _id: { $dateToString: { date: { $toDate: '$firstRecord' }, format: '%Y-%m-%d', timezone: CONTRIBUTION_TIME_ZONE } },
                count: { $sum: 1 },
            },
        },
        { $project: { _id: 0, date: '$_id', count: 1 } },
    ]).toArray();
    return buildUserContributions(days);
}
