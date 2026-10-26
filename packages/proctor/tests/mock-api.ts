/** Keep migrated fixtures isolated from the running application and database. */
export function resolveProctorMock(name: string, mocks: Record<string, any>, fallback: (name: string) => any): any {
    if (mocks[name] !== undefined) return mocks[name];
    if (name === '../lib/contest-security' || name === './contest-security') {
        return {
            requireContestAccess: mocks['../lib/proctor-access']?.requireProctorAccess,
            requireContestRecordAccess: async (...args: any[]) => {
                const session = await mocks['../lib/proctor-record-access'].requireProctorRecordAccess(...args);
                return session ? { assert: () => mocks['../model/proctor'].assertAccessSession(session) } : undefined;
            },
        };
    }
    if (name === 'hydrooj') {
        return {
            ...mocks['../error'], ...mocks['../model/builtin'], ...mocks['../service/server'],
            db: mocks['../service/db']?.default,
            ContestModel: mocks['../model/contest'] || mocks['./contest'],
            ContestDetailBaseHandler: mocks['./contest']?.ContestDetailBaseHandler,
            OplogModel: mocks['../model/oplog'],
            ProblemModel: mocks['../model/problem']?.default,
            RecordModel: mocks['../model/record']?.default,
            StorageModel: mocks['../model/storage']?.default,
            SystemModel: mocks['../model/system']?.default,
            hashFile: mocks['../lib/proctor-log']?.hashFile,
        };
    }
    const aliases = { './lib/proctor': '../lib/proctor', './lib/proctor-log': '../lib/proctor-log',
        './model/store': '../model/proctor', '../model/store': '../model/proctor' };
    if (aliases[name] && mocks[aliases[name]]) return mocks[aliases[name]];
    return fallback(name);
}
