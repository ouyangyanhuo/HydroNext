/** Adapt isolated fixtures to the addon public API without loading a database. */
export function resolveContestMock(name: string, mocks: Record<string, any>, fallback: (name: string) => any) {
    if (mocks[name] !== undefined) return mocks[name];
    if (name === 'hydrooj') {
        return {
            ...mocks['../error'], ...mocks['../model/builtin'], ...mocks['../service/server'],
            db: mocks['../service/db']?.default,
            DocumentModel: mocks['./document'],
            ContestModel: mocks['../model/contest'],
            OplogModel: mocks['../model/oplog'],
        };
    }
    if (name === '../lib/activity') return mocks['../lib/contest-activity'];
    if (name === '../model/activity') return mocks['../model/contest-activity'];
    if (name === '../model/announcements') return mocks['../model/contest-announcement'];
    return fallback(name);
}
