/** Isolated fixtures exercise the same public Hydro API used in production. */
export function resolveUpdateMock(name: string, mocks: Record<string, any>, fallback: (name: string) => any) {
    if (mocks[name]) return mocks[name];
    if (name === './lib/update') return mocks['../lib/client-update'];
    if (name === './model') return mocks['../model/client-update'];
    if (name === 'hydrooj') {
        const database = mocks['../service/db'];
        const storage = mocks['../model/storage'] || mocks['./storage'];
        const system = mocks['../model/system'];
        return {
            ...mocks['../service/server'], ...mocks['../error'], ...mocks['../model/builtin'],
            db: database?.default || database,
            hashFile: mocks['../lib/proctor-log']?.hashFile,
            StorageModel: storage?.default || storage,
            SystemModel: system?.default || system,
            OplogModel: mocks['../model/oplog'],
        };
    }
    return fallback(name);
}
